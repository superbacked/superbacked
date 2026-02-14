import { unlink } from "fs/promises"

import argon2 from "@/src/utilities/argon2"
import { generateSalt } from "@/src/utilities/crypto"
import {
  Manifest,
  RestoredFilePath,
  createStandaloneArchive as createStandaloneArchiveUtility,
  extractSalt,
  restoreStandaloneArchive as restoreStandaloneArchiveUtility,
} from "@/src/utilities/standaloneArchive"

export type CreateStandaloneArchiveResult =
  | { error: string; success: false }
  | {
      manifest: Manifest
      success: true
    }

/**
 * Create standalone archive
 * @param filePaths array of absolute file paths to encrypt
 * @param archivePath path where standalone archive will be written
 * @param passphrase passphrase provided to key derivation function
 * @returns result with manifest or error
 */
export async function createStandaloneArchive(
  filePaths: string[],
  archivePath: string,
  passphrase: string
): Promise<CreateStandaloneArchiveResult> {
  try {
    const salt = generateSalt()
    const key = await argon2(passphrase, salt.toString("base64"))
    const manifest = await createStandaloneArchiveUtility(
      filePaths,
      archivePath,
      salt,
      key
    )
    return {
      manifest,
      success: true,
    }
  } catch (error) {
    await unlink(archivePath).catch(() => {})
    return {
      error:
        error instanceof Error ? error.message : "Could not create archive",
      success: false,
    }
  }
}

export type RestoreStandaloneArchiveResult =
  | { error: string; success: false }
  | { files: RestoredFilePath[]; success: true }

/**
 * Restore standalone archive
 * @param filePath path to encrypted archive
 * @param outputDir directory where files will be extracted
 * @param passphrase passphrase provided to key derivation function
 * @returns result with extracted file paths or error
 */
export async function restoreStandaloneArchive(
  filePath: string,
  outputDir: string,
  passphrase: string
): Promise<RestoreStandaloneArchiveResult> {
  try {
    const salt = await extractSalt(filePath)
    const key = await argon2(passphrase, salt.toString("base64"))
    const files = await restoreStandaloneArchiveUtility(
      filePath,
      outputDir,
      key
    )
    return {
      files,
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
