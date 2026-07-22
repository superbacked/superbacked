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
  generateIv,
} from "@/src/utilities/archiveCore"

export type { Manifest, RestoredFilePath }

// Thrown when an archive fails authentication — a wrong passphrase and a
// corrupted archive are cryptographically indistinguishable (AES-256-GCM).
export class AuthenticationError extends Error {}

/**
 * Create standalone archive
 *
 * Creates encrypted tar archive using passphrase-derived key.
 * Format: [salt (16 bytes)][iv (12 bytes)][encrypted data][tag (16 bytes)]
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
  const iv = generateIv()
  const cipher = createEncryptionStream(key, iv)
  const output = createWriteStream(outputPath)

  const manifest = await createManifest(filePaths)

  // Write salt and initialization vector at beginning of file
  output.write(salt)
  output.write(iv)

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
 * Expected format: [salt (16 bytes)][iv (12 bytes)][encrypted data][tag (16 bytes)]
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

  // Read initialization vector (bytes 16-27)
  const ivBuffer = Buffer.alloc(12)
  await fd.read(ivBuffer, 0, 12, 16)

  // Read authentication tag from end (last 16 bytes)
  const authenticationTagBuffer = Buffer.alloc(16)
  await fd.read(authenticationTagBuffer, 0, 16, fileSize - 16)
  await fd.close()

  // Initialize decipher with initialization vector and tag
  const decipher = createDecryptionStream(
    key,
    ivBuffer,
    authenticationTagBuffer
  )

  const { extractor, getExtractedFiles } =
    await createTarExtractStream(outputDir)

  // Stream: read file (excluding salt/iv/tag) → decrypt → gunzip (optional) → extract tar
  try {
    await pipeline(
      createReadStream(filePath, { start: 28, end: fileSize - 17 }),
      decipher,
      extractor
    )
  } catch (error) {
    // GCM only checks the tag at end of stream, so a wrong passphrase streams
    // garbage plaintext into the tar extractor, which rejects it at the first
    // 512-byte header with a parser internal (“invalid base256 encoding”) —
    // long before the tag check. Genuine I/O failures (ENOSPC, EACCES) carry
    // a syscall; anything else is the parser, gunzip or decipher rejecting
    // garbage.
    if (error instanceof Error && "syscall" in error) {
      throw error
    }
    throw new AuthenticationError("Wrong passphrase or corrupted archive")
  }

  return getExtractedFiles()
}
