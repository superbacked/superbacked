import assert from "assert"
import { suite, test } from "node:test"

import { classifyPrefixedShare } from "@/src/utilities/core/legacy/blockset"

// The legacy blockset share convention is frozen — shares in shipped
// blocks carry the plaintext prefix, and restoration classifies by
// prefix plus share shape (see src/utilities/core/legacy/blockset.ts).
// The published legacy blockset pins the classification against real
// shipped artifacts (see tests/referenceBlocks.test.ts).

suite("legacyBlockset", () => {
  test("classifies prefixed share-shaped messages as shares", () => {
    const share = Buffer.alloc(60, 0xff)
    assert.deepStrictEqual(
      classifyPrefixedShare(Buffer.concat([Buffer.from("shamir:"), share])),
      share
    )
  })

  test("classifies plain secrets as secrets", () => {
    // No prefix — a plain secret however share-like the rest looks
    assert.strictEqual(classifyPrefixedShare(Buffer.alloc(60, 0xff)), null)
    // Prefixed but valid UTF-8 — a plain secret that happens to start
    // with the prefix
    assert.strictEqual(
      classifyPrefixedShare(
        Buffer.from("shamir: the name of my first dog, honest")
      ),
      null
    )
    // Prefixed but too short to be a share
    assert.strictEqual(
      classifyPrefixedShare(
        Buffer.concat([Buffer.from("shamir:"), Buffer.alloc(49, 0xff)])
      ),
      null
    )
  })

  test("classifies minimum-length shares as shares", () => {
    // A share is a keyshare (33 bytes), ciphertext (at least 1 byte) and
    // authentication tag (16 bytes) — 50 bytes is the floor
    const share = Buffer.alloc(50, 0xff)
    assert.deepStrictEqual(
      classifyPrefixedShare(Buffer.concat([Buffer.from("shamir:"), share])),
      share
    )
  })
})
