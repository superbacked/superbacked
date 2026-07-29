import assert from "assert"
import { createHmac } from "crypto"
import { mkdtemp, readFile } from "fs/promises"
import { suite, test } from "node:test"
import { tmpdir } from "os"
import { join } from "path"

import {
  legacyKdfProfile,
  v2ParanoidKdfProfile,
  v2StandardKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"
import {
  AuthenticationError,
  computeArchiveKeys,
  decodeProbeBlock,
  extractProbeBlock,
  extractSalt,
  passphraseKeyInfo,
  probeKeyInfo,
  restoreStandaloneArchive,
  standaloneArchiveVersion,
} from "@/src/utilities/core/standaloneArchive"
import {
  computeChallenge,
  computeProbeKey,
  computeResponseBoundKey,
  computeStretchedKey,
} from "@/src/utilities/crypto/passphraseKey"

// The published reference standalone archives (see
// docs/reference-standalone-archives) restored with the real scheme
// modules — every archive contains the tests/fixtures tree, so restored
// bytes are compared against the same files the archives were created
// from. Argon2 runs make this a slow suite (one stretch at the paranoid
// profile).

const v1Passphrase = "wired tutor bok glad mute"
const v2Passphrase = "reset enlighten timid spending disobey dioxide crushed"

// Published verification secret (never a real one) — see
// tests/referenceBlocks.test.ts
const referenceSlotSecret = Buffer.from(
  "1ecb57826ae09610b3b249e1869400e731334229",
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
  test("restores the v1 reference archive through the headerless fallback", async () => {
    const path = "docs/reference-standalone-archives/v1/backup.superbacked"
    const salt = await extractSalt(path)
    const keys = await computeArchiveKeys(v1Passphrase, salt, legacyKdfProfile)
    // A v1 archive puts payload ciphertext where v2 puts the probe block
    // — no key reveals a header, which is how the cascade recognizes it
    assert.strictEqual(
      decodeProbeBlock(keys.probeKey, await extractProbeBlock(path)),
      null
    )
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    const files = await restoreStandaloneArchive(path, outputDir, keys.key, 1)
    await verifyRestoredFixtures(outputDir, files)
  })

  test("fails to restore the v1 reference archive using a wrong passphrase", async () => {
    const path = "docs/reference-standalone-archives/v1/backup.superbacked"
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
    // The headerless fallback authenticates at the payload — a wrong
    // passphrase surfaces only there
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    await assert.rejects(
      restoreStandaloneArchive(path, outputDir, keys.key, 1),
      AuthenticationError
    )
  })

  test("restores the v2 standard reference archive through the probe", async () => {
    const path =
      "docs/reference-standalone-archives/v2/standard/backup.superbacked"
    const salt = await extractSalt(path)
    const keys = await computeArchiveKeys(
      v2Passphrase,
      salt,
      v2StandardKdfProfile
    )
    assert.strictEqual(
      decodeProbeBlock(keys.probeKey, await extractProbeBlock(path)),
      standaloneArchiveVersion
    )
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    const files = await restoreStandaloneArchive(path, outputDir, keys.key, 2)
    await verifyRestoredFixtures(outputDir, files)
  })

  test("fails to match the v2 standard reference archive probe using a wrong passphrase", async () => {
    const path =
      "docs/reference-standalone-archives/v2/standard/backup.superbacked"
    const salt = await extractSalt(path)
    const keys = await computeArchiveKeys(
      "wrong passphrase entirely",
      salt,
      v2StandardKdfProfile
    )
    // A wrong passphrase and a headerless v1 archive land in the same
    // place — no probe match, and the cascade falls through
    assert.strictEqual(
      decodeProbeBlock(keys.probeKey, await extractProbeBlock(path)),
      null
    )
  })

  test("restores the v2 paranoid reference archive at the paranoid profile only", async () => {
    const path =
      "docs/reference-standalone-archives/v2/paranoid/backup.superbacked"
    const salt = await extractSalt(path)
    const probeBlock = await extractProbeBlock(path)
    // The standard profile derives a different probe key — a paranoid
    // archive restored without the mode matches no probe and falls
    // through to report a wrong passphrase
    const standardKeys = await computeArchiveKeys(
      v2Passphrase,
      salt,
      v2StandardKdfProfile
    )
    assert.strictEqual(
      decodeProbeBlock(standardKeys.probeKey, probeBlock),
      null
    )
    const keys = await computeArchiveKeys(
      v2Passphrase,
      salt,
      v2ParanoidKdfProfile
    )
    assert.strictEqual(
      decodeProbeBlock(keys.probeKey, probeBlock),
      standaloneArchiveVersion
    )
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    const files = await restoreStandaloneArchive(path, outputDir, keys.key, 2)
    await verifyRestoredFixtures(outputDir, files)
  })

  test("restores the YubiKey-protected reference archive with a simulated response, never without", async () => {
    const path =
      "docs/reference-standalone-archives/v2/standard/yubikey/backup.superbacked"
    const salt = await extractSalt(path)
    const probeBlock = await extractProbeBlock(path)
    const stretchedKey = await computeStretchedKey(
      v2Passphrase,
      salt,
      v2StandardKdfProfile
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
      standaloneArchiveVersion
    )
    const key = computeResponseBoundKey(
      stretchedKey,
      response,
      passphraseKeyInfo
    )
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-reference-"))
    const files = await restoreStandaloneArchive(path, outputDir, key, 2)
    await verifyRestoredFixtures(outputDir, files)
  })
})
