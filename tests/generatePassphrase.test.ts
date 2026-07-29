import assert from "assert"
import { suite, test } from "node:test"

import generatePassphrase, { Wordlist } from "@/src/handlers/generatePassphrase"
import effLargeWordlist from "@/wordlists/eff_large_wordlist.json"
import effShortWordlist1 from "@/wordlists/eff_short_wordlist_1.json"
import effShortWordlist20 from "@/wordlists/eff_short_wordlist_2_0.json"

// The generator is pure uniform drawing — exactly the requested number of
// words from the requested list, never consulting the estimator: its
// entropy is length × log2(wordlist size) by construction, and the meter
// and gate price the result like any other input

const wordlists: [Wordlist, string[]][] = [
  ["eff_large_wordlist", effLargeWordlist],
  ["eff_short_wordlist_1", effShortWordlist1],
  ["eff_short_wordlist_2_0", effShortWordlist20],
]

suite("generatePassphrase", () => {
  test("draws the requested number of words from each wordlist", async () => {
    // Membership is asserted per list — a miswired name would draw from
    // the wrong list and misprice the entropy the estimator assumes
    for (const [name, list] of wordlists) {
      const passphrase = await generatePassphrase(5, name)
      const words = passphrase.split(" ")
      assert.strictEqual(words.length, 5)
      for (const word of words) {
        assert.ok(list.includes(word))
      }
    }
  })

  test("generates seven words from the large wordlist by default", async () => {
    const words = (await generatePassphrase()).split(" ")
    assert.strictEqual(words.length, 7)
    for (const word of words) {
      assert.ok(effLargeWordlist.includes(word))
    }
  })

  test("fails to generate from an invalid wordlist", async () => {
    await assert.rejects(
      generatePassphrase(5, "invalid" as Wordlist),
      /Invalid wordlist/
    )
  })
})
