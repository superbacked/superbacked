import { createHash, createHmac } from "crypto"

import argon2 from "@/src/utilities/argon2"
import { hkdf } from "@/src/utilities/crypto"
import { Slot, calculateHmacSha1 } from "@/src/utilities/yubikey"

// Deterministic password derivation bound to two factors: the master key
// (the memorized master passphrase stretched with Argon2id) is the HKDF
// input keying material and the YubiKey HMAC-SHA1 response is the salt, so
// neither factor alone can derive a password. The challenge is itself keyed
// by the master key, so every passphrase guess costs a round-trip through
// the physical YubiKey — a leaked derived password cannot be attacked
// offline without holding the hardware. The label doubles as the HKDF info,
// giving every label an independent password.
//
// Deriving without a YubiKey substitutes a fixed public salt: single factor,
// so a leaked derived password becomes offline-attackable (Argon2id is the
// only remaining wall) — the trade-off for working without hardware.
//
// Context strings share the superbacked-derived-password- prefix followed by
// a role segment (salt-, challenge-, no-yubikey) — roles diverge at a fixed
// position, so no label can make two contexts collide.
//
// The whole scheme is frozen: changing any constant, cost parameter or
// construction below silently changes every derived password.

// Ambiguous characters are excluded (KeePassXC-style look-alike exclusion,
// extended with the quote family): 0/O and 1/l/I transcribe unreliably when
// passwords are typed manually on air-gapped devices, | reads as l or I and
// mobile keyboards substitute curly variants when typing ' " `
const lowercaseCharacters = "abcdefghijkmnopqrstuvwxyz"
const uppercaseCharacters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const digitCharacters = "23456789"
const specialCharacters = "!#$%&()*+,-./:;<=>?@[\\]^_{}~"

const characterClasses = [
  lowercaseCharacters,
  uppercaseCharacters,
  digitCharacters,
  specialCharacters,
]

const characters = characterClasses.join("")

// Character to class index — lets the compliance scan avoid searching class
// strings, whose early exit would leak character positions through timing
const characterClassIndexes = new Map<string, number>()
characterClasses.forEach((characterClass, index) => {
  for (const character of characterClass) {
    characterClassIndexes.set(character, index)
  }
})

const fullClassMask = (1 << characterClasses.length) - 1

export const minimumPasswordLength = 8
export const maximumPasswordLength = 128

// Salt standing in for the YubiKey response when deriving without hardware —
// fixed and public, and never equal to a real response (responses are 20
// bytes), so the two modes derive independent passwords
export const noYubiKeySalt = createHash("sha256")
  .update("superbacked-derived-password-no-yubikey", "utf8")
  .digest()

/**
 * Stretch master passphrase into master key using Argon2id
 * @param masterPassphrase memorized master passphrase
 * @param label memorized label (for example github or proton)
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
    .update(`superbacked-derived-password-salt-${label}`, "utf8")
    .digest("hex")
    .substring(0, 32)
  return argon2(masterPassphrase, salt, "id")
}

/**
 * Compute YubiKey challenge for label
 * @param masterKey 32-byte master key
 * @param label memorized label (for example github or proton)
 * @returns 32-byte challenge
 */
export const computeChallenge = (masterKey: Buffer, label: string): Buffer => {
  // Keying the challenge with the master key binds both factors at every
  // layer, and hashing keeps the challenge within the 64-byte HMAC-SHA1
  // limit regardless of label length. The context prefix domain-separates
  // this keyed use of the master key from the HKDF below.
  return createHmac("sha256", masterKey)
    .update(`superbacked-derived-password-challenge-${label}`, "utf8")
    .digest()
}

/**
 * Derive password from master key and salt
 * @param masterKey 32-byte master key
 * @param label memorized label (for example github or proton)
 * @param salt 20-byte YubiKey HMAC-SHA1 response (or noYubiKeySalt when
 * deriving without hardware)
 * @param length password length
 * @returns derived password
 */
export const derivePassword = (
  masterKey: Buffer,
  label: string,
  salt: Buffer,
  length: number
): string => {
  if (
    Number.isInteger(length) === false ||
    length < minimumPasswordLength ||
    length > maximumPasswordLength
  ) {
    throw new Error(
      `Length must be an integer between ${minimumPasswordLength} and ${maximumPasswordLength}`
    )
  }
  const labelBuffer = Buffer.from(label, "utf8")
  // Deterministic unbounded byte stream — HKDF invocations domain-separated
  // by a fixed-width counter appended to the label (fixed-width so distinct
  // label and counter pairs can never produce the same info)
  let counter = 0
  // Annotated so the type widens to Buffer<ArrayBufferLike>, matching what
  // hkdf returns (Buffer.alloc alone infers Buffer<ArrayBuffer>)
  let chunk: Buffer = Buffer.alloc(0)
  let offset = 0
  const nextByte = (): number => {
    if (offset === chunk.length) {
      const info = Buffer.alloc(labelBuffer.length + 4)
      labelBuffer.copy(info)
      info.writeUInt32BE(counter, labelBuffer.length)
      counter++
      chunk = hkdf(masterKey, salt, info, 64)
      offset = 0
    }
    const byte = chunk.readUInt8(offset)
    offset++
    return byte
  }
  // Largest multiple of the character count below 256 — rejection sampling
  // over the stream keeps every character equally likely (a bare modulo
  // would bias toward the first characters)
  const limit = Math.floor(256 / characters.length) * characters.length
  for (;;) {
    let password = ""
    while (password.length < length) {
      const byte = nextByte()
      if (byte >= limit) {
        continue
      }
      password += characters.charAt(byte % characters.length)
    }
    // Passwords missing a character class are discarded and derivation
    // continues down the stream (patching characters in would skew the
    // distribution), so every password satisfies common complexity rules.
    // The scan is exhaustive — a short-circuit would leak where each class
    // first appears through timing.
    let classMask = 0
    for (const character of password) {
      classMask |= 1 << (characterClassIndexes.get(character) ?? 0)
    }
    if (classMask === fullClassMask) {
      return password
    }
  }
}

/**
 * Derive password from master passphrase and label, computing the response
 * on YubiKey when a slot is provided (single factor otherwise)
 * @param masterPassphrase memorized master passphrase
 * @param label memorized label (for example github or proton)
 * @param options derivation options
 * @returns derived password
 */
export const computeDerivedPassword = async (
  masterPassphrase: string,
  label: string,
  options: {
    length: number
    onTouchRequired?: () => void
    slot?: Slot
  }
): Promise<string> => {
  const masterKey = await computeMasterKey(masterPassphrase, label)
  const salt =
    options.slot === undefined
      ? noYubiKeySalt
      : await calculateHmacSha1(
          options.slot,
          computeChallenge(masterKey, label),
          options.onTouchRequired
        )
  return derivePassword(masterKey, label, salt, options.length)
}
