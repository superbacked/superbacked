import { createHash, createHmac } from "crypto"

import {
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"
import argon2 from "@/src/utilities/crypto/argon2"
import { hkdf } from "@/src/utilities/crypto/primitives"
import { Slot, calculateHmacSha1 } from "@/src/utilities/yubikey/otp"

// Deterministic 256-bit key derivation bound to two factors: the master key
// (the memorized master passphrase stretched with Argon2d) is the HKDF
// input keying material and the YubiKey HMAC-SHA1 response is the salt, so
// neither factor alone can derive the key. The challenge is itself keyed by
// the master key, so every passphrase guess costs a round-trip through the
// physical YubiKey — leaked material derived from the key cannot be
// attacked offline without holding the hardware. The label binds every
// derivation to its purpose (a memorized label per password), giving
// every label an independent key.
//
// Derivation requires the hardware: a hardware-less variant would be
// single factor, and leaked derived material would become
// offline-attackable with Argon2d as the only remaining wall — for
// derived Bitcoin wallets the public blockchain itself would be the
// verification oracle, so no such variant exists.
//
// Context strings share the superbacked-derived-key- prefix followed by
// a role segment (salt-, challenge-) — roles diverge at a fixed
// position, so no label can make two contexts collide.
//
// The whole scheme is frozen: changing any constant, cost parameter or
// construction below silently changes every derived key — and with it
// every derived password (see src/utilities/crypto/derivedPassword.ts).
// Derivation is stateless, so unlike stored artifacts no probe can ever
// discover a version or cost — the scheme version and Paranoid mode are
// part of what the user knows (surfaced at every derivation), and a
// future version would be an explicit choice, never a failover.

// The version of the derivation scheme below — surfaced at every
// derivation and selectable via --derivation-version. The context strings
// below belong to version 1 permanently; a future version introduces new
// strings, it never edits these
export const schemeVersion = 1

/**
 * Stretch master passphrase into master key using Argon2d
 * @param masterPassphrase memorized master passphrase
 * @param label label binding the derivation to its purpose
 * @param paranoid stretch at the paranoid profile — statelessness makes
 * the mode part of what the user must know: deriving without it silently
 * produces different keys
 * @returns 32-byte master key
 */
export const computeMasterKey = async (
  masterPassphrase: string,
  label: string,
  paranoid: boolean
): Promise<Buffer> => {
  // Memory-hard stretching only matters if the YubiKey slot secret leaks
  // (the only scenario with an offline attack) — it turns a GPU dictionary
  // attack into 64 MiB of memory traffic across 80 passes per guess (a
  // full gigabyte across 50 passes under Paranoid mode). The scheme is
  // stateless so the salt is derived, not stored — binding it to the
  // label keeps a precomputed dictionary from transferring across labels.
  // First 16 digest bytes serialized as base64 — the Argon2d salt shape
  // shared by every scheme (the binary consumes the literal ASCII bytes,
  // so the serialization is part of the frozen scheme)
  const salt = createHash("sha256")
    .update(`superbacked-derived-key-salt-${label}`, "utf8")
    .digest()
    .subarray(0, 16)
    .toString("base64")
  return argon2(
    masterPassphrase,
    salt,
    paranoid === true ? paranoidKdfProfile : standardKdfProfile
  )
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
    .update(`superbacked-derived-key-challenge-${label}`, "utf8")
    .digest()
}

/**
 * Derive 256-bit key from master key and salt
 * @param masterKey 32-byte master key
 * @param salt 20-byte YubiKey HMAC-SHA1 response
 * @returns 32-byte derived key
 */
export const deriveKey = (masterKey: Buffer, salt: Buffer): Buffer => {
  // The label is already bound through the master key salt and the
  // challenge, so the info carries only the frozen scheme identifier
  return hkdf(
    masterKey,
    salt,
    Buffer.from("superbacked-derived-key", "utf8"),
    32
  )
}

/**
 * Derive 256-bit key from master passphrase, label and YubiKey
 * challenge-response — the two-factor scheme
 * @param masterPassphrase memorized master passphrase
 * @param label label binding the derivation to its purpose
 * @param paranoid stretch at the paranoid profile (see computeMasterKey)
 * @param slot HMAC-SHA1 challenge-response slot
 * @param onTouchRequired invoked while the YubiKey awaits touch
 * @returns 32-byte derived key
 */
export const computeDerivedKey = async (
  masterPassphrase: string,
  label: string,
  paranoid: boolean,
  slot: Slot,
  onTouchRequired?: () => void
): Promise<Buffer> => {
  const masterKey = await computeMasterKey(masterPassphrase, label, paranoid)
  const response = await calculateHmacSha1(
    slot,
    computeChallenge(masterKey, label),
    onTouchRequired
  )
  return deriveKey(masterKey, response)
}
