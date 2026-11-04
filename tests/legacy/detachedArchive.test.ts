import assert from "assert"
import { hkdfSync } from "crypto"
import { readdirSync } from "fs"
import { copyFile, mkdtemp, readFile, writeFile } from "fs/promises"
import { suite, test } from "node:test"
import { tmpdir } from "os"
import { join } from "path"

import { decodeBlockContent } from "@/src/utilities/core/block"
import { restoreDetachedArchive } from "@/src/utilities/core/detachedArchive"
import { decryptLegacyBlock } from "@/src/utilities/core/legacy/block"
import {
  deriveLegacyDetachedArchiveKeys,
  restoreLegacyDetachedArchive,
} from "@/src/utilities/core/legacy/detachedArchive"
import { decodeBlockPayload, readPassphrase } from "@/tests/helpers"

// The detached archive scheme as shipped (v1.10.0 through v1.12.1) —
// frozen and restoration-only, pinned at the module level against the
// real legacy reference pair (see tests/fixtures/README.md): the paired
// block yields the master key at runtime, so the suite carries no frozen
// artifact material of its own. The key chain strings (historic -v1
// suffixes and all) are frozen forever, as archives in the wild restore
// under them. Argon2 runs make it cost one stretch at the legacy
// profile.

const directory = "tests/fixtures/legacy/blocks/detached-archive"

interface Pair {
  archivePath: string
  blockContent: Buffer
  encryptionKey: Buffer
  hmacKey: Buffer
}

const derivePair = async (): Promise<Pair> => {
  const jpg = readdirSync(directory).find((entry) => entry.endsWith(".jpg"))
  assert.ok(jpg !== undefined)
  const payload = decodeBlockPayload(join(directory, jpg))
  assert.ok(payload.iv !== undefined && payload.headers !== undefined)
  const blockContent = await decryptLegacyBlock(
    readPassphrase("tests/fixtures/legacy/passphrases/1.txt"),
    Buffer.from(payload.salt, "base64"),
    Buffer.from(payload.iv, "base64"),
    Buffer.from(payload.headers, "base64"),
    Buffer.from(payload.data, "base64")
  )
  const { masterKey } = decodeBlockContent(blockContent.toString())
  assert.ok(masterKey !== null)
  const keys = deriveLegacyDetachedArchiveKeys(Buffer.from(masterKey, "base64"))
  return {
    archivePath: join(directory, `${keys.filename}.superbacked`),
    blockContent: blockContent,
    encryptionKey: keys.encryptionKey,
    hmacKey: keys.hmacKey,
  }
}

// Memoized so the suite pays its legacy stretch once, not per test
let cachedPair: Promise<Pair> | undefined

const pair = (): Promise<Pair> => {
  cachedPair ??= derivePair()
  return cachedPair
}

suite("legacyDetachedArchive", () => {
  test("freezes legacy key chain", () => {
    // The shipped v1.10.0 identities — frozen shipped bytes, suffixes
    // included (see the version namespace rules in
    // src/utilities/crypto/schemeHeader.ts), pinned
    // by raw crypto recomputation against a fixed master key
    const masterKey = Buffer.alloc(32, 1)
    const legacy = deriveLegacyDetachedArchiveKeys(masterKey)
    for (const [info, expected] of [
      ["encryption-key-v1", legacy.encryptionKey],
      ["hmac-v1", legacy.hmacKey],
    ] as const) {
      assert.deepStrictEqual(
        expected,
        Buffer.from(
          hkdfSync("sha256", masterKey, Buffer.alloc(0), Buffer.from(info), 32)
        )
      )
    }
    assert.deepStrictEqual(
      Buffer.from(legacy.filename, "hex"),
      Buffer.from(
        hkdfSync(
          "sha256",
          masterKey,
          Buffer.alloc(0),
          Buffer.from("filename-v1"),
          16
        )
      )
    )
  })

  test("restores legacy detached archive", async () => {
    const { archivePath, blockContent, encryptionKey, hmacKey } = await pair()
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-test-"))
    const files = await restoreLegacyDetachedArchive(
      archivePath,
      outputDir,
      encryptionKey,
      hmacKey,
      blockContent
    )
    const entry = files.find((file) => file.endsWith("bitcoin.pdf"))
    assert.ok(entry !== undefined)
    assert.deepStrictEqual(
      await readFile(join(outputDir, entry)),
      await readFile("tests/fixtures/bitcoin.pdf")
    )
  })

  test("fails to restore using altered block content or wrong HMAC key", async () => {
    // The HMAC binds the archive to its block content — restoring against
    // any other content must fail even though decryption succeeds
    const { archivePath, blockContent, encryptionKey, hmacKey } = await pair()
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-test-"))
    await assert.rejects(
      restoreLegacyDetachedArchive(
        archivePath,
        outputDir,
        encryptionKey,
        hmacKey,
        Buffer.concat([blockContent, Buffer.from(" ")])
      ),
      { message: "HMAC verification failed" }
    )
    await assert.rejects(
      restoreLegacyDetachedArchive(
        archivePath,
        outputDir,
        encryptionKey,
        Buffer.alloc(32, 7),
        blockContent
      ),
      { message: "HMAC verification failed" }
    )
  })

  test("fails to restore tampered archives", async () => {
    const { archivePath, blockContent, encryptionKey, hmacKey } = await pair()
    const workDir = await mkdtemp(join(tmpdir(), "superbacked-test-"))
    const tamperedPath = join(workDir, "tampered.superbacked")
    await copyFile(archivePath, tamperedPath)
    const file = await readFile(tamperedPath)
    file.writeUInt8(file.readUInt8(12) ^ 1, 12)
    await writeFile(tamperedPath, file)
    await assert.rejects(
      restoreLegacyDetachedArchive(
        tamperedPath,
        workDir,
        encryptionKey,
        hmacKey,
        blockContent
      )
    )
  })

  test("fails to restore legacy archive through the current scheme", async () => {
    // Scheme modules never fall back into each other — the fallback is
    // bounded in the consumer (see src/handlers/detachedArchive.ts), so
    // the current restore reports a headerless file as a missing probe
    const { archivePath, blockContent, encryptionKey, hmacKey } = await pair()
    const outputDir = await mkdtemp(join(tmpdir(), "superbacked-test-"))
    await assert.rejects(
      restoreDetachedArchive(
        archivePath,
        outputDir,
        encryptionKey,
        hmacKey,
        blockContent
      ),
      { message: "Probe block not found" }
    )
  })
})
