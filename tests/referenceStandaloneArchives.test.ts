import assert from "assert"
import { createHmac } from "crypto"
import { readFileSync } from "fs"
import { mkdtemp, readFile } from "fs/promises"
import { suite, test } from "node:test"
import { tmpdir } from "os"
import { join } from "path"

import {
  legacyKdfProfile,
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/kdfProfiles"
import { restoreLegacyStandaloneArchive } from "@/src/utilities/core/legacy/standaloneArchive"
import {
  AuthenticationError,
  computeArchiveKeys,
  decodeProbeBlock,
  extractProbeBlock,
  extractSalt,
  passphraseKeyInfo,
  probeKeyInfo,
  restoreStandaloneArchive,
  schemeVersion,
} from "@/src/utilities/core/standaloneArchive"
import {
  computeChallenge,
  computeProbeKey,
  computeResponseBoundKey,
  computeStretchedKey,
} from "@/src/utilities/crypto/passphraseKey"

// The published reference standalone archives (see
// tests/fixtures/README.md) restored with the real scheme modules —
// every archive contains the fixture content files, so restored bytes
// are compared against the same files the archives were created from,
// and passphrases are read from the recorded fixture files so
// regenerating artifacts requires no test edits. Argon2 runs make this
// a slow suite (one stretch at the paranoid profile).

// The archives share the first block passphrase (see
// tests/fixtures/README.md)
const legacyPassphrase = readFileSync(
  "tests/fixtures/legacy/passphrases/1.txt",
  "utf-8"
).trim()
const currentPassphrase = readFileSync(
  "tests/fixtures/passphrases/1.txt",
  "utf-8"
).trim()

// Published verification secret (never a real one) — see
// tests/referenceBlocks.test.ts
const referenceSlotSecret = Buffer.from(
  readFileSync(
    "tests/fixtures/yubikey-challenge-response-secret.txt",
    "utf-8"
  ).trim(),
  "hex"
)

// The archives contain the fixtures tree — the tar preserves source
// paths, so restored entries are located by suffix and compared to the
// originals byte for byte
const verifyRestoredFixtures = async (
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

suite("referenceStandaloneArchives", () => {
  test("restores the legacy reference archive through the legacy scheme", async () => {
    const path = "tests/fixtures/legacy/standalone-archives/backup.superbacked"
    const salt = await extractSalt(path)
    const keys = await computeArchiveKeys(
      legacyPassphrase,
      salt,
      legacyKdfProfile
    )
    // A v1 archive puts payload ciphertext where v2 puts the probe block
    // — no key reveals a header, which is how the cascade recognizes it
    assert.strictEqual(
      decodeProbeBlock(keys.probeKey, await extractProbeBlock(path)),
      null
    )
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    const files = await restoreLegacyStandaloneArchive(
      path,
      outputDir,
      keys.key
    )
    await verifyRestoredFixtures(outputDir, files)
  })

  test("fails to restore the legacy reference archive using a wrong passphrase", async () => {
    const path = "tests/fixtures/legacy/standalone-archives/backup.superbacked"
    const salt = await extractSalt(path)
    const keys = await computeArchiveKeys(
      "wrong passphrase entirely",
      salt,
      legacyKdfProfile
    )
    assert.strictEqual(
      decodeProbeBlock(keys.probeKey, await extractProbeBlock(path)),
      null
    )
    // The legacy scheme authenticates at the payload — a wrong
    // passphrase surfaces only there
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    await assert.rejects(
      restoreLegacyStandaloneArchive(path, outputDir, keys.key),
      AuthenticationError
    )
  })

  test("restores the standard reference archive through the probe", async () => {
    const path =
      "tests/fixtures/standalone-archives/standard/backup.superbacked"
    const salt = await extractSalt(path)
    const keys = await computeArchiveKeys(
      currentPassphrase,
      salt,
      standardKdfProfile
    )
    assert.strictEqual(
      decodeProbeBlock(keys.probeKey, await extractProbeBlock(path)),
      schemeVersion
    )
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    const files = await restoreStandaloneArchive(path, outputDir, keys.key)
    await verifyRestoredFixtures(outputDir, files)
  })

  test("fails to match the standard reference archive probe using a wrong passphrase", async () => {
    const path =
      "tests/fixtures/standalone-archives/standard/backup.superbacked"
    const salt = await extractSalt(path)
    const keys = await computeArchiveKeys(
      "wrong passphrase entirely",
      salt,
      standardKdfProfile
    )
    // A wrong passphrase and a headerless v1 archive land in the same
    // place — no probe match, and the cascade falls through
    assert.strictEqual(
      decodeProbeBlock(keys.probeKey, await extractProbeBlock(path)),
      null
    )
  })

  test("restores the paranoid reference archive at the paranoid profile only", async () => {
    const path =
      "tests/fixtures/standalone-archives/paranoid/backup.superbacked"
    const salt = await extractSalt(path)
    const probeBlock = await extractProbeBlock(path)
    // The standard profile derives a different probe key — a paranoid
    // archive restored without the mode matches no probe and falls
    // through to report a wrong passphrase
    const standardKeys = await computeArchiveKeys(
      currentPassphrase,
      salt,
      standardKdfProfile
    )
    assert.strictEqual(
      decodeProbeBlock(standardKeys.probeKey, probeBlock),
      null
    )
    const keys = await computeArchiveKeys(
      currentPassphrase,
      salt,
      paranoidKdfProfile
    )
    assert.strictEqual(
      decodeProbeBlock(keys.probeKey, probeBlock),
      schemeVersion
    )
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    const files = await restoreStandaloneArchive(path, outputDir, keys.key)
    await verifyRestoredFixtures(outputDir, files)
  })

  test("restores the YubiKey-protected reference archive with a simulated response, never without", async () => {
    const path =
      "tests/fixtures/standalone-archives/standard/yubikey/backup.superbacked"
    const salt = await extractSalt(path)
    const probeBlock = await extractProbeBlock(path)
    const stretchedKey = await computeStretchedKey(
      currentPassphrase,
      salt,
      standardKdfProfile
    )
    // Without the response the probe reveals nothing — the probe sits at
    // the same factor depth as the encryption key, so no correctness
    // check is reachable without the hardware
    assert.strictEqual(
      decodeProbeBlock(computeProbeKey(stretchedKey, probeKeyInfo), probeBlock),
      null
    )
    // The YubiKey computes HMAC-SHA1 keyed with the slot secret —
    // simulated in software with the published reference secret
    const response = createHmac("sha1", referenceSlotSecret)
      .update(computeChallenge(stretchedKey))
      .digest()
    assert.strictEqual(
      decodeProbeBlock(
        computeProbeKey(stretchedKey, probeKeyInfo, response),
        probeBlock
      ),
      schemeVersion
    )
    const key = computeResponseBoundKey(
      stretchedKey,
      response,
      passphraseKeyInfo
    )
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    const files = await restoreStandaloneArchive(path, outputDir, key)
    await verifyRestoredFixtures(outputDir, files)
  })
})
