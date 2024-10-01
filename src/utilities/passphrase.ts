import { app } from "electron"
import { join } from "path"
import { readFile } from "fs-extra"
import { getRandomInt } from "./crypto"

const wordlistDir = join(app.getAppPath(), "wordlists").replace(
  "app.asar",
  "app.asar.unpacked"
)

export type Wordlist =
  | "eff_large_wordlist"
  | "eff_short_wordlist_1"
  | "eff_short_wordlist_2_0"

/**
 * Generate mnemonic
 * @param length length, defaults to `7`
 * @param wordlist wordlist, defaults to `eff_large_wordlist`
 * @returns mnemonic
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
  const data = await readFile(join(wordlistDir, `${wordlist}.json`), "utf8")
  const words = JSON.parse(data)
  const passphrase = []
  for (let index = 1; index <= length; index++) {
    const randomInt = await getRandomInt(0, words.length - 1)
    const word = words[randomInt]
    passphrase.push(word)
  }
  return passphrase.join(" ")
}
