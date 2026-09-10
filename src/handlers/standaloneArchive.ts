import { rename, unlink } from "fs/promises"

import {
  legacyKdfProfile,
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/kdfProfiles"
import { restoreLegacyStandaloneArchive } from "@/src/utilities/core/legacy/standaloneArchive"
import {
  AuthenticationError,
  Manifest,
  RestoredFilePath,
  UnsupportedVersionError,
  computeArchiveKeys,
  createStandaloneArchive as createStandaloneArchiveUtility,
  decodeProbeBlock,
  extractProbeBlock,
  extractSalt,
  restoreStandaloneArchive as restoreStandaloneArchiveUtility,
  schemeVersion,
} from "@/src/utilities/core/standaloneArchive"
import { generateSalt } from "@/src/utilities/crypto/primitives"
import { refineYubiKeyError } from "@/src/utilities/yubikey/management"
import {
  Slot,
  YubiKeyError,
  YubiKeyErrorCode,
} from "@/src/utilities/yubikey/otp"

// Both surfaces pass the memorized passphrase and a slot — hardware access
// lives in computeArchiveKeys. The touch notice is injected per surface:
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
 * @param paranoid stretch at the paranoid profile (Paranoid mode —
 * restoring requires the mode enabled)
 * @param slot optional YubiKey challenge-response slot (see
 * computeArchiveKeys in src/utilities/core/standaloneArchive.ts)
 * @param onTouchRequired invoked while the YubiKey awaits touch
 * @returns result with manifest or error
 */
export async function createStandaloneArchive(
  filePaths: string[],
  archivePath: string,
  passphrase: string,
  paranoid: boolean,
  slot?: Slot,
  onTouchRequired?: () => void
): Promise<CreateStandaloneArchiveResult> {
  // Write to a temporary path and rename into place on success so a failed
  // creation (disk full, unreadable input file) never destroys an existing
  // archive at archivePath.
  const temporaryPath = `${archivePath}.tmp`
  try {
    const salt = generateSalt()
    const keys = await computeArchiveKeys(
      passphrase,
      salt,
      paranoid === true ? paranoidKdfProfile : standardKdfProfile,
      slot === undefined ? undefined : { onTouchRequired, slot }
    )
    const manifest = await createStandaloneArchiveUtility(
      filePaths,
      temporaryPath,
      salt,
      keys
    )
    await rename(temporaryPath, archivePath)
    return {
      manifest,
      success: true,
    }
  } catch (caughtError) {
    const error = await refineYubiKeyError(caughtError)
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
      // Present when the probe revealed a version this build does not
      // implement — the passphrase is correct, so the error must never
      // read as a wrong passphrase
      unsupportedVersion?: boolean
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
 * computeArchiveKeys in src/utilities/core/standaloneArchive.ts)
 * @param onTouchRequired invoked while the YubiKey awaits touch
 * @returns result with extracted file paths or error
 */
export async function restoreStandaloneArchive(
  filePath: string,
  outputDir: string,
  passphrase: string,
  paranoid: boolean,
  slot?: Slot,
  onTouchRequired?: () => void
): Promise<RestoreStandaloneArchiveResult> {
  try {
    const salt = await extractSalt(filePath)
    const probeBlock = await extractProbeBlock(filePath)
    const yubikey = slot === undefined ? undefined : { onTouchRequired, slot }
    // Profile trial, newest first — each trial is one stretch (and, with
    // YubiKey, one touch) expanded into both keys. A probe match names
    // the version; matching none means the headerless v1 format, whose
    // key is the legacy trial’s, already in hand. The paranoid row is
    // trialed only when the mode is on — a deliberate contract keeping
    // wrong passphrases fast for everyone else, at the cost of paranoid
    // artifacts reporting a wrong passphrase until the mode is enabled
    const profiles = [standardKdfProfile, legacyKdfProfile]
    if (paranoid === true) {
      profiles.push(paranoidKdfProfile)
    }
    let files: null | RestoredFilePath[] = null
    let legacyKey: null | Buffer = null
    for (const profile of profiles) {
      const keys = await computeArchiveKeys(passphrase, salt, profile, yubikey)
      if (profile === legacyKdfProfile) {
        legacyKey = keys.key
      }
      const version = decodeProbeBlock(keys.probeKey, probeBlock)
      if (version === null) {
        continue
      }
      if (version !== schemeVersion) {
        throw new UnsupportedVersionError(
          "Archive requires a newer version of Superbacked"
        )
      }
      files = await restoreStandaloneArchiveUtility(
        filePath,
        outputDir,
        keys.key
      )
      break
    }
    if (files === null && legacyKey !== null) {
      files = await restoreLegacyStandaloneArchive(
        filePath,
        outputDir,
        legacyKey
      )
    }
    if (files === null) {
      throw new AuthenticationError("Wrong passphrase or corrupted archive")
    }
    return {
      files,
      success: true,
    }
  } catch (caughtError) {
    const error = await refineYubiKeyError(caughtError)
    return {
      authenticationFailed: error instanceof AuthenticationError,
      error:
        error instanceof Error
          ? error.message
          : "Could not restore standalone archive",
      success: false,
      unsupportedVersion:
        error instanceof UnsupportedVersionError ? true : undefined,
      yubikeyErrorCode: error instanceof YubiKeyError ? error.code : undefined,
    }
  }
}
