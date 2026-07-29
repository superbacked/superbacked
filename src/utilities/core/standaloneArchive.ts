import { createReadStream, createWriteStream } from "fs"
import { open, stat } from "fs/promises"
import { pipeline } from "stream/promises"

import { KdfProfile } from "@/src/shared/utilities/kdfProfiles"
import {
  Manifest,
  RestoredFilePath,
  createDecryptionStream,
  createEncryptionStream,
  createManifest,
  createTarExtractStream,
  createTarStream,
  generateIv,
} from "@/src/utilities/core/archive"
import {
  computeChallenge,
  computeProbeKey,
  computeResponseBoundKey,
  computeStretchedKey,
} from "@/src/utilities/crypto/passphraseKey"
import {
  UnsupportedVersionError,
  decodeProbeBlock,
  encodeProbeBlock,
  probeBlockLength,
} from "@/src/utilities/crypto/schemeHeader"
import {
  ChallengeResponseOptions,
  calculateHmacSha1,
} from "@/src/utilities/yubikey/otp"

export type { Manifest, RestoredFilePath }
export { UnsupportedVersionError, decodeProbeBlock, probeBlockLength }

// HKDF info binding YubiKey-protected archive key derivation (see
// src/utilities/passphraseKey.ts) — frozen, as changing it changes the key
// of every archive created with --yubikey. Per-archive uniqueness comes
// from the archive salt, not from this constant.
export const passphraseKeyInfo = "encryption-key-v1"

// HKDF info of the version-probe key — frozen. The probe block it
// encrypts is how restoration discovers the archive’s version and KDF
// profile without plaintext markers (see decodeProbeBlock)
export const probeKeyInfo = "version-probe-v1"

// Version written into new archives (see
// src/utilities/crypto/schemeHeader.ts) — v1 is the headerless legacy
// format, recognized by matching no probe
export const standaloneArchiveVersion = 2

const saltLength = 16
const ivLength = 12
const tagLength = 16
const probeBlockOffset = saltLength
const v2PayloadOffset = saltLength + probeBlockLength

export interface ArchiveKeys {
  key: Buffer
  probeKey: Buffer
}

/**
 * Compute the archive encryption and probe keys from the memorized
 * passphrase and the archive salt — both expanded from a single stretch
 * (and, with YubiKey challenge-response, a single touch), so probing a
 * profile costs one KDF run. The encryption key arm is frozen: the
 * single-factor key is the raw stretched key every v1 archive already
 * uses, and the two-factor key mixes the response (see
 * src/utilities/crypto/passphraseKey.ts). The probe key is their HKDF
 * sibling at the same factor depth
 * @param passphrase memorized passphrase
 * @param salt 16-byte archive salt
 * @param profile frozen Argon2d cost profile — the archive’s at restore,
 * discovered by probing (see src/shared/utilities/kdfProfiles.ts)
 * @param yubikey optional YubiKey challenge-response request
 * @returns 32-byte encryption and probe keys
 */
export const computeArchiveKeys = async (
  passphrase: string,
  salt: Buffer,
  profile: KdfProfile,
  yubikey?: ChallengeResponseOptions
): Promise<ArchiveKeys> => {
  const stretchedKey = await computeStretchedKey(passphrase, salt, profile)
  if (yubikey === undefined) {
    return {
      key: stretchedKey,
      probeKey: computeProbeKey(stretchedKey, probeKeyInfo),
    }
  }
  const response = await calculateHmacSha1(
    yubikey.slot,
    computeChallenge(stretchedKey),
    yubikey.onTouchRequired
  )
  return {
    key: computeResponseBoundKey(stretchedKey, response, passphraseKeyInfo),
    probeKey: computeProbeKey(stretchedKey, probeKeyInfo, response),
  }
}

// Thrown when an archive fails authentication — a wrong passphrase and a
// corrupted archive are cryptographically indistinguishable (AES-256-GCM).
export class AuthenticationError extends Error {}

/**
 * Create standalone archive
 *
 * Creates encrypted tar archive using passphrase-derived keys.
 * Format: [salt (16 bytes)][probe block (36 bytes)][iv (12 bytes)]
 * [encrypted data][tag (16 bytes)] — every byte indistinguishable from
 * random, the version declared only under the probe key
 *
 * @param filePaths array of absolute file paths to encrypt
 * @param outputPath path where standalone archive will be written
 * @param salt 16-byte salt
 * @param keys 32-byte encryption and probe keys
 * @returns manifest containing file names and sizes
 */
export const createStandaloneArchive = async (
  filePaths: string[],
  outputPath: string,
  salt: Buffer,
  keys: ArchiveKeys
): Promise<Manifest> => {
  const iv = generateIv()
  const cipher = createEncryptionStream(keys.key, iv)
  const output = createWriteStream(outputPath)

  const manifest = await createManifest(filePaths)

  // Write salt, probe block and initialization vector at beginning of file
  output.write(salt)
  output.write(encodeProbeBlock(keys.probeKey, standaloneArchiveVersion))
  output.write(iv)

  // Stream: tar → encrypt → write to file
  await pipeline(createTarStream(filePaths), cipher, output)

  // Get authentication tag after encryption completes
  const tag = cipher.getAuthTag()

  // Append tag to end of file
  const fd = await open(outputPath, "a")
  await fd.write(tag)
  await fd.close()

  return manifest
}

/**
 * Extract salt from standalone archive
 *
 * @param filePath path to archive
 * @returns 16-byte salt
 */
export const extractSalt = async (filePath: string): Promise<Buffer> => {
  const fd = await open(filePath, "r")
  const saltBuffer = Buffer.alloc(saltLength)
  await fd.read(saltBuffer, 0, saltLength, 0)
  await fd.close()
  return saltBuffer
}

/**
 * Extract probe block candidate from standalone archive — for a v1
 * archive these are just the first payload bytes, which no probe key can
 * match
 * @param filePath path to archive
 * @returns probe block candidate
 */
export const extractProbeBlock = async (filePath: string): Promise<Buffer> => {
  const fd = await open(filePath, "r")
  const probeBlockBuffer = Buffer.alloc(probeBlockLength)
  await fd.read(probeBlockBuffer, 0, probeBlockLength, probeBlockOffset)
  await fd.close()
  return probeBlockBuffer
}

/**
 * Restore standalone archive
 *
 * Decrypts encrypted tar archive using passphrase-derived key.
 * Version 2 format: [salt (16 bytes)][probe block (36 bytes)]
 * [iv (12 bytes)][encrypted data][tag (16 bytes)] — version 1 has no
 * probe block. The version comes from the probe trial (see
 * decodeProbeBlock), never from the caller guessing
 *
 * @param filePath path to encrypted archive
 * @param outputDir directory where files will be extracted
 * @param key 32-byte AES-256 decryption key
 * @param version archive version (1 or 2)
 * @returns array of restored file paths
 */
export const restoreStandaloneArchive = async (
  filePath: string,
  outputDir: string,
  key: Buffer,
  version: 1 | 2
): Promise<RestoredFilePath[]> => {
  const stats = await stat(filePath)
  const fileSize = stats.size
  const ivOffset = version === 1 ? saltLength : v2PayloadOffset

  const fd = await open(filePath, "r")

  // Read initialization vector
  const ivBuffer = Buffer.alloc(ivLength)
  await fd.read(ivBuffer, 0, ivLength, ivOffset)

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
        start: ivOffset + ivLength,
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
