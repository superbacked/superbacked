import assert from "assert"
import { randomBytes } from "crypto"
import { readFileSync } from "fs"
import { copyFile, mkdtemp, readFile, writeFile } from "fs/promises"
import { suite, test } from "node:test"
import { tmpdir } from "os"
import { join } from "path"

import { legacyKdfProfile } from "@/src/shared/kdfProfiles"
import { restoreLegacyStandaloneArchive } from "@/src/utilities/core/legacy/standaloneArchive"
import {
  AuthenticationError,
  computeArchiveKeys,
  extractSalt,
} from "@/src/utilities/core/standaloneArchive"

// The standalone archive scheme as shipped — frozen and restoration-only,
// pinned at the module level against the real legacy reference archive
// (see tests/fixtures/README.md), whose round trip and probe behavior the
// reference suite covers (see tests/referenceStandaloneArchives.test.ts).
// This suite adds the negatives: wrong key and tampered bytes, both on
// copies. Argon2 runs make it cost one stretch at the legacy profile.

const archivePath =
  "tests/fixtures/legacy/standalone-archives/backup.superbacked"
// The archive shares the first block passphrase (see
// tests/fixtures/README.md)
const passphrase = readFileSync(
  "tests/fixtures/legacy/passphrases/1.txt",
  "utf-8"
).trim()

suite("legacyStandaloneArchive", () => {
  test("restores legacy standalone archive", async () => {
    const salt = await extractSalt(archivePath)
    const keys = await computeArchiveKeys(passphrase, salt, legacyKdfProfile)
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-test-"))
    const files = await restoreLegacyStandaloneArchive(
      archivePath,
      outputDir,
      keys.key
    )
    const entry = files.find((file) => file.endsWith("bitcoin.pdf"))
    assert.ok(entry !== undefined)
    assert.deepStrictEqual(
      await readFile(join(outputDir, entry)),
      await readFile("tests/fixtures/bitcoin.pdf")
    )
  })

  test("fails to restore using wrong key", async () => {
    // A wrong passphrase and a corrupted archive are cryptographically
    // indistinguishable — both surface as the authentication failure
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-test-"))
    await assert.rejects(
      restoreLegacyStandaloneArchive(archivePath, outputDir, randomBytes(32)),
      AuthenticationError
    )
  })

  test("fails to restore tampered archives", async () => {
    const salt = await extractSalt(archivePath)
    const keys = await computeArchiveKeys(passphrase, salt, legacyKdfProfile)
    const directory = await mkdtemp(join(tmpdir(), "superbacked-test-"))
    const tamperedPath = join(directory, "tampered.superbacked")
    await copyFile(archivePath, tamperedPath)
    const file = await readFile(tamperedPath)
    const offset = 16 + 12
    file.writeUInt8(file.readUInt8(offset) ^ 1, offset)
    await writeFile(tamperedPath, file)
    await assert.rejects(
      restoreLegacyStandaloneArchive(tamperedPath, directory, keys.key),
      AuthenticationError
    )
  })
})
