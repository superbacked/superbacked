import { createReadStream, createWriteStream } from "fs"
import { open, stat } from "fs/promises"
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
 * Create standalone archive
 *
 * Creates encrypted tar archive using passphrase-derived key.
 * Format: [salt (16 bytes)][nonce (12 bytes)][encrypted data][tag (16 bytes)]
 *
 * @param filePaths array of absolute file paths to encrypt
 * @param outputPath path where standalone archive will be written
 * @param salt 16-byte salt
 * @param key 32-byte encryption key
 * @param gzip whether to gzip-compress archive, defaults to false
 * @returns manifest containing file names and sizes
 */
export const createStandaloneArchive = async (
  filePaths: string[],
  outputPath: string,
  salt: Buffer,
  key: Buffer,
  gzip = false
): Promise<Manifest> => {
  const nonce = generateNonce()
  const cipher = createEncryptionStream(key, nonce)
  const output = createWriteStream(outputPath)

  const manifest = await createManifest(filePaths)

  // Write salt and nonce at beginning of file
  output.write(salt)
  output.write(nonce)

  // Stream: tar → gzip (optional) → encrypt → write to file
  await pipeline(createTarStream(filePaths, gzip), cipher, output)

  // Get authentication tag after encryption completes
  const tag = cipher.getAuthTag()

  // Append tag to end of file
  const fd = await open(outputPath, "a")
  await fd.write(tag)
  await fd.close()

  return manifest
}

/**
 * Extract salt from standalone archive
 *
 * @param filePath path to archive
 * @returns 16-byte salt
 */
export const extractSalt = async (filePath: string): Promise<Buffer> => {
  const fd = await open(filePath, "r")
  const saltBuffer = Buffer.alloc(16)
  await fd.read(saltBuffer, 0, 16, 0)
  await fd.close()
  return saltBuffer
}

/**
 * Restore standalone archive
 *
 * Decrypts encrypted tar archive using passphrase-derived key.
 * Expected format: [salt (16 bytes)][nonce (12 bytes)][encrypted data][tag (16 bytes)]
 *
 * @param filePath path to encrypted archive
 * @param outputDir directory where files will be extracted
 * @param key 32-byte AES-256 decryption key
 * @returns array of restored file paths
 */
export const restoreStandaloneArchive = async (
  filePath: string,
  outputDir: string,
  key: Buffer
): Promise<RestoredFilePath[]> => {
  const stats = await stat(filePath)
  const fileSize = stats.size

  const fd = await open(filePath, "r")

  // Read salt from beginning (bytes 0-15)
  const saltBuffer = Buffer.alloc(16)
  await fd.read(saltBuffer, 0, 16, 0)

  // Read nonce (bytes 16-27)
  const nonceBuffer = Buffer.alloc(12)
  await fd.read(nonceBuffer, 0, 12, 16)

  // Read authentication tag from end (last 16 bytes)
  const authenticationTagBuffer = Buffer.alloc(16)
  await fd.read(authenticationTagBuffer, 0, 16, fileSize - 16)
  await fd.close()

  // Initialize decipher with nonce and tag
  const decipher = createDecryptionStream(
    key,
    nonceBuffer,
    authenticationTagBuffer
  )

  const { extractor, getExtractedFiles } =
    await createTarExtractStream(outputDir)

  // Stream: read file (excluding salt/nonce/tag) → decrypt → gunzip (optional) → extract tar
  await pipeline(
    createReadStream(filePath, { start: 28, end: fileSize - 17 }),
    decipher,
    extractor
  )

  return getExtractedFiles()
}
