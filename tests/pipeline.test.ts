import assert from "assert"
import { randomBytes } from "crypto"
import { mkdtemp, readFile, writeFile } from "fs/promises"
import { suite, test } from "node:test"
import { tmpdir } from "os"
import { join } from "path"

import { LegacyPayload } from "@/src/handlers/create"
import {
  createDetachedArchive,
  describeDetachedArchive,
  restoreDetachedArchive,
} from "@/src/handlers/detachedArchive"
import restore from "@/src/handlers/restore"
import {
  createStandaloneArchive,
  restoreStandaloneArchive,
} from "@/src/handlers/standaloneArchive"
import {
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/kdfProfiles"
import {
  Payload,
  blockSize,
  computeBlockKdfKey,
  deriveBlockKey,
  encodeBlockContent,
  encryptBlock,
} from "@/src/utilities/core/block"
import { encryptBlockset } from "@/src/utilities/core/blockset"
import {
  deriveDetachedArchiveKeys,
  deriveProbeKey,
} from "@/src/utilities/core/detachedArchive"
import { deriveLegacyDetachedArchiveKeys } from "@/src/utilities/core/legacy/detachedArchive"
import { computeArchiveKeys } from "@/src/utilities/core/standaloneArchive"
import { encrypt } from "@/src/utilities/crypto/fixedSizeEncryption"
import { generateSalt } from "@/src/utilities/crypto/primitives"
import {
  encodeProbeBlock,
  encodeSchemeHeader,
} from "@/src/utilities/crypto/schemeHeader"

// The create → payload → restore pipeline through the real handlers —
// the orchestration the unit and reference suites sit beneath: profile
// trial gating, error classification and blockset share accumulation.
// The create handler itself renders QR images in a live window, so
// creation enters at encryptBlock (src/utilities/core/block.ts), the
// scheme operation the handler wraps with rendering. Argon2 runs make
// this a slow suite (four stretches at the paranoid profile).

const passphrase = "pipeline reference passphrase one"
const secondPassphrase = "pipeline reference passphrase two"

suite("blockPipeline", () => {
  test("creates and restores a standard block, classifying a wrong passphrase", async () => {
    const payload = await encryptBlock(
      [{ message: "pipeline secret", passphrase }],
      false,
      standardKdfProfile,
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
      standardKdfProfile
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
      paranoidKdfProfile
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
    const payloads = await encryptBlockset(
      [{ message: "blockset secret", passphrase }],
      3,
      2,
      standardKdfProfile
    )
    assert.strictEqual(payloads.length, 3)
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

  test("restores legacy payloads, failing slots and wrong passphrases on them", async () => {
    // Frozen legacy payload holding "legacy secret" under the suite
    // passphrase, stretched at the legacy profile — generated once with
    // the removed legacy encrypt, as nothing creates legacy blocks
    // anymore
    const payload: LegacyPayload = {
      salt: "Wgu0rfS/tL/SbI+/3dDYRA==",
      iv: "xWHoo87GdtrXBBIX8hPiOw==",
      headers:
        "b8Vt/WBLnae5Wt0UHLKNdT9hY1oV+v66YwCGDH7m7Ow8inXIiRabVAdEmIf758hp5vLb6nwrV1mcWL9tlJPY6w==",
      data: "1JLBOqH0iStwJfJDvOuvVgJmAv8ZfnD+k0DjEeKx6oguz7Nfpp7TKLrFHx9pb0JdcHFwWgSBgYce37gVu/UXK3ceVhBDGHy6FO883hgwmdb5dBGWrL/zBGCawKbkDKNFMVa1wiGIx/ZVl4fWD0CHTtYlKXrcwpBqagurOqwoQew=",
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
    // Share-shaped: shamir: prefix, long enough and never valid UTF-8
    // (see classifyPrefixedShare in src/utilities/core/legacy/blockset.ts)
    const share = Buffer.alloc(60, 0xff)
    // Frozen legacy payload holding that share under the suite
    // passphrase — generated once with the removed legacy encrypt
    const payload: LegacyPayload = {
      salt: "s0q6TEE21X1ZedMPxemztQ==",
      iv: "OOw5To/1RIikUgrdY1K26g==",
      headers:
        "kPcjDYYkJhjU+kl2Zcm450mGNLEOgcm7LqWoMUAgUHVXnC6r1AGdJGyg+3M0bPpQcvpOpQodnz/QkQKkwP6HLg==",
      data: "m1UO6Ew2B/rhyAEnNBpcjMcIiOW+8IInPpbKHeivMmMeXgqfd/Pj675tsHLnJz65w8NQ/M5aMnCndN3wtP+Cd97Dju75BWbR6aqDnFQiZKTMrjP2tkAK/YGJn6slBUt3pinsA7jqmo0pOx8j2V+P1wDe7lW7OEVddvKD4jf4lXJh4NBG+i8HhWzuBWEkoHhvyfb43Sv11ntZYspRcFm1HJYL35qjqI4JdPsNNXrlCMC/6h26OoU8KomhHWz2BQaO",
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
      standardKdfProfile
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
      standardKdfProfile
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

suite("detachedArchivePipeline", () => {
  test("creates and restores a detached archive through the handlers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "superbacked-test-"))
    const filePath = join(directory, "secret.txt")
    await writeFile(filePath, "pipeline archive content")
    const masterKey = randomBytes(32).toString("base64")
    const blockContent = encodeBlockContent(
      "pipeline archive secret",
      masterKey
    )
    // The block’s era selects the chain the renderer names the file by —
    // and restoration re-detects the scheme by probe, never by the flag
    const described = describeDetachedArchive(blockContent, false)
    assert.ok(described !== null)
    assert.strictEqual(
      described.filename,
      deriveDetachedArchiveKeys(Buffer.from(masterKey, "base64")).filename
    )
    assert.strictEqual(
      describeDetachedArchive(blockContent, true)?.filename,
      deriveLegacyDetachedArchiveKeys(Buffer.from(masterKey, "base64")).filename
    )
    const archivePath = join(directory, `${described.filename}.superbacked`)
    const created = await createDetachedArchive(
      [filePath],
      archivePath,
      blockContent
    )
    assert.ok(created.success === true)
    const outputDir = await mkdtemp(
      join(tmpdir(), "superbacked-test-restored-")
    )
    const restored = await restoreDetachedArchive(
      archivePath,
      outputDir,
      blockContent
    )
    assert.ok(restored.success === true)
    const restoredPath = restored.files[0]
    assert.ok(restoredPath !== undefined)
    assert.strictEqual(
      await readFile(join(outputDir, restoredPath), "utf-8"),
      "pipeline archive content"
    )
    // The HMAC binds the archive to its block content — any other content
    // fails even though the master key would decrypt
    const altered = await restoreDetachedArchive(
      archivePath,
      outputDir,
      encodeBlockContent("altered secret", masterKey)
    )
    assert.ok(altered.success === false)
    assert.strictEqual(altered.unsupportedVersion, undefined)
  })

  // The probe → legacy fallback is pinned against the real legacy
  // reference pair (see tests/referenceBlocks.test.ts)

  test("classifies future versions without falling back", async () => {
    const directory = await mkdtemp(join(tmpdir(), "superbacked-test-"))
    const filePath = join(directory, "secret.txt")
    await writeFile(filePath, "pipeline archive content")
    const masterKey = randomBytes(32)
    const blockContent = encodeBlockContent(
      "pipeline archive secret",
      masterKey.toString("base64")
    )
    const archivePath = join(directory, "archive.superbacked")
    const created = await createDetachedArchive(
      [filePath],
      archivePath,
      blockContent
    )
    assert.ok(created.success === true)
    // Splice in a probe declaring version 3 under the archive’s own probe
    // key — the consumer must report the version, never fall back to the
    // legacy scheme
    const file = await readFile(archivePath)
    const keys = deriveDetachedArchiveKeys(masterKey)
    encodeProbeBlock(deriveProbeKey(keys.encryptionKey), 3).copy(file, 0)
    await writeFile(archivePath, file)
    const outputDir = await mkdtemp(
      join(tmpdir(), "superbacked-test-restored-")
    )
    const result = await restoreDetachedArchive(
      archivePath,
      outputDir,
      blockContent
    )
    assert.ok(result.success === false)
    assert.strictEqual(result.unsupportedVersion, true)
  })
})
