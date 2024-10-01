import { createHash, randomInt } from "crypto"

/**
 * Hash string using SHA-256
 * @param string string
 * @returns hashed string
 */
export const hash = (string: string) => {
  const hashObject = createHash("sha256")
  const updatedHashObject = hashObject.update(string)
  return updatedHashObject.digest("hex")
}

/**
 * Hash string using SHA-256 and return first 8 characters
 * @param string string
 * @returns first 8 characters of hashed string
 */
export const shortHash = (string: string) => {
  const hashedString = hash(string)
  return hashedString.substring(0, 8)
}

export const concatenatePassphrases = (passphrases: string[]) => {
  const sortedPassphrases = passphrases.sort()
  return sortedPassphrases.join(",")
}

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
