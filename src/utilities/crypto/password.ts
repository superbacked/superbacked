import {
  characterClasses,
  characters,
} from "@/src/utilities/crypto/derivedPassword"
import { getRandomInt } from "@/src/utilities/crypto/primitives"

// Password generation — uniformly random characters drawn from the
// derived password character set (see
// src/utilities/crypto/derivedPassword.ts), so entropy is exactly
// length × log2(85) by construction. Candidates missing a character
// class are discarded whole and regenerated — sampling stays uniform
// over the set of compliant passwords, so every password satisfies
// common complexity rules without distribution skew.

/**
 * Generate password
 * @param length length, defaults to `20`
 * @returns password
 */
export default async (length = 20): Promise<string> => {
  // A password shorter than the number of character classes cannot
  // contain them all — the compliance loop would never terminate
  if (Number.isInteger(length) !== true || length < characterClasses.length) {
    throw new Error("Invalid length")
  }
  for (;;) {
    let password = ""
    for (let index = 1; index <= length; index++) {
      const randomInt = await getRandomInt(0, characters.length)
      password += characters.charAt(randomInt)
    }
    const compliant = characterClasses.every((characterClass) =>
      [...password].some((character) => characterClass.includes(character))
    )
    if (compliant) {
      return password
    }
  }
}
