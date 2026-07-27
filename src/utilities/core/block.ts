import { hkdfSync } from "crypto"

import type { ErrorCorrection } from "qr"

import { getDataLength } from "@/src/utilities/crypto/fixedSizeEncryption"
import { computePassphraseKey } from "@/src/utilities/crypto/passphraseKey"
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
 * @param yubikey optional YubiKey challenge-response request
 * @returns 32-byte key derivation function key
 */
export const computeBlockKdfKey = async (
  passphrase: string,
  salt: Buffer,
  yubikey?: ChallengeResponseOptions
): Promise<Buffer> => {
  return computePassphraseKey(passphrase, salt, passphraseKeyInfo, yubikey)
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
      usedSpace += getDataLength(message) + overhead
    }
  }
  return {
    blockSize: blockSize,
    remainingSpace: blockSize - usedSpace,
  }
}
