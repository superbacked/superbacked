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
  generateNonce,
} from "@/src/utilities/archiveCore"

export type { Manifest, RestoredFilePath }

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
 * Format: [nonce (12 bytes)][encrypted data][tag (16 bytes)][hmac (32 bytes)]
 *
 * @param filePaths array of absolute file paths to encrypt
 * @param outputPath path where encrypted archive will be written
 * @param key 32-byte encryption key
 * @param hmacKey 32-byte HMAC key (should be derived separately from encryption key)
 * @param blockContent block content bytes for HMAC binding
 * @param gzip whether to gzip-compress archive, defaults to false
 * @returns manifest containing file names and sizes
 */
export const createDetachedArchive = async (
  filePaths: string[],
  outputPath: string,
  key: Buffer,
  hmacKey: Buffer,
  blockContent: Buffer,
  gzip = false
): Promise<Manifest> => {
  const nonce = generateNonce()
  const cipher = createEncryptionStream(key, nonce)
  const output = createWriteStream(outputPath)

  const manifest = await createManifest(filePaths)

  // Initialize HMAC with block content and nonce
  const { transform: hmacTransform, finalize: finalizeHmac } = createHmacStream(
    hmacKey,
    [blockContent, nonce]
  )

  // Write nonce at beginning of file
  output.write(nonce)

  // Stream: tar → gzip (optional) → encrypt → hmac → write to file
  await pipeline(
    createTarStream(filePaths, gzip),
    cipher,
    hmacTransform,
    output
  )

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
 * Expected format: [nonce (12 bytes)][encrypted data][tag (16 bytes)][hmac (32 bytes)]
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

  // Read nonce from beginning (bytes 0-11)
  const nonceBuffer = Buffer.alloc(12)
  await fd.read(nonceBuffer, 0, 12, 0)

  // Read authentication tag (bytes fileSize-48 to fileSize-33)
  const authenticationTagBuffer = Buffer.alloc(16)
  await fd.read(authenticationTagBuffer, 0, 16, fileSize - 48)

  // Read HMAC from end (last 32 bytes)
  const hmacBuffer = Buffer.alloc(32)
  await fd.read(hmacBuffer, 0, 32, fileSize - 32)
  await fd.close()

  // Initialize HMAC with block content and nonce
  const { transform: hmacTransform, finalize: finalizeHmac } = createHmacStream(
    hmacKey,
    [blockContent, nonceBuffer]
  )

  // Initialize decipher with nonce and tag
  const decipher = createDecryptionStream(
    key,
    nonceBuffer,
    authenticationTagBuffer
  )

  const { extractor, getExtractedFiles } =
    await createTarExtractStream(outputDir)

  // Stream: read file (excluding nonce/tag/hmac) → hmac → decrypt → gunzip (optional) → extract tar
  await pipeline(
    createReadStream(filePath, { start: 12, end: fileSize - 49 }),
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
