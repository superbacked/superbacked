import { unlink } from "fs/promises"

import { decodeBlockContent } from "@/src/utilities/core/block"
import {
  Manifest,
  RestoredFilePath,
  UnsupportedVersionError,
  createDetachedArchive as createDetachedArchiveUtility,
  deriveDetachedArchiveKeys,
  deriveProbeKey,
  extractProbeBlock,
  restoreDetachedArchive as restoreDetachedArchiveUtility,
  schemeVersion,
} from "@/src/utilities/core/detachedArchive"
import {
  deriveLegacyDetachedArchiveKeys,
  restoreLegacyDetachedArchive,
} from "@/src/utilities/core/legacy/detachedArchive"
import { decodeProbeBlock } from "@/src/utilities/crypto/schemeHeader"

// The consumer of both detached archive schemes: restoration probes for
// the current scheme and falls back to the legacy scheme only when no
// probe matches — the fallback is bounded here, so neither scheme module
// references the other and no era ever crosses to the renderer.

// Everything the renderer needs to prompt for and restore the detached
// archive paired with a restored block — held opaquely and handed back
// verbatim (see describeDetachedArchive and src/handlers/restore.ts)
export interface DetachedArchive {
  blockContent: string
  filename: string
}

// Block content pairing a secret with a detached archive carries the
// master key alongside the secret (see decodeBlockContent in
// src/utilities/core/block.ts)
const extractMasterKey = (blockContent: string): null | Buffer => {
  const { masterKey } = decodeBlockContent(blockContent)
  return masterKey === null ? null : Buffer.from(masterKey, "base64")
}

/**
 * Describe the detached archive paired with a block, when one exists —
 * the filename locates the archive on disk before restoration can probe
 * it, so it is the one property named by the block’s era rather than
 * detected
 * @param blockContent decrypted block content
 * @param legacy block restored through the legacy payload path (see
 * src/handlers/restore.ts)
 * @returns block content and archive filename, or `null` when the block
 * carries no master key
 */
export const describeDetachedArchive = (
  blockContent: string,
  legacy: boolean
): null | DetachedArchive => {
  const masterKey = extractMasterKey(blockContent)
  if (masterKey === null) {
    return null
  }
  const keys =
    legacy === true
      ? deriveLegacyDetachedArchiveKeys(masterKey)
      : deriveDetachedArchiveKeys(masterKey)
  return {
    blockContent: blockContent,
    filename: keys.filename,
  }
}

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
 * @param blockContent block content string carrying the master key
 * @returns result with manifest or error
 */
export async function createDetachedArchive(
  filePaths: string[],
  archivePath: string,
  blockContent: string
): Promise<CreateDetachedArchiveResult> {
  try {
    const masterKey = extractMasterKey(blockContent)
    if (masterKey === null) {
      throw new Error("Master key not found")
    }
    const keys = deriveDetachedArchiveKeys(masterKey)
    const manifest = await createDetachedArchiveUtility(
      filePaths,
      archivePath,
      keys.encryptionKey,
      keys.hmacKey,
      Buffer.from(blockContent, "utf-8")
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
  | {
      error: string
      success: false
      // Present when the probe revealed a version this build does not
      // implement — the keys are correct, so the error must never read
      // as corruption
      unsupportedVersion?: boolean
    }
  | { files: RestoredFilePath[]; success: true }

/**
 * Restore detached archive
 * @param filePath path to encrypted archive
 * @param outputDir directory where files will be extracted
 * @param blockContent decrypted block content carrying the master key
 * @returns result with extracted file paths or error
 */
export async function restoreDetachedArchive(
  filePath: string,
  outputDir: string,
  blockContent: string
): Promise<RestoreDetachedArchiveResult> {
  try {
    const masterKey = extractMasterKey(blockContent)
    if (masterKey === null) {
      throw new Error("Master key not found")
    }
    const blockContentBuffer = Buffer.from(blockContent, "utf-8")
    // Probe for the current scheme — the keys are already in hand, so
    // the trial is free. A revealed version restores at it (or reports
    // an unsupported one); no probe match means the archive predates
    // probes and restoration falls back to the legacy scheme
    const keys = deriveDetachedArchiveKeys(masterKey)
    const version = decodeProbeBlock(
      deriveProbeKey(keys.encryptionKey),
      await extractProbeBlock(filePath)
    )
    if (version !== null && version !== schemeVersion) {
      throw new UnsupportedVersionError(
        "Detached archive requires a newer version of Superbacked"
      )
    }
    let files: RestoredFilePath[]
    if (version === schemeVersion) {
      files = await restoreDetachedArchiveUtility(
        filePath,
        outputDir,
        keys.encryptionKey,
        keys.hmacKey,
        blockContentBuffer
      )
    } else {
      const legacyKeys = deriveLegacyDetachedArchiveKeys(masterKey)
      files = await restoreLegacyDetachedArchive(
        filePath,
        outputDir,
        legacyKeys.encryptionKey,
        legacyKeys.hmacKey,
        blockContentBuffer
      )
    }
    return {
      files,
      success: true,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not restore archive",
      success: false,
      unsupportedVersion:
        error instanceof UnsupportedVersionError ? true : undefined,
    }
  }
}
