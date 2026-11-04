import assert from "assert"
import { suite, test } from "node:test"

import {
  characterClasses,
  characters,
} from "@/src/utilities/crypto/derivedPassword"
import generatePassword from "@/src/utilities/crypto/password"

// The generator’s contract — uniformly random characters from the
// derived password character set, so entropy is exactly
// length × log2(85) by construction, with candidates missing a
// character class discarded whole. Every character must come from the
// shared set (see src/utilities/crypto/derivedPassword.ts) and every
// password must contain all four classes.

suite("password", () => {
  test("generates twenty characters from the character set by default", async () => {
    const password = await generatePassword()
    assert.strictEqual(password.length, 20)
    for (const character of password) {
      assert.ok(characters.includes(character))
    }
    for (const characterClass of characterClasses) {
      assert.ok(
        [...password].some((character) => characterClass.includes(character))
      )
    }
  })

  test("generates the requested length containing all character classes", async () => {
    // The minimum length — the compliance rule bites hardest here
    const password = await generatePassword(4)
    assert.strictEqual(password.length, 4)
    for (const characterClass of characterClasses) {
      assert.ok(
        [...password].some((character) => characterClass.includes(character))
      )
    }
  })

  test("generates distinct passwords", async () => {
    // Collision of two 20-character draws would be a broken generator
    assert.notStrictEqual(await generatePassword(), await generatePassword())
  })

  test("fails to generate from an invalid length", async () => {
    for (const length of [0, 3, 8.5]) {
      await assert.rejects(generatePassword(length), {
        message: "Invalid length",
      })
    }
  })
})
