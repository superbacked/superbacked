import assert from "assert"
import { suite, test } from "node:test"

import generatePassphrase, { Wordlist } from "@/src/utilities/crypto/passphrase"
import effLargeWordlist from "@/wordlists/eff_large_wordlist.json"
import effShortWordlist1 from "@/wordlists/eff_short_wordlist_1.json"
import effShortWordlist20 from "@/wordlists/eff_short_wordlist_2_0.json"

// The generator’s contract — uniformly random words from a single
// shipped wordlist, so entropy is exactly length × log2(wordlist size)
// by construction (see
// docs/technical-documentation/passphrase-strength.md). Every word must
// come from the requested list — the estimator prices generated
// passphrases through exact wordlist membership.

const wordlists: Record<Wordlist, string[]> = {
  eff_large_wordlist: effLargeWordlist,
  eff_short_wordlist_1: effShortWordlist1,
  eff_short_wordlist_2_0: effShortWordlist20,
}

suite("passphrase", () => {
  test("generates seven large wordlist words by default", async () => {
    const passphrase = await generatePassphrase()
    const words = passphrase.split(" ")
    assert.strictEqual(words.length, 7)
    for (const word of words) {
      assert.ok(effLargeWordlist.includes(word))
    }
  })

  test("generates requested length from every wordlist", async () => {
    for (const [name, list] of Object.entries(wordlists)) {
      const passphrase = await generatePassphrase(5, name as Wordlist)
      const words = passphrase.split(" ")
      assert.strictEqual(words.length, 5)
      for (const word of words) {
        assert.ok(list.includes(word))
      }
    }
  })

  test("fails to generate using invalid wordlist", async () => {
    await assert.rejects(
      // @ts-expect-error invalid wordlist
      generatePassphrase(7, "attacker_supplied_wordlist"),
      { message: "Invalid wordlist" }
    )
  })
})
