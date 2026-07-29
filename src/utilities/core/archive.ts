import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { mkdir, stat } from "fs/promises"
import { basename } from "path"

import { ReadEntry, create, extract } from "tar"

export type Manifest = {
  name: string
  size: number
}[]

export type RestoredFilePath = string

/**
 * Generate random initialization vector for AES-GCM
 * @returns 12-byte initialization vector
 */
export const generateIv = (): Buffer => {
  return randomBytes(12)
}

/**
 * Create manifest from file paths
 * @param filePaths array of file paths
 * @returns manifest containing file names and sizes
 */
export const createManifest = async (
  filePaths: string[]
): Promise<Manifest> => {
  const manifest: Manifest = []
  for (const filePath of filePaths) {
    const fileName = basename(filePath)
    const stats = await stat(filePath)
    manifest.push({ name: fileName, size: stats.size })
  }
  return manifest
}

/**
 * Create AES-256-GCM cipher stream
 * @param key 32-byte encryption key
 * @param iv 12-byte initialization vector
 * @returns cipher stream
 */
export const createEncryptionStream = (key: Buffer, iv: Buffer) => {
  return createCipheriv("aes-256-gcm", key, iv)
}

/**
 * Create AES-256-GCM decipher stream
 * @param key 32-byte decryption key
 * @param iv 12-byte initialization vector
 * @param authTag 16-byte authentication tag
 * @returns decipher stream
 */
export const createDecryptionStream = (
  key: Buffer,
  iv: Buffer,
  authTag: Buffer
) => {
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  return decipher
}

/**
 * Create tar stream from file paths
 * @param filePaths array of file paths to archive
 * @returns tar stream
 */
export const createTarStream = (filePaths: string[]) => {
  return create({ portable: true }, filePaths)
}

/**
 * Create tar extraction stream
 * @param outputDir directory to extract files to
 * @returns extractor stream and function to get extracted file paths
 */
export const createTarExtractStream = async (outputDir: string) => {
  await mkdir(outputDir, { recursive: true })

  const extractedFiles: RestoredFilePath[] = []

  const extractor = extract({
    cwd: outputDir,
    strict: true,
    onentry: (entry: ReadEntry) => {
      extractedFiles.push(entry.path)
    },
  })

  return {
    extractor,
    getExtractedFiles: () => extractedFiles,
  }
}
