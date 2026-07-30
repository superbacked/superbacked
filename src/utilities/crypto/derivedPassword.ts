import {
  computeDerivedKey,
  computeSingleFactorDerivedKey,
} from "@/src/utilities/crypto/derivedKey"
import { hkdf } from "@/src/utilities/crypto/primitives"
import { ChallengeResponseOptions } from "@/src/utilities/yubikey/otp"

// Deterministic password rendering from a derived key (see
// src/utilities/crypto/derivedKey.ts, which binds the master passphrase, the label
// and the optional YubiKey response) — the key is the HKDF input keying
// material for an unbounded byte stream that is rejection-sampled into the
// password character set.
//
// The stream info carries the superbacked-derived-password context, so a
// rendered password is domain-separated from every other use of a derived
// key (for example YubiKey-protected archive key derivation, which consumes
// the key through its own HKDF context).
//
// Scheme version 1 (see schemeVersion in
// src/utilities/crypto/derivedKey.ts) — the rendering is frozen: changing
// any constant or construction below silently changes every derived
// password, as does any change to the derived key scheme beneath it.

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

const streamContext = Buffer.from("superbacked-derived-password", "utf8")

/**
 * Derive password from derived key
 * @param derivedKey 32-byte derived key (see src/utilities/crypto/derivedKey.ts)
 * @param length password length
 * @returns derived password
 */
export const derivePassword = (derivedKey: Buffer, length: number): string => {
  if (
    Number.isInteger(length) === false ||
    length < minimumPasswordLength ||
    length > maximumPasswordLength
  ) {
    throw new Error(
      `Length must be an integer between ${minimumPasswordLength} and ${maximumPasswordLength}`
    )
  }
  // Deterministic unbounded byte stream — HKDF invocations domain-separated
  // by a fixed-width counter appended to the context (fixed-width so
  // distinct counters can never produce the same info). Both factors and
  // the label are already bound through the derived key, so the salt is
  // empty.
  let counter = 0
  // Annotated so the type widens to Buffer<ArrayBufferLike>, matching what
  // hkdf returns (Buffer.alloc alone infers Buffer<ArrayBuffer>)
  let chunk: Buffer = Buffer.alloc(0)
  let offset = 0
  const nextByte = (): number => {
    if (offset === chunk.length) {
      const info = Buffer.alloc(streamContext.length + 4)
      streamContext.copy(info)
      info.writeUInt32BE(counter, streamContext.length)
      counter++
      chunk = hkdf(derivedKey, Buffer.alloc(0), info, 64)
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
 * on YubiKey when challenge-response is requested (single factor otherwise)
 * @param masterPassphrase memorized master passphrase
 * @param label memorized label (for example github or proton)
 * @param options derivation options — paranoid stretches at the paranoid
 * profile, and being stateless is part of what the user must know (see
 * src/utilities/crypto/derivedKey.ts)
 * @returns derived password
 */
export const computeDerivedPassword = async (
  masterPassphrase: string,
  label: string,
  options: {
    length: number
    paranoid: boolean
    yubikey?: ChallengeResponseOptions
  }
): Promise<string> => {
  const derivedKey =
    options.yubikey === undefined
      ? await computeSingleFactorDerivedKey(
          masterPassphrase,
          label,
          options.paranoid
        )
      : await computeDerivedKey(
          masterPassphrase,
          label,
          options.paranoid,
          options.yubikey.slot,
          options.yubikey.onTouchRequired
        )
  return derivePassword(derivedKey, options.length)
}
