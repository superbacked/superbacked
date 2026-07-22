import assert from "assert"
import { suite, test } from "node:test"

import {
  blockSize,
  deriveBlockKey,
  deriveBlocksetKey,
  getBlockUsage,
  qrCodeEcc,
} from "@/src/utilities/block"
import { getDataLength } from "@/src/utilities/fixedSizeEncryption"

// Overhead a blockset adds to each message — the per-share overhead added by
// secret-share-split
const shamirOverhead = 49

suite("block", () => {
  // Block density constants are frozen as literals — QR code capacity bounds
  // blockSize at the error correction level set by qrCodeEcc
  test("freezes block density constants", () => {
    assert.strictEqual(blockSize, 768)
    assert.strictEqual(qrCodeEcc, "low")
  })

  // Reference vectors freeze the derivations — computed with an independent
  // HKDF-SHA256 implementation validated against RFC 5869 test case 1
  test("derives block key", () => {
    assert.strictEqual(
      deriveBlockKey(Buffer.alloc(32, 1)).toString("hex"),
      "1c4e33aedcf4268b9b5002c4c443d6734a0c781e4a9ed653ed5ec351c5f7f07d"
    )
  })

  test("derives blockset key", () => {
    assert.strictEqual(
      deriveBlocksetKey(Buffer.alloc(32, 1)).toString("hex"),
      "45be5bd7f1979c75c2f27f8f5f99de9f8baa5c6c85b32b9fef6377bdde78855f"
    )
  })

  test("derives distinct block and blockset keys", () => {
    const key = Buffer.alloc(32, 1)
    assert.notDeepStrictEqual(deriveBlockKey(key), deriveBlocksetKey(key))
  })

  test("gets block usage of no secrets", () => {
    const blockUsage = getBlockUsage([], false)
    assert.strictEqual(blockUsage.remainingSpace, blockSize)
  })

  test("gets block usage of single secret", () => {
    const blockUsage = getBlockUsage(["yo"], false)
    assert.strictEqual(blockUsage.blockSize, blockSize)
    assert.strictEqual(
      blockUsage.remainingSpace,
      blockSize - getDataLength("yo")
    )
  })

  test("gets block usage of multiple secrets, ignoring empty messages", () => {
    const blockUsage = getBlockUsage(["yo", "", "yoo"], false)
    assert.strictEqual(
      blockUsage.remainingSpace,
      blockSize - getDataLength("yo") - getDataLength("yoo")
    )
  })

  test("accounts for Shamir Secret Sharing overhead", () => {
    const blockUsage = getBlockUsage(["yo", "yoo"], true)
    assert.strictEqual(
      blockUsage.remainingSpace,
      blockSize -
        getDataLength("yo") -
        getDataLength("yoo") -
        shamirOverhead * 2
    )
  })

  test("ignores empty messages when accounting for Shamir Secret Sharing overhead", () => {
    const blockUsage = getBlockUsage(["yo", ""], true)
    assert.strictEqual(
      blockUsage.remainingSpace,
      blockSize - getDataLength("yo") - shamirOverhead
    )
  })

  test("goes negative when secrets no longer fit", () => {
    const blockUsage = getBlockUsage(["a".repeat(blockSize)], false)
    assert.strictEqual(blockUsage.remainingSpace, -30)
  })
})
