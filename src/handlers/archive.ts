import { deriveDetachedArchiveKeys } from "@/src/utilities/core/detachedArchive"
import { generateEncryptionKey } from "@/src/utilities/crypto/primitives"

/**
 * Generate master key
 * @returns base64-encoded 256-bit encryption key
 */
export const generateMasterKey = (): string => {
  const encryptionKey = generateEncryptionKey()
  return encryptionKey.toString("base64")
}

/**
 * Derive the detached archive filename from a master key — the one piece
 * of the key chain the renderer needs, to name the archive at creation:
 * the keys themselves never leave the handlers (see
 * src/handlers/detachedArchive.ts)
 * @param masterKey base64-encoded 256-bit master key
 * @returns hex archive filename
 */
export const deriveDetachedArchiveFilename = (masterKey: string): string => {
  return deriveDetachedArchiveKeys(Buffer.from(masterKey, "base64")).filename
}
