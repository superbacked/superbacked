import assert from "assert"
import { mkdtemp, readFile, writeFile } from "fs/promises"
import { suite, test } from "node:test"
import { tmpdir } from "os"
import { join } from "path"

import {
  LegacyPayload,
  Payload,
  encryptBlock,
  validateCreate,
} from "@/src/handlers/create"
import restore from "@/src/handlers/restore"
import {
  createStandaloneArchive,
  restoreStandaloneArchive,
} from "@/src/handlers/standaloneArchive"
import {
  legacyKdfProfile,
  v2StandardKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"
import {
  blockSize,
  computeBlockKdfKey,
  deriveBlockKey,
} from "@/src/utilities/core/block"
import { computeArchiveKeys } from "@/src/utilities/core/standaloneArchive"
import argon2 from "@/src/utilities/crypto/argon2"
import { encrypt } from "@/src/utilities/crypto/fixedSizeEncryption"
import { encrypt as legacyEncrypt } from "@/src/utilities/crypto/legacyFixedSizeEncryption"
import { generateSalt } from "@/src/utilities/crypto/primitives"
import {
  encodeProbeBlock,
  encodeSchemeHeader,
} from "@/src/utilities/crypto/schemeHeader"
import { generateShares } from "@/src/utilities/crypto/shamir"

// The create → payload → restore pipeline through the real handlers —
// the orchestration the unit and reference suites sit beneath: profile
// trial gating, error classification and blockset share accumulation.
// The create handler itself renders QR images in a live window, so
// creation enters at encryptBlock, the crypto it wraps. Argon2 runs make
// this a slow suite (four stretches at the paranoid profile).

const passphrase = "pipeline reference passphrase one"
const secondPassphrase = "pipeline reference passphrase two"

suite("blockPipeline", () => {
  test("creates and restores a standard block, classifying a wrong passphrase", async () => {
    const payload = await encryptBlock(
      [{ message: "pipeline secret", passphrase }],
      false,
      false,
      "pipeline"
    )
    assert.strictEqual(payload.metadata.label, "pipeline")
    const result = await restore(passphrase, payload)
    assert.ok(result.success === true)
    assert.strictEqual(result.message, "pipeline secret")
    const wrong = await restore("wrong passphrase entirely", payload)
    assert.ok(wrong.success === false)
    assert.strictEqual(wrong.error, "Secret not found")
    assert.strictEqual(wrong.unsupportedVersion, undefined)
  })

  test("creates and restores a multi-secret block", async () => {
    const payload = await encryptBlock(
      [
        { message: "first secret", passphrase },
        { message: "second secret", passphrase: secondPassphrase },
      ],
      false,
      false
    )
    const first = await restore(passphrase, payload)
    assert.ok(first.success === true)
    assert.strictEqual(first.message, "first secret")
    const second = await restore(secondPassphrase, payload)
    assert.ok(second.success === true)
    assert.strictEqual(second.message, "second secret")
  })

  test("restores a paranoid block only with the mode enabled", async () => {
    const payload = await encryptBlock(
      [{ message: "paranoid secret", passphrase }],
      false,
      true
    )
    // Off, the paranoid row is never trialed — the deliberate contract:
    // a paranoid block reports a wrong passphrase until the mode is on
    const withoutMode = await restore(passphrase, payload, false)
    assert.ok(withoutMode.success === false)
    assert.strictEqual(withoutMode.error, "Secret not found")
    const withMode = await restore(passphrase, payload, true)
    assert.ok(withMode.success === true)
    assert.strictEqual(withMode.message, "paranoid secret")
  })

  test("accumulates blockset shares across restores, ignoring duplicates", async () => {
    // Replicates the create handler’s Shamir orchestration (one share of
    // each secret per block — see the shamir branch in
    // src/handlers/create.ts)
    const shares = await generateShares("blockset secret", 3, 2)
    const payloads: Payload[] = []
    for (const share of shares) {
      payloads.push(
        await encryptBlock([{ message: share, passphrase }], true, false)
      )
    }
    assert.ok(payloads[0] !== undefined && payloads[1] !== undefined)
    const accumulated: Buffer[] = []
    // One share cannot combine — the restore fails and keeps the share
    // (the error text belongs to the combine binary and is not pinned)
    const first = await restore(
      passphrase,
      payloads[0],
      false,
      undefined,
      accumulated
    )
    assert.ok(first.success === false)
    assert.strictEqual(accumulated.length, 1)
    // The same block again adds nothing
    const duplicate = await restore(
      passphrase,
      payloads[0],
      false,
      undefined,
      accumulated
    )
    assert.ok(duplicate.success === false)
    assert.strictEqual(accumulated.length, 1)
    // A second distinct share meets the 2-of-3 threshold
    const second = await restore(
      passphrase,
      payloads[1],
      false,
      undefined,
      accumulated
    )
    assert.ok(second.success === true)
    assert.strictEqual(second.message, "blockset secret")
  })

  test("fails to create blocksets with YubiKey slots or invalid thresholds", () => {
    // The guards live in validateCreate — the handler wrapping it renders
    // in a live window (see src/handlers/create.ts)
    assert.throws(
      () =>
        validateCreate(
          [{ message: "secret", passphrase, slot: 2 }],
          true,
          3,
          2
        ),
      { message: "YubiKey protection is not supported for blocksets" }
    )
    assert.throws(
      () => validateCreate([{ message: "secret", passphrase }], true, 2, 3),
      {
        message: "Invalid number of shares or threshold",
      }
    )
    assert.throws(
      () => validateCreate([{ message: "secret", passphrase }], true),
      {
        message: "Invalid number of shares or threshold",
      }
    )
    // Standard blocks accept slots and need no share arithmetic
    validateCreate([{ message: "secret", passphrase, slot: 2 }], false)
    validateCreate([{ message: "secret", passphrase }], true, 3, 2)
  })

  test("restores legacy payloads, failing slots and wrong passphrases on them", async () => {
    const legacyKdf = (kdfPassphrase: string, salt: string) =>
      argon2(kdfPassphrase, salt, legacyKdfProfile)
    const block = await legacyEncrypt(
      [{ message: "legacy secret", passphrase }],
      legacyKdf
    )
    const payload: LegacyPayload = {
      salt: block.salt.toString("base64"),
      iv: block.iv.toString("base64"),
      headers: block.headers.toString("base64"),
      data: block.data.toString("base64"),
      metadata: {},
    }
    const result = await restore(passphrase, payload)
    assert.ok(result.success === true)
    assert.strictEqual(result.message, "legacy secret")
    // Legacy blocks predate YubiKey protection — a slot fails exactly
    // like a wrong passphrase, before any key derivation
    const withSlot = await restore(passphrase, payload, false, 2)
    assert.ok(withSlot.success === false)
    assert.strictEqual(withSlot.error, "Secret not found")
    const wrong = await restore("wrong passphrase entirely", payload)
    assert.ok(wrong.success === false)
    assert.strictEqual(wrong.error, "Header not found")
    assert.strictEqual(wrong.unsupportedVersion, undefined)
  })

  test("classifies legacy blockset shares by prefix and shape", async () => {
    const legacyKdf = (kdfPassphrase: string, salt: string) =>
      argon2(kdfPassphrase, salt, legacyKdfProfile)
    // Share-shaped: shamir: prefix, long enough and never valid UTF-8
    // (see classifyPrefixedShare in src/handlers/restore.ts)
    const share = Buffer.alloc(60, 0xff)
    const block = await legacyEncrypt(
      [
        {
          message: Buffer.concat([Buffer.from("shamir:"), share]),
          passphrase,
        },
      ],
      legacyKdf
    )
    const payload: LegacyPayload = {
      salt: block.salt.toString("base64"),
      iv: block.iv.toString("base64"),
      headers: block.headers.toString("base64"),
      data: block.data.toString("base64"),
      metadata: {},
    }
    const accumulated: Buffer[] = []
    // One share cannot combine — the classification routed the message
    // into share accumulation rather than returning it as a secret
    const result = await restore(
      passphrase,
      payload,
      false,
      undefined,
      accumulated
    )
    assert.ok(result.success === false)
    assert.strictEqual(accumulated.length, 1)
    assert.deepStrictEqual(accumulated[0], share)
  })

  test("classifies future versions and headerless payloads", async () => {
    const salt = generateSalt()
    const kdfKey = await computeBlockKdfKey(
      passphrase,
      salt,
      v2StandardKdfProfile
    )
    const craft = (message: Buffer): Payload => {
      return {
        salt: salt.toString("base64"),
        data: encrypt(
          [{ key: deriveBlockKey(kdfKey), message }],
          blockSize
        ).toString("base64"),
        metadata: {},
      }
    }
    // A future version decrypts, then reports as such — never as a wrong
    // passphrase
    const future = await restore(
      passphrase,
      craft(
        Buffer.concat([encodeSchemeHeader(3), Buffer.from("future secret")])
      )
    )
    assert.ok(future.success === false)
    assert.strictEqual(future.unsupportedVersion, true)
    // A headerless plaintext (pre-release beta blocks) fails like a
    // wrong passphrase
    const headerless = await restore(
      passphrase,
      craft(Buffer.from("headerless secret"))
    )
    assert.ok(headerless.success === false)
    assert.strictEqual(headerless.error, "Secret not found")
    assert.strictEqual(headerless.unsupportedVersion, undefined)
  })
})

suite("standaloneArchivePipeline", () => {
  const createFixture = async (): Promise<{
    archivePath: string
    filePath: string
    outputDir: string
  }> => {
    const directory = await mkdtemp(join(tmpdir(), "superbacked-pipeline-"))
    const filePath = join(directory, "pipeline.txt")
    await writeFile(filePath, "standalone archive pipeline content")
    return {
      archivePath: join(directory, "backup.superbacked"),
      filePath,
      outputDir: await mkdtemp(join(tmpdir(), "superbacked-pipeline-out-")),
    }
  }

  test("creates and restores an archive, classifying a wrong passphrase", async () => {
    const fixture = await createFixture()
    const created = await createStandaloneArchive(
      [fixture.filePath],
      fixture.archivePath,
      passphrase,
      false
    )
    assert.ok(created.success === true)
    assert.strictEqual(created.manifest[0]?.name, "pipeline.txt")
    const restored = await restoreStandaloneArchive(
      fixture.archivePath,
      fixture.outputDir,
      passphrase,
      false
    )
    assert.ok(restored.success === true)
    const entry = restored.files.find((file) => file.endsWith("pipeline.txt"))
    assert.ok(entry !== undefined)
    assert.strictEqual(
      await readFile(join(fixture.outputDir, entry), "utf-8"),
      "standalone archive pipeline content"
    )
    const wrong = await restoreStandaloneArchive(
      fixture.archivePath,
      fixture.outputDir,
      "wrong passphrase entirely",
      false
    )
    assert.ok(wrong.success === false)
    assert.strictEqual(wrong.authenticationFailed, true)
    assert.strictEqual(wrong.unsupportedVersion, undefined)
  })

  test("restores a paranoid archive only with the mode enabled", async () => {
    const fixture = await createFixture()
    const created = await createStandaloneArchive(
      [fixture.filePath],
      fixture.archivePath,
      passphrase,
      true
    )
    assert.ok(created.success === true)
    const withoutMode = await restoreStandaloneArchive(
      fixture.archivePath,
      fixture.outputDir,
      passphrase,
      false
    )
    assert.ok(withoutMode.success === false)
    assert.strictEqual(withoutMode.authenticationFailed, true)
    const withMode = await restoreStandaloneArchive(
      fixture.archivePath,
      fixture.outputDir,
      passphrase,
      true
    )
    assert.ok(withMode.success === true)
  })

  test("reports archives from a newer version", async () => {
    const fixture = await createFixture()
    const created = await createStandaloneArchive(
      [fixture.filePath],
      fixture.archivePath,
      passphrase,
      false
    )
    assert.ok(created.success === true)
    // Splice in a probe declaring version 3 under the archive’s own
    // probe key — the cascade must report the version, never a wrong
    // passphrase
    const file = await readFile(fixture.archivePath)
    const keys = await computeArchiveKeys(
      passphrase,
      file.subarray(0, 16),
      v2StandardKdfProfile
    )
    encodeProbeBlock(keys.probeKey, 3).copy(file, 16)
    await writeFile(fixture.archivePath, file)
    const result = await restoreStandaloneArchive(
      fixture.archivePath,
      fixture.outputDir,
      passphrase,
      false
    )
    assert.ok(result.success === false)
    assert.strictEqual(result.unsupportedVersion, true)
    assert.strictEqual(result.authenticationFailed, false)
  })
})
