import { createHash, hkdfSync, randomBytes, randomInt } from "crypto"

/**
 * Hash string using SHA-256
 * @param string string to hash
 * @returns SHA-256 hash as hex string
 */
export const hash = (string: string) => {
  const hashObject = createHash("sha256")
  const updatedHashObject = hashObject.update(string)
  return updatedHashObject.digest("hex")
}

/**
 * Hash string using SHA-256 and return first 8 characters
 * @param string string to hash
 * @returns first 8 characters of SHA-256 hash
 */
export const shortHash = (string: string) => {
  const hashedString = hash(string)
  return hashedString.substring(0, 8)
}

/**
 * Derive key using HKDF-SHA256
 * @param inputKeyingMaterial input keying material
 * @param salt salt value
 * @param info additional info value
 * @param length length of the key to generate
 * @returns derived key
 */
export const hkdf = (
  inputKeyingMaterial: Buffer,
  salt: Buffer,
  info: Buffer,
  length: number
): Buffer => {
  return Buffer.from(
    hkdfSync("sha256", inputKeyingMaterial, salt, info, length)
  )
}

/**
 * Generate random integer between min and max
 * @param min minimum value (inclusive)
 * @param max maximum value (exclusive)
 * @returns random integer
 */
export const getRandomInt = async (
  min: number,
  max: number
): Promise<number> => {
  return new Promise((resolve, reject) => {
    randomInt(min, max, (error, integer) => {
      if (error) {
        reject(error)
      } else {
        resolve(integer)
      }
    })
  })
}

/**
 * Generate a cryptographically secure random encryption key
 * @param keySize key size in bytes, defaults to `32`
 * @returns random encryption key as Buffer
 */
export const generateEncryptionKey = (keySize = 32): Buffer => {
  return randomBytes(keySize)
}

/**
 * Generate a cryptographically secure random salt
 * @param saltSize salt size in bytes, defaults to `16`
 * @returns random encryption salt as Buffer
 */
export const generateSalt = (saltSize = 16): Buffer => {
  return randomBytes(saltSize)
}
