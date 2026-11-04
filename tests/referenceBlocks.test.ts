import assert from "assert"
import { createHmac } from "crypto"
import { readFileSync, readdirSync } from "fs"
import { mkdtemp, readFile } from "fs/promises"
import { suite, test } from "node:test"
import { tmpdir } from "os"
import { join } from "path"

import { restoreDetachedArchive } from "@/src/handlers/detachedArchive"
import {
  KdfProfile,
  legacyKdfProfile,
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/kdfProfiles"
import {
  decodeBlockContent,
  decodeBlockMessage,
  deriveBlockKey,
  deriveBlocksetKey,
  passphraseKeyInfo,
  schemeVersion,
} from "@/src/utilities/core/block"
import { decodeBlocksetShare } from "@/src/utilities/core/blockset"
import { deriveDetachedArchiveKeys } from "@/src/utilities/core/detachedArchive"
import { decryptLegacyBlock } from "@/src/utilities/core/legacy/block"
import { deriveLegacyDetachedArchiveKeys } from "@/src/utilities/core/legacy/detachedArchive"
import argon2 from "@/src/utilities/crypto/argon2"
import { decrypt as fixedSizeDecrypt } from "@/src/utilities/crypto/fixedSizeEncryption"
import { decrypt as legacyFixedSizeDecrypt } from "@/src/utilities/crypto/legacy/fixedSizeEncryption"
import {
  computeChallenge,
  computeResponseBoundKey,
  computeStretchedKey,
} from "@/src/utilities/crypto/passphraseKey"
import { combineShares } from "@/src/utilities/crypto/shamir"
import {
  ReferencePayload,
  decodeBlockPayload,
  readPassphrase,
} from "@/tests/helpers"

// The published reference blocks (see tests/fixtures/README.md) restored
// from their printed artifacts — the JPGs are decoded to pixels and QR
// payloads exactly like a drag and dropped block, then decrypted with
// the real scheme modules, so any regression in backward compatibility
// or format drift fails against physical ground truth. Passphrases and
// secrets are read from the recorded fixture files, and block JPGs are
// discovered by directory, so regenerating artifacts requires no test
// edits. Argon2 runs make this the slowest suite (several stretches,
// one at the paranoid profile).
//
// Every reference artifact carries both reference secrets, each under
// its own passphrase.

const secret1 = readFileSync("tests/fixtures/secrets/1.txt")
const secret2 = readFileSync("tests/fixtures/secrets/2.txt")

const legacyPassphrases = [
  readPassphrase("tests/fixtures/legacy/passphrases/1.txt"),
  readPassphrase("tests/fixtures/legacy/passphrases/2.txt"),
]
const currentPassphrases = [
  readPassphrase("tests/fixtures/passphrases/1.txt"),
  readPassphrase("tests/fixtures/passphrases/2.txt"),
]

// Block JPGs keep their app-assigned short-hash filenames — artifacts
// are located by directory, subdirectories (for example yubikey)
// excluded by the extension filter
const blockJpgs = (directory: string): string[] => {
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".jpg"))
    .sort()
    .map((entry) => join(directory, entry))
}

const singleBlockJpg = (directory: string): string => {
  const [path, extra] = blockJpgs(directory)
  assert.ok(path !== undefined, `missing block JPG in ${directory}`)
  assert.strictEqual(extra, undefined)
  return path
}

const detachedArchiveFile = (directory: string): string => {
  const entry = readdirSync(directory).find((name) =>
    name.endsWith(".superbacked")
  )
  assert.ok(entry !== undefined, `missing archive in ${directory}`)
  return entry
}

// The detached archives contain the fixture content files — restored
// entries are located by suffix and compared to the originals byte for
// byte (see tests/fixtures/README.md)
const verifyArchiveContent = async (
  outputDir: string,
  files: string[]
): Promise<void> => {
  for (const fixture of ["bitcoin.pdf", "secrets/1.txt", "secrets/2.txt"]) {
    const entry = files.find((file) => file.endsWith(fixture))
    assert.ok(entry !== undefined, `missing ${fixture}`)
    assert.deepStrictEqual(
      await readFile(join(outputDir, entry)),
      await readFile(join("tests/fixtures", fixture))
    )
  }
}

// Published verification secret (never a real one) — provisioning a
// YubiKey slot with it makes the YubiKey reference artifacts physically
// restorable, and simulating its responses in software makes them
// restorable here
const referenceSlotSecret = Buffer.from(
  readPassphrase("tests/fixtures/yubikey-challenge-response-secret.txt"),
  "hex"
)

