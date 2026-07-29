import assert from "assert"
import { suite, test } from "node:test"

import { parseClear, parseLength } from "@/src/cli/derivedPassword"

// Parse-time option validation — invalid values must fail before any
// prompting or YubiKey interaction (see src/cli/derivedPassword.ts)

suite("cliValidators", () => {
  test("accepts valid password lengths", () => {
    assert.strictEqual(parseLength("8"), 8)
    assert.strictEqual(parseLength("16"), 16)
    assert.strictEqual(parseLength("128"), 128)
  })

  test("fails to parse invalid password lengths", () => {
    for (const value of ["7", "129", "8.5", "sixteen", "", "-16"]) {
      assert.throws(() => parseLength(value), {
        message: "Length must be an integer between 8 and 128.",
      })
    }
  })

  test("accepts valid clear delays", () => {
    assert.strictEqual(parseClear("1"), 1)
    assert.strictEqual(parseClear("60"), 60)
  })

  test("fails to parse invalid clear delays", () => {
    for (const value of ["0", "-1", "1.5", "soon", ""]) {
      assert.throws(() => parseClear(value), {
        message: "Clear seconds must be a positive integer.",
      })
    }
  })
})
