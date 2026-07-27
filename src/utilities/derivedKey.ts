import { createHash, createHmac } from "crypto"

import argon2 from "@/src/utilities/argon2"
import { hkdf } from "@/src/utilities/crypto"
import { Slot, calculateHmacSha1 } from "@/src/utilities/yubikey"

// Deterministic 256-bit key derivation bound to two factors: the master key
// (the memorized master passphrase stretched with Argon2d) is the HKDF
// input keying material and the YubiKey HMAC-SHA1 response is the salt, so
// neither factor alone can derive the key. The challenge is itself keyed by
// the master key, so every passphrase guess costs a round-trip through the
// physical YubiKey — leaked material derived from the key cannot be
// attacked offline without holding the hardware. The label binds every
// derivation to its purpose (a memorized label for passwords, a fixed
// label for archives and another for blocks), giving every label an
// independent key.
//
// Deriving without a YubiKey substitutes a fixed public salt: single
// factor, so leaked derived material becomes offline-attackable (Argon2d
// is the only remaining wall) — the trade-off for working without hardware.
//
// Context strings share the superbacked-derived-key-v1- prefix followed by
// a role segment (salt-, challenge-, no-yubikey) — roles diverge at a fixed
// position, so no label can make two contexts collide.
//
// The whole scheme is frozen: changing any constant, cost parameter or
// construction below silently changes every derived key — and with it
// every derived password (see src/utilities/derivedPassword.ts) and every
// YubiKey-protected standalone archive and block passphrase.

// Salt standing in for the YubiKey response when deriving without hardware —
// fixed and public, and never equal to a real response (responses are 20
// bytes), so the two modes derive independent keys
export const noYubiKeySalt = createHash("sha256")
  .update("superbacked-derived-key-v1-no-yubikey", "utf8")
  .digest()

/**
 * Stretch master passphrase into master key using Argon2d
 * @param masterPassphrase memorized master passphrase
 * @param label label binding the derivation to its purpose
 * @returns 32-byte master key
 */
export const computeMasterKey = async (
  masterPassphrase: string,
  label: string
): Promise<Buffer> => {
  // Memory-hard stretching only matters if the YubiKey slot secret leaks
  // (the only scenario with an offline attack) — it turns a GPU dictionary
  // attack into 64 MiB of work per guess. The scheme is stateless so the
  // salt is derived, not stored — binding it to the label keeps a
  // precomputed dictionary from transferring across labels.
  const salt = createHash("sha256")
    .update(`superbacked-derived-key-v1-salt-${label}`, "utf8")
    .digest("hex")
    .substring(0, 32)
  return argon2(masterPassphrase, salt)
}

/**
 * Compute YubiKey challenge for label
 * @param masterKey 32-byte master key
 * @param label label binding the derivation to its purpose
 * @returns 32-byte challenge
 */
export const computeChallenge = (masterKey: Buffer, label: string): Buffer => {
  // Keying the challenge with the master key binds both factors at every
  // layer, and hashing keeps the challenge within the 64-byte HMAC-SHA1
  // limit regardless of label length. The context prefix domain-separates
  // this keyed use of the master key from the HKDF below.
  return createHmac("sha256", masterKey)
    .update(`superbacked-derived-key-v1-challenge-${label}`, "utf8")
    .digest()
}

/**
 * Derive 256-bit key from master key and salt
 * @param masterKey 32-byte master key
 * @param salt 20-byte YubiKey HMAC-SHA1 response (or noYubiKeySalt when
 * deriving without hardware)
 * @returns 32-byte derived key
 */
export const deriveKey = (masterKey: Buffer, salt: Buffer): Buffer => {
  // The label is already bound through the master key salt and the
  // challenge, so the info carries only the frozen scheme identifier
  return hkdf(
    masterKey,
    salt,
    Buffer.from("superbacked-derived-key-v1", "utf8"),
    32
  )
}

/**
 * Derive 256-bit key from master passphrase and label, computing the
 * response on YubiKey when a slot is provided (single factor otherwise)
 * @param masterPassphrase memorized master passphrase
 * @param label label binding the derivation to its purpose
 * @param options derivation options
 * @returns 32-byte derived key
 */
export const computeDerivedKey = async (
  masterPassphrase: string,
  label: string,
  options: {
    onTouchRequired?: () => void
    slot?: Slot
  } = {}
): Promise<Buffer> => {
  const masterKey = await computeMasterKey(masterPassphrase, label)
  const salt =
    options.slot === undefined
      ? noYubiKeySalt
      : await calculateHmacSha1(
          options.slot,
          computeChallenge(masterKey, label),
          options.onTouchRequired
        )
  return deriveKey(masterKey, salt)
}