// The single-factor block key derivation function key is the raw
// stretched key (see computeBlockKdfKey in src/utilities/core/block.ts —
// composed here from its parts so the two-factor tests can reuse the
// stretch with a simulated response)
const stretch = (
  passphrase: string,
  payload: ReferencePayload,
  profile: KdfProfile
): Promise<Buffer> => {
  return computeStretchedKey(
    passphrase,
    Buffer.from(payload.salt, "base64"),
    profile
  )
}

const decryptVersionedMessage = (key: Buffer, payload: ReferencePayload) => {
  const plaintext = fixedSizeDecrypt(key, Buffer.from(payload.data, "base64"))
  const decoded = decodeBlockMessage(plaintext)
  assert.notStrictEqual(decoded, null)
  assert.strictEqual(decoded?.version, schemeVersion)
  return decoded.message
}

suite("referenceBlocks", () => {
  test("restores both secrets of the standard reference block", async () => {
    const payload = decodeBlockPayload(
      singleBlockJpg("tests/fixtures/blocks/single-block/standard")
    )
    const [firstKey, secondKey] = await Promise.all(
      currentPassphrases.map((passphrase) =>
        stretch(passphrase, payload, standardKdfProfile)
      )
    )
    assert.ok(firstKey !== undefined && secondKey !== undefined)
    assert.deepStrictEqual(
      decryptVersionedMessage(deriveBlockKey(firstKey), payload),
      secret1
    )
    assert.deepStrictEqual(
      decryptVersionedMessage(deriveBlockKey(secondKey), payload),
      secret2
    )
    // A single flipped bit fails authentication — a corrupted scan can
    // never decrypt to garbage
    const tampered = Buffer.from(payload.data, "base64")
    tampered.writeUInt8(tampered.readUInt8(100) ^ 1, 100)
    assert.throws(() => fixedSizeDecrypt(deriveBlockKey(firstKey), tampered), {
      message: "Secret not found",
    })
  })

  test("restores the paranoid reference block at the paranoid profile only", async () => {
    const payload = decodeBlockPayload(
      singleBlockJpg("tests/fixtures/blocks/single-block/paranoid")
    )
    const [firstPassphrase, secondPassphrase] = currentPassphrases
    assert.ok(firstPassphrase !== undefined && secondPassphrase !== undefined)
    const paranoidKey = await stretch(
      firstPassphrase,
      payload,
      paranoidKdfProfile
    )
    assert.deepStrictEqual(
      decryptVersionedMessage(deriveBlockKey(paranoidKey), payload),
      secret1
    )
    assert.deepStrictEqual(
      decryptVersionedMessage(
        deriveBlockKey(
          await stretch(secondPassphrase, payload, paranoidKdfProfile)
        ),
        payload
      ),
      secret2
    )
    // The standard profile derives a different key — a paranoid block
    // restored without the mode fails exactly like a wrong passphrase
    const standardKey = await stretch(
      firstPassphrase,
      payload,
      standardKdfProfile
    )
    assert.throws(
      () =>
        fixedSizeDecrypt(
          deriveBlockKey(standardKey),
          Buffer.from(payload.data, "base64")
        ),
      { message: "Secret not found" }
    )
  })

  test("restores the YubiKey-protected reference block with a simulated response, never without", async () => {
    // The YubiKey artifact carries the first reference secret only —
    // protection is opted into per secret
    const payload = decodeBlockPayload(
      singleBlockJpg("tests/fixtures/blocks/single-block/standard/yubikey")
    )
    for (const [passphrase, expected] of [[currentPassphrases[0], secret1]] as [
      string,
      Buffer,
    ][]) {
      const stretchedKey = await stretch(
        passphrase,
        payload,
        standardKdfProfile
      )
      // The YubiKey computes HMAC-SHA1 keyed with the slot secret —
      // simulated in software with the published reference secret
      const response = createHmac("sha1", referenceSlotSecret)
        .update(computeChallenge(stretchedKey))
        .digest()
      const kdfKey = computeResponseBoundKey(
        stretchedKey,
        response,
        passphraseKeyInfo
      )
      assert.deepStrictEqual(
        decryptVersionedMessage(deriveBlockKey(kdfKey), payload),
        expected
      )
      // Without the response, the same stretch derives nothing — the
      // hardware is load-bearing
      assert.throws(
        () =>
          fixedSizeDecrypt(
            deriveBlockKey(stretchedKey),
            Buffer.from(payload.data, "base64")
          ),
        { message: "Secret not found" }
      )
      // A wrong YubiKey (different slot secret) fails exactly like a
      // wrong passphrase
      const wrongResponse = createHmac("sha1", Buffer.alloc(20, 9))
        .update(computeChallenge(stretchedKey))
        .digest()
      assert.throws(
        () =>
          fixedSizeDecrypt(
            deriveBlockKey(
              computeResponseBoundKey(
                stretchedKey,
                wrongResponse,
                passphraseKeyInfo
              )
            ),
            Buffer.from(payload.data, "base64")
          ),
        { message: "Secret not found" }
      )
    }
  })

  test("restores both secrets of the reference blockset from any two members", async () => {
    const members = blockJpgs("tests/fixtures/blocks/blockset/standard")
    assert.strictEqual(members.length, 3)
    const payloads = members.map((member) => decodeBlockPayload(member))
    for (const [index, expected] of [secret1, secret2].entries()) {
      const passphrase = currentPassphrases[index]
      assert.ok(passphrase !== undefined)
      // Each share carries the blockset scheme version at its head (see
      // decodeBlocksetShare in src/utilities/core/blockset.ts)
      const shares = await Promise.all(
        payloads.map(async (payload) =>
          decodeBlocksetShare(
            decryptVersionedMessage(
              deriveBlocksetKey(
                await stretch(passphrase, payload, standardKdfProfile)
              ),
              payload
            )
          )
        )
      )
      // 2-of-3 — every pair of members must combine to the secret
      for (const pair of [
        [shares[0], shares[1]],
        [shares[1], shares[2]],
        [shares[0], shares[2]],
      ]) {
        const [firstShare, secondShare] = pair
        assert.ok(firstShare !== undefined && secondShare !== undefined)
        assert.strictEqual(
          await combineShares([firstShare, secondShare]),
          expected.toString("utf8")
        )
      }
    }
  })

  test("fails to decrypt the standard reference block using a wrong passphrase", async () => {
    const payload = decodeBlockPayload(
      singleBlockJpg("tests/fixtures/blocks/single-block/standard")
    )
    const key = await stretch(
      "wrong passphrase entirely",
      payload,
      standardKdfProfile
    )
    assert.throws(
      () =>
        fixedSizeDecrypt(
          deriveBlockKey(key),
          Buffer.from(payload.data, "base64")
        ),
      { message: "Secret not found" }
    )
  })

  test("restores both secrets of the legacy reference block", async () => {
    const payload = decodeBlockPayload(
      singleBlockJpg("tests/fixtures/legacy/blocks/single-block")
    )
    assert.ok(payload.iv !== undefined && payload.headers !== undefined)
    // The legacy path rejects a wrong passphrase at the header scan —
    // a different code path from the v2 authentication failure
    await assert.rejects(
      decryptLegacyBlock(
        "wrong passphrase entirely",
        Buffer.from(payload.salt, "base64"),
        Buffer.from(payload.iv, "base64"),
        Buffer.from(payload.headers, "base64"),
        Buffer.from(payload.data, "base64")
      ),
      { message: "Header not found" }
    )
    for (const [index, expected] of [secret1, secret2].entries()) {
      const passphrase = legacyPassphrases[index]
      assert.ok(passphrase !== undefined)
      const message = await decryptLegacyBlock(
        passphrase,
        Buffer.from(payload.salt, "base64"),
        Buffer.from(payload.iv, "base64"),
        Buffer.from(payload.headers, "base64"),
        Buffer.from(payload.data, "base64")
      )
      assert.deepStrictEqual(message, expected)
    }
  })

  test("restores both secrets of the legacy reference blockset from any two members", async () => {
    const members = blockJpgs("tests/fixtures/legacy/blocks/blockset")
    assert.strictEqual(members.length, 3)
    const payloads = members.map((member) => decodeBlockPayload(member))
    const shamirPrefix = Buffer.from("shamir:")
    for (const [index, expected] of [secret1, secret2].entries()) {
      const passphrase = legacyPassphrases[index]
      assert.ok(passphrase !== undefined)
      const shares = await Promise.all(
        payloads.map(async (payload) => {
          assert.ok(payload.iv !== undefined && payload.headers !== undefined)
          const message = await decryptLegacyBlock(
            passphrase,
            Buffer.from(payload.salt, "base64"),
            Buffer.from(payload.iv, "base64"),
            Buffer.from(payload.headers, "base64"),
            Buffer.from(payload.data, "base64")
          )
          // Legacy shares carry the shamir: prefix (see
          // classifyPrefixedShare in src/utilities/core/legacy/blockset.ts)
          assert.deepStrictEqual(
            message.subarray(0, shamirPrefix.length),
            shamirPrefix
          )
          return message.subarray(shamirPrefix.length)
        })
      )
      const [firstShare, secondShare] = shares
      assert.ok(firstShare !== undefined && secondShare !== undefined)
      assert.strictEqual(
        await combineShares([firstShare, secondShare]),
        expected.toString("utf8")
      )
    }
  })

  test("restores the pre-subkey reference block through the legacy mode fallback only", async () => {
    // Created with v1.5.1 (blockcrypt 0.0.1-beta.21, before HKDF
    // subkeys) — subkey-mode decryption demonstrably cannot open it, so
    // a successful decrypt proves the fallback inside decryptLegacyBlock
    // ran against a real shipped artifact. The block carries the first
    // reference secret only
    const payload = decodeBlockPayload(
      singleBlockJpg("tests/fixtures/legacy/blocks/single-block/pre-subkey")
    )
    assert.ok(payload.iv !== undefined && payload.headers !== undefined)
    const passphrase = legacyPassphrases[0]
    assert.ok(passphrase !== undefined)
    await assert.rejects(
      legacyFixedSizeDecrypt(
        passphrase,
        Buffer.from(payload.salt, "base64"),
        Buffer.from(payload.iv, "base64"),
        Buffer.from(payload.headers, "base64"),
        Buffer.from(payload.data, "base64"),
        (kdfPassphrase, salt) => argon2(kdfPassphrase, salt, legacyKdfProfile)
      ),
      { message: "Header not found" }
    )
    const message = await decryptLegacyBlock(
      passphrase,
      Buffer.from(payload.salt, "base64"),
      Buffer.from(payload.iv, "base64"),
      Buffer.from(payload.headers, "base64"),
      Buffer.from(payload.data, "base64")
    )
    assert.deepStrictEqual(message, secret1)
  })

  test("restores the reference detached archive pair", async () => {
    // The block carries the first reference secret bound to the archive
    // master key — the derived filename must match the published
    // artifact's name, and restoration runs through the handler, probing
    // for the current scheme
    const directory = "tests/fixtures/blocks/detached-archive"
    const payload = decodeBlockPayload(singleBlockJpg(directory))
    const passphrase = currentPassphrases[0]
    assert.ok(passphrase !== undefined)
    const key = await stretch(passphrase, payload, standardKdfProfile)
    const blockContent = decryptVersionedMessage(
      deriveBlockKey(key),
      payload
    ).toString()
    const { masterKey, secret } = decodeBlockContent(blockContent)
    assert.strictEqual(secret, secret1.toString())
    assert.ok(masterKey !== null)
    const archiveFile = detachedArchiveFile(directory)
    assert.strictEqual(
      archiveFile,
      `${deriveDetachedArchiveKeys(Buffer.from(masterKey, "base64")).filename}.superbacked`
    )
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    const restored = await restoreDetachedArchive(
      join(directory, archiveFile),
      outputDir,
      blockContent
    )
    assert.ok(restored.success === true)
    await verifyArchiveContent(outputDir, restored.files)
  })

  test("restores the legacy reference detached archive pair through the fallback", async () => {
    // A legacy block always pairs with a legacy archive — the filename
    // derives through the shipped legacy chain, and the handler's probe
    // finds no current-scheme header, falling back to the legacy scheme
    // against a real shipped artifact
    const directory = "tests/fixtures/legacy/blocks/detached-archive"
    const payload = decodeBlockPayload(singleBlockJpg(directory))
    assert.ok(payload.iv !== undefined && payload.headers !== undefined)
    const passphrase = legacyPassphrases[0]
    assert.ok(passphrase !== undefined)
    const blockContent = (
      await decryptLegacyBlock(
        passphrase,
        Buffer.from(payload.salt, "base64"),
        Buffer.from(payload.iv, "base64"),
        Buffer.from(payload.headers, "base64"),
        Buffer.from(payload.data, "base64")
      )
    ).toString()
    const { masterKey, secret } = decodeBlockContent(blockContent)
    assert.strictEqual(secret, secret1.toString())
    assert.ok(masterKey !== null)
    const archiveFile = detachedArchiveFile(directory)
    assert.strictEqual(
      archiveFile,
      `${deriveLegacyDetachedArchiveKeys(Buffer.from(masterKey, "base64")).filename}.superbacked`
    )
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    const restored = await restoreDetachedArchive(
      join(directory, archiveFile),
      outputDir,
      blockContent
    )
    assert.ok(restored.success === true)
    await verifyArchiveContent(outputDir, restored.files)
  })
})
