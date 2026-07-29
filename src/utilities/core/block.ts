import { hkdfSync } from "crypto"

import type { ErrorCorrection } from "qr"

import { KdfProfile } from "@/src/shared/utilities/kdfProfiles"
import {
  Message,
  getDataLength,
} from "@/src/utilities/crypto/fixedSizeEncryption"
import { computePassphraseKey } from "@/src/utilities/crypto/passphraseKey"
import {
  decodeSchemeHeader,
  encodeSchemeHeader,
  schemeHeaderLength,
} from "@/src/utilities/crypto/schemeHeader"
import { ChallengeResponseOptions } from "@/src/utilities/yubikey/otp"

// Block density constants — QR code capacity bounds blockSize at the error
// correction level set by qrCodeEcc, so the two must move together
export const blockSize = 768
export const qrCodeEcc: ErrorCorrection = "low"

// Frozen format constants — blocks encrypted under these derivations must
// decrypt forever. The key that authenticates names the message type: block
// keys encrypt plain secrets, blockset keys encrypt shares, so restoration
// classifies messages without a plaintext marker
export const deriveBlockKey = (key: Buffer): Buffer => {
  return Buffer.from(hkdfSync("sha256", key, "", "block-key-v1", 32))
}

export const deriveBlocksetKey = (key: Buffer): Buffer => {
  return Buffer.from(hkdfSync("sha256", key, "", "blockset-key-v1", 32))
}

// HKDF info binding YubiKey-protected block key derivation (see
// src/utilities/passphraseKey.ts) — frozen, as changing it changes the key
// of every YubiKey-protected block. Per-block uniqueness comes from the
// block salt, not from this constant.
export const passphraseKeyInfo = "kdf-key-v1"

// Version written into new blocks (see
// src/utilities/crypto/schemeHeader.ts) — carried inside each secret’s
// encrypted message, so a successful decryption also names the version.
// Legacy v1 blocks are the iv-and-headers payload shape (see
// src/handlers/create.ts) and carry no header
export const blockVersion = 2

/**
 * Prepend the scheme header to a secret’s message before encryption
 * @param message plain secret (string) or blockset share (Buffer)
 * @returns versioned message plaintext
 */
export const encodeBlockMessage = (message: Message): Buffer => {
  return Buffer.concat([encodeSchemeHeader(blockVersion), Buffer.from(message)])
}

/**
 * Split a decrypted message into its scheme header and secret
 * @param plaintext decrypted message plaintext
 * @returns declared version and message, or `null` when the plaintext
 * carries no header
 */
export const decodeBlockMessage = (
  plaintext: Buffer
): null | { message: Buffer; version: number } => {
  const version = decodeSchemeHeader(plaintext.subarray(0, schemeHeaderLength))
  if (version === null) {
    return null
  }
  return {
    message: plaintext.subarray(schemeHeaderLength),
    version: version,
  }
}

/**
 * Compute the key derivation function key from the memorized passphrase
 * and the block salt — the stretched key alone, or, with YubiKey
 * challenge-response, mixed with the response (see
 * src/utilities/passphraseKey.ts). The backup type’s HKDF domain key is
 * applied on top either way (see deriveBlockKey and deriveBlocksetKey),
 * and the block format records nothing, so restoring a YubiKey-protected
 * secret requires the same slot secret, and its absence fails exactly like
 * a wrong passphrase
 * @param passphrase memorized passphrase
 * @param salt 16-byte block salt
 * @param profile frozen Argon2d cost profile — the block’s at restore,
 * discovered by probing (see src/shared/utilities/kdfProfiles.ts)
 * @param yubikey optional YubiKey challenge-response request
 * @returns 32-byte key derivation function key
 */
export const computeBlockKdfKey = async (
  passphrase: string,
  salt: Buffer,
  profile: KdfProfile,
  yubikey?: ChallengeResponseOptions
): Promise<Buffer> => {
  return computePassphraseKey(
    passphrase,
    salt,
    profile,
    passphraseKeyInfo,
    yubikey
  )
}

// Extra space a message occupies when secret is split into blockset shares —
// the per-share overhead added by secret-share-split
const shamirOverhead = 49

// All secrets draw from the same fixed-size block, so capacity reduces to a
// single remaining space (negative when secrets no longer fit)
export interface BlockUsage {
  blockSize: number
  remainingSpace: number
}

/**
 * Get usage of block under construction
 * @param messages messages (empty messages are ignored)
 * @param shamir account for Shamir Secret Sharing overhead
 * @returns block usage
 */
export const getBlockUsage = (
  messages: string[],
  shamir: boolean
): BlockUsage => {
  const overhead = shamir ? shamirOverhead : 0
  let usedSpace = 0
  for (const message of messages) {
    if (message !== "") {
      // Every message carries the scheme header (see encodeBlockMessage)
      usedSpace += getDataLength(message) + schemeHeaderLength + overhead
    }
  }
  return {
    blockSize: blockSize,
    remainingSpace: blockSize - usedSpace,
  }
}
