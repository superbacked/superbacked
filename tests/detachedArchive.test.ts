import assert from "assert"
import { hkdfSync, randomBytes } from "crypto"
import { mkdtemp, readFile, writeFile } from "fs/promises"
import { suite, test } from "node:test"
import { tmpdir } from "os"
import { join } from "path"

import {
  UnsupportedVersionError,
  createDetachedArchive,
  deriveDetachedArchiveKeys,
  deriveProbeKey,
  restoreDetachedArchive,
  schemeVersion,
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

suite("detachedArchive", () => {
  test("freezes version and probe key derivation", () => {
    assert.strictEqual(schemeVersion, 2)
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
          Buffer.from("version-probe", "utf8"),
          32
        )
      )
    )
    assert.notDeepStrictEqual(probeKey, key)
  })

  test("freezes key chain", () => {
    // The chain is a frozen identity — it seals every new archive (the
    // shipped legacy chain is pinned in
    // tests/legacy/detachedArchive.test.ts)
    const masterKey = Buffer.alloc(32, 1)
    const current = deriveDetachedArchiveKeys(masterKey)
    assert.strictEqual(
      current.encryptionKey.toString("hex"),
      "eb2ec11f67941c49a831de21b72f36c37ab02a2b84ffa47e2a0fc52913330a82"
    )
    assert.strictEqual(
      current.hmacKey.toString("hex"),
      "63daeeeb9ca79ba128c0310b46e24862634fae05d65f042ad982b99a37ed7bf8"
    )
    assert.strictEqual(current.filename, "68e1435f46f036f3068d06333a148f1b")
    // Raw crypto recomputation pins the frozen info strings
    for (const [info, expected] of [
      ["detached-archive-key", current.encryptionKey],
      ["detached-archive-hmac", current.hmacKey],
    ] as const) {
      assert.deepStrictEqual(
        expected,
        Buffer.from(
          hkdfSync("sha256", masterKey, Buffer.alloc(0), Buffer.from(info), 32)
        )
      )
    }
    assert.deepStrictEqual(
      Buffer.from(current.filename, "hex"),
      Buffer.from(
        hkdfSync(
          "sha256",
          masterKey,
          Buffer.alloc(0),
          Buffer.from("detached-archive-filename"),
          16
        )
      )
    )
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

  test("fails to restore when no probe matches", async () => {
    // The module restores its own scheme only — a probe miss is a hard
    // rejection, and falling back is the consumer’s decision (see
    // src/handlers/detachedArchive.ts)
    const fixture = await createFixture()
    await createDetachedArchive(
      [fixture.filePath],
      fixture.archivePath,
      fixture.key,
      fixture.hmacKey,
      blockContent
    )
    await assert.rejects(
      restoreDetachedArchive(
        fixture.archivePath,
        fixture.outputDir,
        randomBytes(32),
        fixture.hmacKey,
        blockContent
      ),
      { message: "Probe block not found" }
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
