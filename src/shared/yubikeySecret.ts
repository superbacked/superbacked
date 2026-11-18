// The HMAC-SHA1 slot secret as every surface handles it — 20 bytes,
// rendered as 40 hexadecimal characters. Provisioning programs it (see
// src/handlers/yubikeyProvisioning.ts), verification challenges it (see
// src/handlers/yubikeyChallengeResponseSecret.ts) and extraction
// recognizes it inside restored text (see src/main/utilities/extraction.ts)
// — one definition, so the surfaces cannot drift

export const yubikeySecretSize = 20
export const yubikeySecretLength = yubikeySecretSize * 2

const hexadecimal = "[0-9a-fA-F]"

// An entire value, either case
const yubikeySecretRegExp = new RegExp(
  `^${hexadecimal}{${yubikeySecretLength}}$`
)

// Inside free-form text — exactly the right length bounded by non-hex on
// both sides, so longer hexadecimal (a SHA-256 for example) never matches
// through its substrings. A pattern rather than a RegExp, as the
// extraction loop needs its own global instance
export const yubikeySecretInTextPattern = `(?<!${hexadecimal})${hexadecimal}{${yubikeySecretLength}}(?!${hexadecimal})`

/**
 * Normalize typed or pasted secret — whitespace is stripped so spaced hex
 * (as displayed by some Yubico tools) pastes cleanly
 * @param value secret as entered
 * @returns lowercase secret without whitespace
 */
export const normalizeYubiKeySecret = (value: string): string => {
  return value.replace(/\s+/g, "").toLowerCase()
}

/**
 * Whether value is a slot secret
 * @param value candidate
 * @returns true for 40 hexadecimal characters
 */
export const isYubiKeySecret = (value: string): boolean => {
  return yubikeySecretRegExp.test(value)
}
