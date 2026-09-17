import { getRandomInt } from "@/src/utilities/crypto/primitives"
import effLargeWordlist from "@/wordlists/eff_large_wordlist.json"
import effShortWordlist1 from "@/wordlists/eff_short_wordlist_1.json"
import effShortWordlist20 from "@/wordlists/eff_short_wordlist_2_0.json"

// Passphrase generation — uniformly random words drawn from a shipped
// EFF wordlist, so entropy is exactly length × log2(wordlist size) by
// construction (see docs/technical-documentation/passphrase-strength.md,
// whose estimator prices generated passphrases by this exact contract)

const wordlists = {
  eff_large_wordlist: effLargeWordlist,
  eff_short_wordlist_1: effShortWordlist1,
  eff_short_wordlist_2_0: effShortWordlist20,
}

export type Wordlist =
  "eff_large_wordlist" | "eff_short_wordlist_1" | "eff_short_wordlist_2_0"

/**
 * Generate passphrase
 * @param length length, defaults to `7`
 * @param wordlist wordlist, defaults to `eff_large_wordlist`
 * @returns passphrase
 */
export default async (
  length = 7,
  wordlist: Wordlist = "eff_large_wordlist"
): Promise<string> => {
  if (
    [
      "eff_large_wordlist",
      "eff_short_wordlist_1",
      "eff_short_wordlist_2_0",
    ].includes(wordlist) !== true
  ) {
    throw new Error("Invalid wordlist")
  }
  const words = wordlists[wordlist]
  const passphrase = []
  for (let index = 1; index <= length; index++) {
    const randomInt = await getRandomInt(0, words.length)
    const word = words[randomInt]
    passphrase.push(word)
  }
  return passphrase.join(" ")
}
