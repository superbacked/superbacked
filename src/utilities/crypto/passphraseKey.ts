import { createHmac } from "crypto"

import argon2 from "@/src/utilities/crypto/argon2"
import { hkdf } from "@/src/utilities/crypto/primitives"
import {
  ChallengeResponseOptions,
  calculateHmacSha1,
} from "@/src/utilities/yubikey/otp"

// Passphrase key derivation shared by standalone archives and blocks: the
// memorized passphrase stretched with Argon2d over the stored salt is the
// key — or, when the caller requests YubiKey challenge-response, the
// input keying material for a key mixed with the response. The salt
// enters at the stretch, so every block and standalone archive derives a
// unique key, asks a unique challenge and a leaked slot secret never lets
// one dictionary pass attack more than one of them. Each consumer freezes
// its own HKDF info (see src/utilities/core/standaloneArchive.ts and
// src/utilities/core/block.ts).
//
// The scheme is frozen: the single-factor arm is the derivation every
// block and standalone archive in the wild already uses, and changing any
// constant or construction below silently changes the key of every
// YubiKey-protected block and standalone archive (see
// docs/passphrase-key-technical-documentation.md).

// Context keying the challenge — a fixed string, as challenge uniqueness
// comes from the salt already stretched into the key
const challengeContext = "superbacked-passphrase-key-v1-challenge"

/**
 * Stretch a memorized passphrase into a 32-byte key using Argon2d — the
 * single-factor arm, and the input keying material of the two-factor arm
 * @param passphrase memorized passphrase
 * @param salt salt stored in the block or standalone archive
 * @returns 32-byte stretched key
 */
export const computeStretchedKey = async (
  passphrase: string,
  salt: Buffer
): Promise<Buffer> => {
  return argon2(passphrase, salt.toString("base64"))
}

/**
 * Compute YubiKey challenge for stretched key
 * @param stretchedKey 32-byte stretched key
 * @returns 32-byte challenge
 */
export const computeChallenge = (stretchedKey: Buffer): Buffer => {
  // Keying the challenge with the stretched key conceals the passphrase
  // (the YubiKey sees only a PRF image) and gates brute force through the
  // hardware — an attacker holding the block or standalone archive cannot
  // pose the right question without the passphrase, and the salt inside
  // the stretched key makes each one ask a different question
  return createHmac("sha256", stretchedKey)
    .update(challengeContext, "utf8")
    .digest()
}

/**
 * Mix the YubiKey response into the stretched key under the consumer’s
 * info — the two-factor arm
 * @param stretchedKey 32-byte stretched key
 * @param response 20-byte YubiKey HMAC-SHA1 response
 * @param info frozen consumer HKDF info
 * @returns 32-byte key
 */
export const computeResponseBoundKey = (
  stretchedKey: Buffer,
  response: Buffer,
  info: string
): Buffer => {
  // HKDF-Extract is where the two factors meet — the salt is unknowable
  // without the hardware and the input keying material is unknowable
  // without the passphrase, so a malicious YubiKey can only degrade the
  // key to single-factor strength, never below it
  return hkdf(stretchedKey, response, Buffer.from(info, "utf8"), 32)
}

/**
 * Compute a consumer key from a memorized passphrase and stored salt —
 * the stretched key alone, or, when YubiKey challenge-response is
 * requested, the stretched key mixed with the response
 * @param passphrase memorized passphrase
 * @param salt salt stored in the block or standalone archive
 * @param info frozen consumer HKDF info
 * @param yubikey optional YubiKey challenge-response request
 * @returns 32-byte key
 */
export const computePassphraseKey = async (
  passphrase: string,
  salt: Buffer,
  info: string,
  yubikey?: ChallengeResponseOptions
): Promise<Buffer> => {
  const stretchedKey = await computeStretchedKey(passphrase, salt)
  if (yubikey === undefined) {
    return stretchedKey
  }
  const response = await calculateHmacSha1(
    yubikey.slot,
    computeChallenge(stretchedKey),
    yubikey.onTouchRequired
  )
  return computeResponseBoundKey(stretchedKey, response, info)
}
