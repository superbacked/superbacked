import assert from "assert"
import { suite, test } from "node:test"

import generatePassphrase, { Wordlist } from "@/src/handlers/generatePassphrase"
import effShortWordlist1 from "@/wordlists/eff_short_wordlist_1.json"

// The generator is pure uniform drawing — exactly the requested number of
// words from the requested list, never consulting the estimator: its
// entropy is length × log2(wordlist size) by construction, and the meter
// and gate price the result like any other input

suite("generatePassphrase", () => {
  test("draws the requested number of words from the wordlist", async () => {
    const passphrase = await generatePassphrase(5, "eff_short_wordlist_1")
    const words = passphrase.split(" ")
    assert.strictEqual(words.length, 5)
    for (const word of words) {
      assert.ok(effShortWordlist1.includes(word))
    }
  })

  test("generates with defaults", async () => {
    const passphrase = await generatePassphrase()
    assert.strictEqual(passphrase.split(" ").length, 7)
  })

  test("rejects invalid wordlist", async () => {
    await assert.rejects(
      generatePassphrase(5, "invalid" as Wordlist),
      /Invalid wordlist/
    )
  })
})
