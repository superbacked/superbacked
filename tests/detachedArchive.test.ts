import assert from "assert"
import { createHmac, hkdfSync, randomBytes } from "crypto"
import { createWriteStream } from "fs"
import { appendFile, mkdtemp, readFile, writeFile } from "fs/promises"
import { suite, test } from "node:test"
import { tmpdir } from "os"
import { join } from "path"
import { pipeline } from "stream/promises"

import {
  createEncryptionStream,
  createTarStream,
  generateIv,
} from "@/src/utilities/core/archive"
import {
  UnsupportedVersionError,
  createDetachedArchive,
  deriveProbeKey,
  detachedArchiveVersion,
  restoreDetachedArchive,
} from "@/src/utilities/core/detachedArchive"
import {
  encodeProbeBlock,
  probeBlockLength,
} from "@/src/utilities/crypto/schemeHeader"

const blockContent = Buffer.from('{"secret":"test"}', "utf-8")

const createFixture = async (): Promise<{
  archivePath: string
  content: string
  filePath: string
  hmacKey: Buffer
  key: Buffer
  outputDir: string
}> => {
  const directory = await mkdtemp(join(tmpdir(), "superbacked-test-"))
  const content = "detached archive content"
  const filePath = join(directory, "secret.txt")
  await writeFile(filePath, content)
  return {
    archivePath: join(directory, "archive.superbacked"),
    content,
    filePath,
    hmacKey: randomBytes(32),
    key: randomBytes(32),
    outputDir: await mkdtemp(join(tmpdir(), "superbacked-test-restored-")),
  }
}

// The v1 writer — replicates the released headerless format
// [iv][encrypted data][tag][hmac] so the fallback path is pinned against
// what actually shipped
const createLegacyDetachedArchive = async (
  filePaths: string[],
  outputPath: string,
  key: Buffer,
  hmacKey: Buffer,
  content: Buffer
): Promise<void> => {
  const iv = generateIv()
  const cipher = createEncryptionStream(key, iv)
  const output = createWriteStream(outputPath)
  output.write(iv)
  await pipeline(createTarStream(filePaths), cipher, output)
  const tag = cipher.getAuthTag()
  await appendFile(outputPath, tag)
  const file = await readFile(outputPath)
  const hmac = createHmac("sha256", hmacKey)
    .update(content)
    .update(file.subarray(0, 12))
    .update(file.subarray(12))
    .digest()
  await appendFile(outputPath, hmac)
}

suite("detachedArchive", () => {
  test("freezes version and probe key derivation", () => {
    assert.strictEqual(detachedArchiveVersion, 2)
    const key = randomBytes(32)
    const probeKey = deriveProbeKey(key)
    // Raw crypto recomputation pins the frozen construction — a child of
    // the encryption key, domain-separated by the frozen info
    assert.deepStrictEqual(
      probeKey,
      Buffer.from(
        hkdfSync(
          "sha256",
          key,
          Buffer.alloc(0),
          Buffer.from("version-probe-v1", "utf8"),
          32
        )
      )
    )
    assert.notDeepStrictEqual(probeKey, key)
  })

  test("round-trips v2 detached archive", async () => {
    const fixture = await createFixture()
    await createDetachedArchive(
      [fixture.filePath],
      fixture.archivePath,
      fixture.key,
      fixture.hmacKey,
      blockContent
    )
    const files = await restoreDetachedArchive(
      fixture.archivePath,
      fixture.outputDir,
      fixture.key,
      fixture.hmacKey,
      blockContent
    )
    assert.strictEqual(files.length, 1)
    // The tar stream preserves source paths (portable mode only strips
    // the leading slash), so extraction nests the fixture path under the
    // output directory — resolve through the returned entry path
    const restoredPath = files[0]
    assert.ok(restoredPath !== undefined)
    assert.ok(restoredPath.endsWith("secret.txt"))
    assert.strictEqual(
      await readFile(join(fixture.outputDir, restoredPath), "utf-8"),
      fixture.content
    )
  })

  test("restores legacy v1 detached archive", async () => {
    const fixture = await createFixture()
    await createLegacyDetachedArchive(
      [fixture.filePath],
      fixture.archivePath,
      fixture.key,
      fixture.hmacKey,
      blockContent
    )
    const files = await restoreDetachedArchive(
      fixture.archivePath,
      fixture.outputDir,
      fixture.key,
      fixture.hmacKey,
      blockContent
    )
    assert.strictEqual(files.length, 1)
    const restoredPath = files[0]
    assert.ok(restoredPath !== undefined)
    assert.ok(restoredPath.endsWith("secret.txt"))
    assert.strictEqual(
      await readFile(join(fixture.outputDir, restoredPath), "utf-8"),
      fixture.content
    )
  })

  test("fails to restore using altered block content or wrong HMAC key", async () => {
    const fixture = await createFixture()
    await createDetachedArchive(
      [fixture.filePath],
      fixture.archivePath,
      fixture.key,
      fixture.hmacKey,
      blockContent
    )
    // The HMAC binds the archive to its block content — restoring against
    // any other content must fail even though decryption succeeds
    await assert.rejects(
      restoreDetachedArchive(
        fixture.archivePath,
        fixture.outputDir,
        fixture.key,
        fixture.hmacKey,
        Buffer.from('{"secret":"altered"}', "utf-8")
      ),
      { message: "HMAC verification failed" }
    )
    await assert.rejects(
      restoreDetachedArchive(
        fixture.archivePath,
        fixture.outputDir,
        fixture.key,
        randomBytes(32),
        blockContent
      ),
      { message: "HMAC verification failed" }
    )
  })

  test("fails to restore archives from a newer version", async () => {
    const fixture = await createFixture()
    await createDetachedArchive(
      [fixture.filePath],
      fixture.archivePath,
      fixture.key,
      fixture.hmacKey,
      blockContent
    )
    // Splice in a probe block declaring version 3 — the probe decides
    // before the authentication tag or HMAC are consulted
    const file = await readFile(fixture.archivePath)
    encodeProbeBlock(deriveProbeKey(fixture.key), 3).copy(file, 0)
    await writeFile(fixture.archivePath, file)
    await assert.rejects(
      restoreDetachedArchive(
        fixture.archivePath,
        fixture.outputDir,
        fixture.key,
        fixture.hmacKey,
        blockContent
      ),
      UnsupportedVersionError
    )
  })

  test("fails to restore tampered archives", async () => {
    const fixture = await createFixture()
    await createDetachedArchive(
      [fixture.filePath],
      fixture.archivePath,
      fixture.key,
      fixture.hmacKey,
      blockContent
    )
    const file = await readFile(fixture.archivePath)
    const offset = probeBlockLength + 12
    file.writeUInt8(file.readUInt8(offset) ^ 1, offset)
    await writeFile(fixture.archivePath, file)
    // The rejection is the contract — whether the tar parser or the
    // decipher reports first depends on where the flip lands, so no
    // message is pinned
    await assert.rejects(
      restoreDetachedArchive(
        fixture.archivePath,
        fixture.outputDir,
        fixture.key,
        fixture.hmacKey,
        blockContent
      )
    )
  })
})
