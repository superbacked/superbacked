import { createHash, randomInt } from "crypto"

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

export const concatenatePassphrases = (passphrases: string[]) => {
  const sortedPassphrases = passphrases.sort()
  return sortedPassphrases.join(",")
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
