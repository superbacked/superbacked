import assert from "assert"
import { suite, test } from "node:test"

import { computeMasterKey, deriveKey } from "@/src/utilities/crypto/derivedKey"
import {
  derivePassword,
  maximumPasswordLength,
  minimumPasswordLength,
} from "@/src/utilities/crypto/derivedPassword"

// Reference vectors freeze the rendering scheme — changing any constant or
// construction in the module breaks them, as does any change to the derived
// key scheme beneath it (see tests/derivedKey.test.ts). Derivation always
// mixes in a YubiKey response, so composed tests pin against a fixed
// response-shaped salt (computeDerivedPassword itself requires hardware
// and is exercised through its parts)
const derivedKey = Buffer.alloc(32, 1)
const otherDerivedKey = Buffer.alloc(32, 2)
const testSalt = Buffer.alloc(20, 4)

suite("derivedPassword", () => {
  test("derives password", () => {
    assert.strictEqual(derivePassword(derivedKey, 16), "w?sni2qF.QE@j]:#")
  })

  test("derives same password for same inputs", () => {
    assert.strictEqual(
      derivePassword(derivedKey, 16),
      derivePassword(derivedKey, 16)
    )
  })

  test("derives password at minimum length", () => {
    assert.strictEqual(
      derivePassword(derivedKey, minimumPasswordLength),
      "w?sni2qF"
    )
  })

  test("derives password at maximum length", () => {
    assert.strictEqual(
      derivePassword(derivedKey, maximumPasswordLength),
      "w?sni2qF.QE@j]:#-T>3-=PRT6/k3}RFc{Jhn%(8=gdR~WhmHDZv~~W+.#>}U+~x4Ko,+r-[d_(B7v(gPEWAW$.+EqnJ)]KEg}[ms~xiQgnGYV3/Jne24Gw9pBN@%g}R"
    )
  })

  test("derives password containing all character classes", () => {
    const password = derivePassword(derivedKey, minimumPasswordLength)
    assert.match(password, /[a-z]/)
    assert.match(password, /[A-Z]/)
    assert.match(password, /[0-9]/)
    assert.match(password, /[^a-zA-Z0-9]/)
  })

  test("derives password from unambiguous printable characters only", () => {
    const password = derivePassword(derivedKey, maximumPasswordLength)
    assert.match(password, /^[\x21-\x7e]+$/)
    assert.doesNotMatch(password, /[01OlI|'"`]/)
  })

  test("derives distinct passwords for distinct derived keys", () => {
    assert.notStrictEqual(
      derivePassword(derivedKey, 16),
      derivePassword(otherDerivedKey, 16)
    )
  })

  test("fails to derive password using length below minimum", () => {
    assert.throws(() => derivePassword(derivedKey, minimumPasswordLength - 1), {
      message: "Length must be an integer between 8 and 128",
    })
  })

  test("fails to derive password using length above maximum", () => {
    assert.throws(() => derivePassword(derivedKey, maximumPasswordLength + 1), {
      message: "Length must be an integer between 8 and 128",
    })
  })

  test("fails to derive password using non-integer length", () => {
    assert.throws(() => derivePassword(derivedKey, 8.5), {
      message: "Length must be an integer between 8 and 128",
    })
  })

  test("computes derived password of composed derivation", async () => {
    // Rendered from the standard profile master key — the permanent
    // cost of scheme v1 (see tests/derivedKey.test.ts) — through the
    // full pipeline against the fixed response-shaped salt
    const password = derivePassword(
      deriveKey(
        await computeMasterKey("lip gift name net sixth", "github", false),
        testSalt
      ),
      16
    )
    assert.strictEqual(password, "ATy3y6e6i-H{y-^r")
  })

  test("computes distinct passwords under Paranoid mode", async () => {
    // The mode is a domain input — forgetting it derives a different
    // password, which is why the command-line interface echoes it
    assert.notStrictEqual(
      derivePassword(
        deriveKey(
          await computeMasterKey("lip gift name net sixth", "github", true),
          testSalt
        ),
        16
      ),
      derivePassword(
        deriveKey(
          await computeMasterKey("lip gift name net sixth", "github", false),
          testSalt
        ),
        16
      )
    )
  })

  test("renders password domain-separated from raw derived key", async () => {
    // An archive passphrase is the hex of the derived key itself — the
    // rendered password must not be a substring or trivial projection of it
    const key = deriveKey(
      await computeMasterKey("lip gift name net sixth", "github", false),
      testSalt
    )
    const password = derivePassword(key, 16)
    assert.ok(key.toString("hex").includes(password) === false)
  })
})
