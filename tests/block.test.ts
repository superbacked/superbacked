import assert from "assert"
import { createHmac } from "crypto"
import { suite, test } from "node:test"

import {
  blockSize,
  computeBlockKdfKey,
  deriveBlockKey,
  deriveBlocksetKey,
  getBlockUsage,
  passphraseKeyInfo,
  qrCodeEcc,
} from "@/src/utilities/core/block"
import { getDataLength } from "@/src/utilities/crypto/fixedSizeEncryption"
import {
  computeChallenge,
  computeResponseBoundKey,
} from "@/src/utilities/crypto/passphraseKey"

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

  // Reference vectors freeze both key derivation function key paths — the
  // single-factor path decrypts every existing block and the two-factor
  // path every YubiKey-protected block, so changing either breaks blocks
  // in the wild. The two-factor path is pinned by composing the stretched
  // key with a software-simulated YubiKey response, as driving
  // computeBlockKdfKey through it requires hardware.
  test("freezes passphrase key info", () => {
    // Changing it changes the key of every YubiKey-protected block (see
    // src/utilities/crypto/passphraseKey.ts)
    assert.strictEqual(passphraseKeyInfo, "kdf-key-v1")
  })

  test("computes key derivation function key from passphrase", async () => {
    // Pins the pre-existing Argon2d derivation — existing blocks must
    // decrypt forever. The construction is shared with the archive
    // passphrase path, so the vector matches computeArchiveKey (see
    // tests/standaloneArchive.test.ts)
    const key = await computeBlockKdfKey(
      "lip gift name net sixth",
      Buffer.alloc(16, 2)
    )
    assert.strictEqual(
      key.toString("hex"),
      "a6a3889592fe2207aa186c97bdd04d896aef299255bf3c19b3879885c136a4e4"
    )
  })

  test("computes key derivation function key from simulated YubiKey response", () => {
    // The full two-factor pipeline for this passphrase and salt, with the
    // YubiKey simulated in software using a known slot secret — the
    // stretched key is the frozen Argon2d vector above
    const stretchedKey = Buffer.from(
      "a6a3889592fe2207aa186c97bdd04d896aef299255bf3c19b3879885c136a4e4",
      "hex"
    )
    const response = createHmac("sha1", Buffer.alloc(20, 3))
      .update(computeChallenge(stretchedKey))
      .digest()
    assert.strictEqual(
      computeResponseBoundKey(
        stretchedKey,
        response,
        passphraseKeyInfo
      ).toString("hex"),
      "e9c4b22de64e1de751daa38655938f505d946e76161e0979568072cf4b676442"
    )
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
