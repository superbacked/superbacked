import { createReadStream } from "fs"
import { open, stat } from "fs/promises"
import { pipeline } from "stream/promises"

import {
  RestoredFilePath,
  createDecryptionStream,
  createTarExtractStream,
} from "@/src/utilities/core/archive"
import { AuthenticationError } from "@/src/utilities/core/standaloneArchive"

// The standalone archive scheme as shipped — frozen forever and
// restoration-only, applying to archives created with v1.10.0 through
// v1.12.1. Headerless layout [salt (16 bytes)][iv (12 bytes)]
// [encrypted data][tag (16 bytes)], keyed by the raw Argon2d stretched
// key at the legacy profile: no HKDF and no identity strings — the
// absence is itself the shipped contract, which is why (unlike
// src/utilities/core/legacy/detachedArchive.ts) there is no legacy key
// chain here. The key arrives from the legacy trial in the handler,
// already in hand (see src/handlers/standaloneArchive.ts). Pinned
// against shipped artifacts by the legacy reference archive
// (tests/fixtures/legacy/standalone-archives).

const saltLength = 16
const ivLength = 12
const tagLength = 16

/**
 * Restore legacy standalone archive
 *
 * Decrypts encrypted tar archive using the raw stretched key.
 * Format: [salt (16 bytes)][iv (12 bytes)][encrypted data][tag (16 bytes)]
 * — headerless, predating probe blocks
 *
 * @param filePath path to encrypted archive
 * @param outputDir directory where files will be extracted
 * @param key 32-byte AES-256 decryption key (the raw stretched key)
 * @returns array of restored file paths
 */
export const restoreLegacyStandaloneArchive = async (
  filePath: string,
  outputDir: string,
  key: Buffer
): Promise<RestoredFilePath[]> => {
  const stats = await stat(filePath)
  const fileSize = stats.size

  const fd = await open(filePath, "r")

  // Read initialization vector
  const ivBuffer = Buffer.alloc(ivLength)
  await fd.read(ivBuffer, 0, ivLength, saltLength)

  // Read authentication tag from end (last 16 bytes)
  const authenticationTagBuffer = Buffer.alloc(tagLength)
  await fd.read(authenticationTagBuffer, 0, tagLength, fileSize - tagLength)
  await fd.close()

  // Initialize decipher with initialization vector and tag
  const decipher = createDecryptionStream(
    key,
    ivBuffer,
    authenticationTagBuffer
  )

  const { extractor, getExtractedFiles } =
    await createTarExtractStream(outputDir)

  // Stream: read file (excluding prefix and tag) → decrypt → extract tar
  try {
    await pipeline(
      createReadStream(filePath, {
        start: saltLength + ivLength,
        end: fileSize - tagLength - 1,
      }),
      decipher,
      extractor
    )
  } catch (error) {
    // GCM only checks the tag at end of stream, so a wrong passphrase streams
    // garbage plaintext into the tar extractor, which rejects it at the first
    // 512-byte header with a parser internal (“invalid base256 encoding”) —
    // long before the tag check. Genuine I/O failures (ENOSPC, EACCES) carry
    // a syscall; anything else is the parser or decipher rejecting
    // garbage.
    if (error instanceof Error && "syscall" in error) {
      throw error
    }
    throw new AuthenticationError("Wrong passphrase or corrupted archive")
  }

  return getExtractedFiles()
}
