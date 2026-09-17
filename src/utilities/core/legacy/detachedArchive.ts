import { timingSafeEqual } from "crypto"
import { createReadStream } from "fs"
import { open, stat } from "fs/promises"
import { pipeline } from "stream/promises"

import {
  RestoredFilePath,
  createDecryptionStream,
  createHmacStream,
  createTarExtractStream,
} from "@/src/utilities/core/archive"
import { hkdf } from "@/src/utilities/crypto/primitives"

// The detached archive scheme as shipped — frozen forever and
// restoration-only, applying to archives created with v1.10.0 through
// v1.12.1. Every string below is a shipped identity: archives in the
// wild derive from these exact bytes, so their historic -v1 suffixes
// stay — fossils of the era before artifacts carried versions (see
// src/utilities/crypto/schemeHeader.ts). The current scheme
// lives in src/utilities/core/detachedArchive.ts, under its own keys.
// Pinned against shipped artifacts by the legacy reference pair
// (tests/fixtures/legacy/blocks/detached-archive).

const encryptionKeyInfo = "encryption-key-v1"
const hmacKeyInfo = "hmac-v1"
const filenameInfo = "filename-v1"

export interface LegacyDetachedArchiveKeys {
  encryptionKey: Buffer
  filename: string
  hmacKey: Buffer
}

/**
 * Derive the legacy detached archive key chain from a master key — the
 * chain every archive created before version 2 restores under
 * @param masterKey 32-byte master key stored in the block content
 * @returns encryption key, HMAC key and archive filename
 */
export const deriveLegacyDetachedArchiveKeys = (
  masterKey: Buffer
): LegacyDetachedArchiveKeys => {
  return {
    encryptionKey: hkdf(
      masterKey,
      Buffer.alloc(0),
      Buffer.from(encryptionKeyInfo),
      32
    ),
    filename: hkdf(
      masterKey,
      Buffer.alloc(0),
      Buffer.from(filenameInfo),
      16
    ).toString("hex"),
    hmacKey: hkdf(masterKey, Buffer.alloc(0), Buffer.from(hmacKeyInfo), 32),
  }
}

/**
 * Restore legacy detached archive
 *
 * Decrypts encrypted tar archive with HMAC binding to block content.
 * Format: [iv (12 bytes)][encrypted data][tag (16 bytes)][hmac (32 bytes)]
 * — headerless, predating probe blocks
 *
 * @param filePath path to encrypted archive
 * @param outputDir directory where files will be extracted
 * @param key 32-byte AES-256 decryption key
 * @param hmacKey 32-byte HMAC key (should be derived separately from decryption key)
 * @param blockContent block content bytes for HMAC verification
 * @returns array of restored file paths
 */
export const restoreLegacyDetachedArchive = async (
  filePath: string,
  outputDir: string,
  key: Buffer,
  hmacKey: Buffer,
  blockContent: Buffer
): Promise<RestoredFilePath[]> => {
  const stats = await stat(filePath)
  const fileSize = stats.size

  const fd = await open(filePath, "r")

  // Read initialization vector
  const ivBuffer = Buffer.alloc(12)
  await fd.read(ivBuffer, 0, 12, 0)

  // Read authentication tag (bytes fileSize-48 to fileSize-33)
  const authenticationTagBuffer = Buffer.alloc(16)
  await fd.read(authenticationTagBuffer, 0, 16, fileSize - 48)

  // Read HMAC from end (last 32 bytes)
  const hmacBuffer = Buffer.alloc(32)
  await fd.read(hmacBuffer, 0, 32, fileSize - 32)
  await fd.close()

  // Initialize HMAC exactly as creation did
  const { transform: hmacTransform, finalize: finalizeHmac } = createHmacStream(
    hmacKey,
    [blockContent, ivBuffer]
  )

  // Initialize decipher with initialization vector and tag
  const decipher = createDecryptionStream(
    key,
    ivBuffer,
    authenticationTagBuffer
  )

  const { extractor, getExtractedFiles } =
    await createTarExtractStream(outputDir)

  // Stream: read file (excluding iv/tag/hmac) → hmac → decrypt →
  // extract tar
  await pipeline(
    createReadStream(filePath, { start: 12, end: fileSize - 49 }),
    hmacTransform,
    decipher,
    extractor
  )

  // Finalize HMAC with tag and verify
  const computedHmac = finalizeHmac([authenticationTagBuffer])

  if (timingSafeEqual(computedHmac, hmacBuffer) !== true) {
    throw new Error("HMAC verification failed")
  }

  return getExtractedFiles()
}
