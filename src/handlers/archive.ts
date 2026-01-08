import { createHash } from "crypto"
import { unlink } from "fs/promises"

import {
  Manifest,
  RestoredFilePath,
  createEncryptedTarArchive,
  extractSalt,
  restoreEncryptedTarArchive,
} from "@/src/utilities/archive"
import argon2 from "@/src/utilities/argon2"
import {
  generateEncryptionKey,
  generateSalt,
  hkdf,
} from "@/src/utilities/crypto"

/**
 * Generate master key
 * @returns base64-encoded 256-bit encryption key
 */
export const generateMasterKey = (): string => {
  const encryptionKey = generateEncryptionKey()
  return encryptionKey.toString("base64")
}

/**
 * Derive key using HKDF
 * @param key base64-encoded 256-bit key
 * @param info context string for key derivation
 * @param length output length in bytes (defaults to 32 for 256-bit)
 * @param encoding output encoding (defaults to base64)
 * @param salt optional base64-encoded salt (if not provided, uses zero-length buffer)
 * @returns derived key in specified encoding
 */
export const deriveKey = (
  key: string,
  info: string,
  length: number = 32,
  encoding: "base64" | "hex" = "base64",
  salt?: string
): string => {
  const keyBuffer = Buffer.from(key, "base64")

  const saltBuffer = salt
    ? createHash("sha256").update(salt, "base64").digest()
    : Buffer.alloc(0)

  const infoBuffer = Buffer.from(info)

  const derivedKey = hkdf(keyBuffer, saltBuffer, infoBuffer, length)

  return derivedKey.toString(encoding)
}

export type CreateArchiveResult =
  | { error: string; success: false }
  | {
      manifest: Manifest
      success: true
    }

async function createArchiveUsingEncryptionKey(
  filePaths: string[],
  archivePath: string,
  encryptionKey: string
): Promise<{ manifest: Manifest }> {
  const keyBuffer = Buffer.from(encryptionKey, "base64")
  const manifest = await createEncryptedTarArchive(
    filePaths,
    archivePath,
    keyBuffer
  )
  return {
    manifest,
  }
}

async function createArchiveUsingPassphrase(
  filePaths: string[],
  archivePath: string,
  passphrase: string
): Promise<{ manifest: Manifest }> {
  const salt = generateSalt()
  const key = await argon2(passphrase, salt.toString("base64"))
  const manifest = await createEncryptedTarArchive(
    filePaths,
    archivePath,
    key,
    salt
  )
  return {
    manifest,
  }
}

export async function createArchive(
  filePaths: string[],
  archivePath: string,
  options: { encryptionKey: string }
): Promise<CreateArchiveResult>
export async function createArchive(
  filePaths: string[],
  archivePath: string,
  options: { passphrase: string }
): Promise<CreateArchiveResult>
export async function createArchive(
  filePaths: string[],
  archivePath: string,
  options: { encryptionKey: string } | { passphrase: string }
): Promise<CreateArchiveResult> {
  try {
    if ("encryptionKey" in options) {
      // Use encryption key
      const result = await createArchiveUsingEncryptionKey(
        filePaths,
        archivePath,
        options.encryptionKey
      )
      return {
        ...result,
        success: true,
      }
    } else {
      // Use passphrase
      const result = await createArchiveUsingPassphrase(
        filePaths,
        archivePath,
        options.passphrase
      )
      return {
        ...result,
        success: true,
      }
    }
  } catch (error) {
    // Clean up partial archive file if it exists
    await unlink(archivePath).catch(() => {})
    return {
      error:
        error instanceof Error ? error.message : "Could not create archive",
      success: false,
    }
  }
}

export type RestoreArchiveResult =
  | { error: string; success: false }
  | { files: RestoredFilePath[]; success: true }

async function restoreArchiveUsingEncryptionKey(
  filePath: string,
  outputDir: string,
  encryptionKey: string
): Promise<RestoredFilePath[]> {
  const keyBuffer = Buffer.from(encryptionKey, "base64")
  return await restoreEncryptedTarArchive(filePath, outputDir, keyBuffer)
}

async function restoreArchiveUsingPassphrase(
  filePath: string,
  outputDir: string,
  passphrase: string
): Promise<RestoredFilePath[]> {
  const salt = await extractSalt(filePath)
  const key = await argon2(passphrase, salt.toString("base64"))
  return await restoreEncryptedTarArchive(filePath, outputDir, key)
}

export async function restoreArchive(
  filePath: string,
  outputDir: string,
  options: { encryptionKey: string }
): Promise<RestoreArchiveResult>
export async function restoreArchive(
  filePath: string,
  outputDir: string,
  options: { passphrase: string }
): Promise<RestoreArchiveResult>
export async function restoreArchive(
  filePath: string,
  outputDir: string,
  options: { encryptionKey: string } | { passphrase: string }
): Promise<RestoreArchiveResult> {
  try {
    return {
      files:
        "encryptionKey" in options
          ? await restoreArchiveUsingEncryptionKey(
              filePath,
              outputDir,
              options.encryptionKey
            )
          : await restoreArchiveUsingPassphrase(
              filePath,
              outputDir,
              options.passphrase
            ),
      success: true,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not restore archive",
      success: false,
    }
  }
}
