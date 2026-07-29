import { createHmac, timingSafeEqual } from "crypto"
import { createReadStream, createWriteStream } from "fs"
import { open, stat } from "fs/promises"
import { Transform } from "stream"
import { pipeline } from "stream/promises"

import {
  Manifest,
  RestoredFilePath,
  createDecryptionStream,
  createEncryptionStream,
  createManifest,
  createTarExtractStream,
  createTarStream,
  generateIv,
} from "@/src/utilities/core/archive"
import { hkdf } from "@/src/utilities/crypto/primitives"
import {
  UnsupportedVersionError,
  decodeProbeBlock,
  encodeProbeBlock,
  probeBlockLength,
} from "@/src/utilities/crypto/schemeHeader"

export type { Manifest, RestoredFilePath }
export { UnsupportedVersionError }

// Version written into new detached archives (see
// src/utilities/crypto/schemeHeader.ts) — v1 is the headerless legacy
// format, recognized by matching no probe
export const detachedArchiveVersion = 2

// The probe key is derived in here rather than passed in, so the handler
// wire format stays the stored key pair and block content — a child of
// the encryption key (itself a child of the master key), domain-separated
// by the frozen info. No factor gap: every key is already in hand, so
// the probe reveals nothing the holder could not decrypt anyway
export const deriveProbeKey = (encryptionKey: Buffer): Buffer => {
  return hkdf(
    encryptionKey,
    Buffer.alloc(0),
    Buffer.from("version-probe-v1", "utf8"),
    32
  )
}

/**
 * Create HMAC transform stream with initial data
 * @param hmacKey 32-byte HMAC key
 * @param initialData array of buffers to provide to HMAC before handling stream
 * @returns transform stream and finalize function
 */
const createHmacStream = (hmacKey: Buffer, initialData: Buffer[]) => {
  const hmac = createHmac("sha256", hmacKey)

  // Update HMAC with initial data
  for (const chunk of initialData) {
    hmac.update(chunk)
  }

  // Create transform stream that updates HMAC with pipeline chunk
  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      hmac.update(chunk)
      callback(null, chunk)
    },
  })

  return {
    transform,
    finalize: (finalChunks: Buffer[] = []) => {
      for (const chunk of finalChunks) {
        hmac.update(chunk)
      }
      return hmac.digest()
    },
  }
}

/**
 * Create detached archive
 *
 * Creates encrypted tar archive with HMAC binding to block content.
 * Format: [probe block (36 bytes)][iv (12 bytes)][encrypted data]
 * [tag (16 bytes)][hmac (32 bytes)] — every byte indistinguishable from
 * random, the version declared only under the probe key
 *
 * @param filePaths array of absolute file paths to encrypt
 * @param outputPath path where encrypted archive will be written
 * @param key 32-byte encryption key
 * @param hmacKey 32-byte HMAC key (should be derived separately from encryption key)
 * @param blockContent block content bytes for HMAC binding
 * @returns manifest containing file names and sizes
 */
export const createDetachedArchive = async (
  filePaths: string[],
  outputPath: string,
  key: Buffer,
  hmacKey: Buffer,
  blockContent: Buffer
): Promise<Manifest> => {
  const iv = generateIv()
  const probeBlock = encodeProbeBlock(
    deriveProbeKey(key),
    detachedArchiveVersion
  )
  const cipher = createEncryptionStream(key, iv)
  const output = createWriteStream(outputPath)

  const manifest = await createManifest(filePaths)

  // Initialize HMAC with block content, probe block and initialization
  // vector — the probe is GCM-authenticated on its own, but binding it
  // here too keeps the whole file under one integrity root
  const { transform: hmacTransform, finalize: finalizeHmac } = createHmacStream(
    hmacKey,
    [blockContent, probeBlock, iv]
  )

  // Write probe block and initialization vector at beginning of file
  output.write(probeBlock)
  output.write(iv)

  // Stream: tar → encrypt → hmac → write to file
  await pipeline(createTarStream(filePaths), cipher, hmacTransform, output)

  // Get authentication tag after encryption completes
  const tag = cipher.getAuthTag()

  // Finalize HMAC with tag
  const hmac = finalizeHmac([tag])

  // Append tag and HMAC to end of file
  const fd = await open(outputPath, "a")
  await fd.write(tag)
  await fd.write(hmac)
  await fd.close()

  return manifest
}

/**
 * Restore detached archive
 *
 * Decrypts encrypted tar archive with HMAC binding to block content.
 * Version 2 format: [probe block (36 bytes)][iv (12 bytes)]
 * [encrypted data][tag (16 bytes)][hmac (32 bytes)] — version 1 has no
 * probe block. The keys are already in hand, so the probe trial is free:
 * a match names the version and a miss means the headerless v1 format
 *
 * @param filePath path to encrypted archive
 * @param outputDir directory where files will be extracted
 * @param key 32-byte AES-256 decryption key
 * @param hmacKey 32-byte HMAC key (should be derived separately from decryption key)
 * @param blockContent block content bytes for HMAC verification
 * @returns array of restored file paths
 */
export const restoreDetachedArchive = async (
  filePath: string,
  outputDir: string,
  key: Buffer,
  hmacKey: Buffer,
  blockContent: Buffer
): Promise<RestoredFilePath[]> => {
  const stats = await stat(filePath)
  const fileSize = stats.size

  const fd = await open(filePath, "r")

  // Read probe block candidate from beginning — for a v1 archive these
  // are just iv and payload bytes, which the probe key cannot match
  const probeBlockBuffer = Buffer.alloc(probeBlockLength)
  await fd.read(probeBlockBuffer, 0, probeBlockLength, 0)
  const version = decodeProbeBlock(deriveProbeKey(key), probeBlockBuffer)
  if (version !== null && version !== detachedArchiveVersion) {
    await fd.close()
    throw new UnsupportedVersionError(
      "Detached archive requires a newer version of Superbacked"
    )
  }
  const ivOffset = version === null ? 0 : probeBlockLength

  // Read initialization vector
  const ivBuffer = Buffer.alloc(12)
  await fd.read(ivBuffer, 0, 12, ivOffset)

  // Read authentication tag (bytes fileSize-48 to fileSize-33)
  const authenticationTagBuffer = Buffer.alloc(16)
  await fd.read(authenticationTagBuffer, 0, 16, fileSize - 48)

  // Read HMAC from end (last 32 bytes)
  const hmacBuffer = Buffer.alloc(32)
  await fd.read(hmacBuffer, 0, 32, fileSize - 32)
  await fd.close()

  // Initialize HMAC exactly as creation did for the detected version
  const { transform: hmacTransform, finalize: finalizeHmac } = createHmacStream(
    hmacKey,
    version === null
      ? [blockContent, ivBuffer]
      : [blockContent, probeBlockBuffer, ivBuffer]
  )

  // Initialize decipher with initialization vector and tag
  const decipher = createDecryptionStream(
    key,
    ivBuffer,
    authenticationTagBuffer
  )

  const { extractor, getExtractedFiles } =
    await createTarExtractStream(outputDir)

  // Stream: read file (excluding prefix/tag/hmac) → hmac → decrypt →
  // extract tar
  await pipeline(
    createReadStream(filePath, { start: ivOffset + 12, end: fileSize - 49 }),
    hmacTransform,
    decipher,
    extractor
  )

  // Finalize HMAC with tag and verify
  const computedHmac = finalizeHmac([authenticationTagBuffer])

  if (timingSafeEqual(computedHmac, hmacBuffer) !== true) {
    throw new Error("HMAC verification failed")
  }

  return getExtractedFiles()
}
