import { generateEncryptionKey, hkdf } from "@/src/utilities/crypto"

/**
 * Generate master key
 * @returns base64-encoded 256-bit encryption key
 */
export const generateMasterKey = (): string => {
  const encryptionKey = generateEncryptionKey()
  return encryptionKey.toString("base64")
}

/**
 * Derive key using HKDF
 * @param key base64-encoded 256-bit key
 * @param info context string for key derivation
 * @param length output length in bytes (defaults to 32 for 256-bit)
 * @param encoding output encoding (defaults to base64)
 * @returns derived key in specified encoding
 */
export const deriveKey = (
  key: string,
  info: string,
  length: number = 32,
  encoding: "base64" | "hex" = "base64"
): string => {
  const keyBuffer = Buffer.from(key, "base64")
  const infoBuffer = Buffer.from(info)
  const derivedKey = hkdf(keyBuffer, Buffer.alloc(0), infoBuffer, length)
  return derivedKey.toString(encoding)
}
