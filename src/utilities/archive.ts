import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { createReadStream, createWriteStream } from "fs"
import { mkdir, open, stat } from "fs/promises"
import { basename } from "path"
import { pipeline } from "stream/promises"

import { ReadEntry, create, extract } from "tar"

export type Manifest = {
  name: string
  size: number
}[]

/**
 * Create encrypted tar archive
 *
 * Creates a tar archive (optionally gzip-compressed) and encrypts archive using AES-256-GCM.
 * All archives include a random salt for consistent output format in case key is derived using KDF.
 * The output format is: [salt or padding (16 bytes)][nonce (12 bytes)][encrypted data][tag (16 bytes)]
 *
 * @param filePaths array of absolute file paths to encrypt
 * @param outputPath path where encrypted archive will be written
 * @param key 32-byte encryption key
 * @param salt 16-byte salt, defaults to 16 bytes of random padding
 * @param gzip whether to gzip-compress archive, defaults to false
 * @returns manifest containing file names and sizes
 */
export const createEncryptedTarArchive = async (
  filePaths: string[],
  outputPath: string,
  key: Buffer,
  salt?: Buffer,
  gzip = false
): Promise<Manifest> => {
  const randomBytesOrSalt = salt ?? randomBytes(16)
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
  const output = createWriteStream(outputPath)

  const manifest: Manifest = []

  // Collect file metadata for manifest
  for (const filePath of filePaths) {
    const fileName = basename(filePath)
    const stats = await stat(filePath)
    manifest.push({ name: fileName, size: stats.size })
  }

  // Write random bytes or salt and nonce at beginning of file
  output.write(randomBytesOrSalt)
  output.write(nonce)

  // Stream: tar → gzip (optional) → encrypt → write to file
  await pipeline(
    create(
      {
        gzip: gzip,
        portable: true,
      },
      filePaths
    ),
    cipher,
    output
  )

  // Get authentication tag after encryption completes
  const tag = cipher.getAuthTag()

  // Append tag to end of file
  const fd = await open(outputPath, "a")
  await fd.write(tag)
  await fd.close()

  return manifest
}

/**
 * Extract salt from archive
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

export type RestoredFilePath = string

/**
 * Restore encrypted tar archive
 *
 * Decrypts archive using AES-256-GCM and extracts tar files (automatically handles gzip decompression).
 * Expected format: [salt (16 bytes)][nonce (12 bytes)][encrypted data][tag (16 bytes)]
 *
 * @param filePath path to encrypted archive
 * @param outputDir directory where files will be extracted
 * @param key 32-byte AES-256 decryption key
 * @returns array of restored file paths
 */
export const restoreEncryptedTarArchive = async (
  filePath: string,
  outputDir: string,
  key: Buffer
): Promise<RestoredFilePath[]> => {
  const stats = await stat(filePath)
  const fileSize = stats.size

  // Read nonce from beginning skipping salt (bytes 16-27)
  const fd = await open(filePath, "r")
  const nonceBuffer = Buffer.alloc(12)
  await fd.read(nonceBuffer, 0, 12, 16)

  // Read authentication tag from end (last 16 bytes)
  const tagBuffer = Buffer.alloc(16)
  await fd.read(tagBuffer, 0, 16, fileSize - 16)
  await fd.close()

  // Initialize decipher with nonce and tag
  const decipher = createDecipheriv("aes-256-gcm", key, nonceBuffer)
  decipher.setAuthTag(tagBuffer)

  await mkdir(outputDir, { recursive: true })

  const extractedFiles: RestoredFilePath[] = []

  // Stream: read file (excluding salt/nonce/tag) → decrypt → gunzip (optional) → extract tar
  await pipeline(
    createReadStream(filePath, { start: 28, end: fileSize - 17 }),
    decipher,
    extract({
      cwd: outputDir,
      onentry: (entry: ReadEntry) => {
        extractedFiles.push(entry.path)
      },
    })
  )

  return extractedFiles
}
