import { rename, unlink } from "fs/promises"

import { generateSalt } from "@/src/utilities/crypto"
import {
  AuthenticationError,
  Manifest,
  RestoredFilePath,
  computeArchiveKey,
  createStandaloneArchive as createStandaloneArchiveUtility,
  extractSalt,
  restoreStandaloneArchive as restoreStandaloneArchiveUtility,
} from "@/src/utilities/standaloneArchive"
import { Slot, YubiKeyError, YubiKeyErrorCode } from "@/src/utilities/yubikey"

// Both surfaces pass the memorized passphrase and a slot — hardware access
// lives in computeArchiveKey. The touch notice is injected per surface:
// the renderer-facing registration broadcasts to windows (see
// src/registerHandlers.ts) and the command-line interface prints to stderr
// (see src/cli/standaloneArchive.ts)

export type CreateStandaloneArchiveResult =
  | {
      error: string
      success: false
      // Present when the failure belongs to the YubiKey step — the code
      // routes error display (see src/shared/utilities/yubikeyErrorMessage.ts)
      yubikeyErrorCode?: YubiKeyErrorCode
    }
  | {
      manifest: Manifest
      success: true
    }

/**
 * Create standalone archive
 * @param filePaths array of absolute file paths to encrypt
 * @param archivePath path where standalone archive will be written
 * @param passphrase memorized passphrase
 * @param slot optional YubiKey challenge-response slot (see
 * computeArchiveKey in src/utilities/standaloneArchive.ts)
 * @param onTouchRequired invoked while the YubiKey awaits touch
 * @returns result with manifest or error
 */
export async function createStandaloneArchive(
  filePaths: string[],
  archivePath: string,
  passphrase: string,
  slot?: Slot,
  onTouchRequired?: () => void
): Promise<CreateStandaloneArchiveResult> {
  // Write to a temporary path and rename into place on success so a failed
  // creation (disk full, unreadable input file) never destroys an existing
  // archive at archivePath.
  const temporaryPath = `${archivePath}.tmp`
  try {
    const salt = generateSalt()
    const key = await computeArchiveKey(
      passphrase,
      salt,
      slot === undefined ? undefined : { onTouchRequired, slot }
    )
    const manifest = await createStandaloneArchiveUtility(
      filePaths,
      temporaryPath,
      salt,
      key
    )
    await rename(temporaryPath, archivePath)
    return {
      manifest,
      success: true,
    }
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not create standalone archive",
      success: false,
      yubikeyErrorCode: error instanceof YubiKeyError ? error.code : undefined,
    }
  }
}

export type RestoreStandaloneArchiveResult =
  | {
      authenticationFailed: boolean
      error: string
      success: false
      // Present when the failure belongs to the YubiKey step — the code
      // routes error display (see src/shared/utilities/yubikeyErrorMessage.ts)
      yubikeyErrorCode?: YubiKeyErrorCode
    }
  | { files: RestoredFilePath[]; success: true }

/**
 * Restore standalone archive
 * @param filePath path to encrypted archive
 * @param outputDir directory where files will be extracted
 * @param passphrase memorized passphrase
 * @param slot optional YubiKey challenge-response slot (see
 * computeArchiveKey in src/utilities/standaloneArchive.ts)
 * @param onTouchRequired invoked while the YubiKey awaits touch
 * @returns result with extracted file paths or error
 */
export async function restoreStandaloneArchive(
  filePath: string,
  outputDir: string,
  passphrase: string,
  slot?: Slot,
  onTouchRequired?: () => void
): Promise<RestoreStandaloneArchiveResult> {
  try {
    const salt = await extractSalt(filePath)
    const key = await computeArchiveKey(
      passphrase,
      salt,
      slot === undefined ? undefined : { onTouchRequired, slot }
    )
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
      authenticationFailed: error instanceof AuthenticationError,
      error:
        error instanceof Error
          ? error.message
          : "Could not restore standalone archive",
      success: false,
      yubikeyErrorCode: error instanceof YubiKeyError ? error.code : undefined,
    }
  }
}
