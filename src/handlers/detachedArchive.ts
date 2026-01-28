import { unlink } from "fs/promises"

import {
  Manifest,
  RestoredFilePath,
  createDetachedArchive as createDetachedArchiveUtility,
  restoreDetachedArchive as restoreDetachedArchiveUtility,
} from "@/src/utilities/detachedArchive"

export type CreateDetachedArchiveResult =
  | { error: string; success: false }
  | {
      manifest: Manifest
      success: true
    }

/**
 * Create detached archive
 * @param filePaths array of absolute file paths to encrypt
 * @param archivePath path where detached archive will be written
 * @param encryptionKey base64-encoded 256-bit encryption key
 * @param hmacKey base64-encoded 256-bit HMAC key
 * @param blockContent block content string for HMAC binding
 * @returns result with manifest or error
 */
export async function createDetachedArchive(
  filePaths: string[],
  archivePath: string,
  encryptionKey: string,
  hmacKey: string,
  blockContent: string
): Promise<CreateDetachedArchiveResult> {
  try {
    const encryptionKeyBuffer = Buffer.from(encryptionKey, "base64")
    const hmacKeyBuffer = Buffer.from(hmacKey, "base64")
    const blockContentBuffer = Buffer.from(blockContent, "utf-8")
    const manifest = await createDetachedArchiveUtility(
      filePaths,
      archivePath,
      encryptionKeyBuffer,
      hmacKeyBuffer,
      blockContentBuffer
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

export type RestoreDetachedArchiveResult =
  | { error: string; success: false }
  | { files: RestoredFilePath[]; success: true }

/**
 * Restore detached archive
 * @param filePath path to encrypted archive
 * @param outputDir directory where files will be extracted
 * @param encryptionKey base64-encoded 256-bit encryption key
 * @param hmacKey base64-encoded 256-bit HMAC key
 * @param blockContent block content string for HMAC verification
 * @returns result with extracted file paths or error
 */
export async function restoreDetachedArchive(
  filePath: string,
  outputDir: string,
  encryptionKey: string,
  hmacKey: string,
  blockContent: string
): Promise<RestoreDetachedArchiveResult> {
  try {
    const encryptionKeyBuffer = Buffer.from(encryptionKey, "base64")
    const hmacKeyBuffer = Buffer.from(hmacKey, "base64")
    const blockContentBuffer = Buffer.from(blockContent, "utf-8")
    const files = await restoreDetachedArchiveUtility(
      filePath,
      outputDir,
      encryptionKeyBuffer,
      hmacKeyBuffer,
      blockContentBuffer
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
