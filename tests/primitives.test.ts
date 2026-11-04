import assert from "assert"
import { suite, test } from "node:test"

import {
  generateEncryptionKey,
  generateSalt,
  getRandomInt,
  hash,
  hkdf,
  shortHash,
  timingSafeEqualStrings,
} from "@/src/utilities/crypto/primitives"

suite("primitives", () => {
  test("hashes with SHA-256", () => {
    assert.strictEqual(
      hash("superbacked"),
      "07376996d0a6051d40867a95d02b61c1f5fb7aa4742f6b76d8a5a09b64b75d4c"
    )
  })

  test("truncates short hash to the first eight characters of the hash", () => {
    assert.strictEqual(shortHash("superbacked"), "07376996")
    assert.strictEqual(
      shortHash("superbacked"),
      hash("superbacked").substring(0, 8)
    )
  })

  test("derives keys per RFC 5869 test case 1", () => {
    // https://www.rfc-editor.org/rfc/rfc5869#appendix-A.1
    const okm = hkdf(
      Buffer.alloc(22, 0x0b),
      Buffer.from("000102030405060708090a0b0c", "hex"),
      Buffer.from("f0f1f2f3f4f5f6f7f8f9", "hex"),
      42
    )
    assert.strictEqual(
      okm.toString("hex"),
      "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
    )
  })

  test("compares strings in constant time", () => {
    assert.strictEqual(timingSafeEqualStrings("secret", "secret"), true)
    assert.strictEqual(timingSafeEqualStrings("secret", "secreT"), false)
    // Length differences must compare, not throw — the comparison runs
    // through fixed-length digests
    assert.strictEqual(timingSafeEqualStrings("secret", "secrets"), false)
    assert.strictEqual(timingSafeEqualStrings("", "secret"), false)
    assert.strictEqual(timingSafeEqualStrings("", ""), true)
  })

  test("generates keys and salts of the requested sizes", () => {
    assert.strictEqual(generateEncryptionKey().length, 32)
    assert.strictEqual(generateEncryptionKey(20).length, 20)
    assert.strictEqual(generateSalt().length, 16)
    assert.strictEqual(generateSalt(32).length, 32)
    // Random — two draws colliding would be a broken generator
    assert.notDeepStrictEqual(generateSalt(), generateSalt())
  })

  test("generates integers within the requested range", async () => {
    for (let iteration = 0; iteration < 100; iteration++) {
      const value = await getRandomInt(3, 6)
      assert.ok(value >= 3 && value < 6)
    }
  })
})
