import assert from "assert"
import { createHmac } from "crypto"
import { suite, test } from "node:test"

import { legacyKdfProfile } from "@/src/shared/kdfProfiles"
import {
  blockSize,
  computeBlockKdfKey,
  decodeBlockContent,
  decodeBlockMessage,
  deriveBlockKey,
  deriveBlocksetKey,
  encodeBlockContent,
  encodeBlockMessage,
  getBlockUsage,
  passphraseKeyInfo,
  qrCodeEcc,
  schemeVersion,
} from "@/src/utilities/core/block"
import { getDataLength } from "@/src/utilities/crypto/fixedSizeEncryption"
import {
  computeChallenge,
  computeResponseBoundKey,
} from "@/src/utilities/crypto/passphraseKey"
import { schemeHeaderLength } from "@/src/utilities/crypto/schemeHeader"

// Overhead a blockset adds to each message — the per-share overhead added
// by secret-share-split plus the blockset scheme version byte (see
// src/utilities/core/blockset.ts)
const shamirOverhead = 49 + 1

suite("block", () => {
  // Block density constants are frozen as literals — QR code capacity bounds
  // blockSize at the error correction level set by qrCodeEcc
  test("freezes block density constants", () => {
    assert.strictEqual(blockSize, 768)
    assert.strictEqual(qrCodeEcc, "low")
  })

  test("freezes scheme version", () => {
    // Absolute pin — the round trips below only check the constant
    // against itself, and the reference artifacts pin it only while they
    // exist
    assert.strictEqual(schemeVersion, 2)
  })

  // Reference vectors freeze the derivations — computed with an independent
  // HKDF-SHA256 implementation validated against RFC 5869 test case 1
  test("derives block key", () => {
    assert.strictEqual(
      deriveBlockKey(Buffer.alloc(32, 1)).toString("hex"),
      "3c3f9de3dc78b147b1c2f3aec678a17f72c22fb8911f4e31966c2af58a31b77d"
    )
  })

  test("derives blockset key", () => {
    assert.strictEqual(
      deriveBlocksetKey(Buffer.alloc(32, 1)).toString("hex"),
      "1838790791ecce2ffc09cebf4782aa4e331f5d504ae853acc2d63be134bd0b9e"
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
    assert.strictEqual(passphraseKeyInfo, "kdf-key")
  })

  test("computes key derivation function key from passphrase", async () => {
    // Pins the pre-existing Argon2d derivation — existing blocks must
    // decrypt forever. The construction is shared with the archive
    // passphrase path, so the vector matches computeArchiveKey (see
    // tests/standaloneArchive.test.ts)
    const key = await computeBlockKdfKey(
      "lip gift name net sixth",
      Buffer.alloc(16, 2),
      legacyKdfProfile
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
      "e3ea18ffc8b9d6cc06b590978379f9dbd15ca155fc6699f9aedfb43aa35df7c7"
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
      blockSize - getDataLength("yo") - schemeHeaderLength
    )
  })

  test("gets block usage of multiple secrets, ignoring empty messages", () => {
    const blockUsage = getBlockUsage(["yo", "", "yoo"], false)
    assert.strictEqual(
      blockUsage.remainingSpace,
      blockSize -
        getDataLength("yo") -
        getDataLength("yoo") -
        schemeHeaderLength * 2
    )
  })

  test("accounts for Shamir Secret Sharing overhead", () => {
    const blockUsage = getBlockUsage(["yo", "yoo"], true)
    assert.strictEqual(
      blockUsage.remainingSpace,
      blockSize -
        getDataLength("yo") -
        getDataLength("yoo") -
        (shamirOverhead + schemeHeaderLength) * 2
    )
  })

  test("ignores empty messages when accounting for Shamir Secret Sharing overhead", () => {
    const blockUsage = getBlockUsage(["yo", ""], true)
    assert.strictEqual(
      blockUsage.remainingSpace,
      blockSize - getDataLength("yo") - shamirOverhead - schemeHeaderLength
    )
  })

  test("goes negative when secrets no longer fit", () => {
    const blockUsage = getBlockUsage(["a".repeat(blockSize)], false)
    assert.strictEqual(blockUsage.remainingSpace, -30 - schemeHeaderLength)
  })

  test("round-trips block message", () => {
    const plaintext = encodeBlockMessage("secret message")
    const decoded = decodeBlockMessage(plaintext)
    assert.notStrictEqual(decoded, null)
    assert.strictEqual(decoded?.version, schemeVersion)
    assert.strictEqual(decoded?.message.toString(), "secret message")
  })

  test("round-trips binary block message", () => {
    // Blockset shares are binary messages
    const share = Buffer.from([0, 1, 2, 255, 254, 253])
    const decoded = decodeBlockMessage(encodeBlockMessage(share))
    assert.deepStrictEqual(decoded?.message, share)
  })

  test("returns null on headerless plaintext", () => {
    // Pre-release payload-shape blocks carry no header and must fail like
    // a wrong passphrase, never decrypt to garbage
    assert.strictEqual(decodeBlockMessage(Buffer.from("secret message")), null)
    assert.strictEqual(decodeBlockMessage(Buffer.alloc(0)), null)
  })

  test("preserves future versions for the unsupported-version path", () => {
    const plaintext = encodeBlockMessage("secret message")
    plaintext.writeUInt8(3, 4)
    assert.strictEqual(decodeBlockMessage(plaintext)?.version, 3)
  })

  // Block content codec — the plaintext a block secret carries, binding
  // the secret to a detached archive master key when one is paired. The
  // encoding is frozen: legacy blocks in the wild carry the same JSON
  // shape, decoded by the same codec
  test("round-trips block content with and without master key", () => {
    const masterKey = Buffer.alloc(32, 5).toString("base64")
    const bound = encodeBlockContent("bound secret", masterKey)
    assert.deepStrictEqual(decodeBlockContent(bound), {
      masterKey: masterKey,
      secret: "bound secret",
    })
    // Without a master key the secret passes through untouched — no JSON
    // wrapping, so plain secrets stay plain
    const plain = encodeBlockContent("plain secret")
    assert.strictEqual(plain, "plain secret")
    assert.deepStrictEqual(decodeBlockContent(plain), {
      masterKey: null,
      secret: "plain secret",
    })
  })

  test("decodes JSON-shaped secrets as themselves", () => {
    // A secret that happens to be JSON without the content shape is the
    // secret itself — never partially unwrapped
    const jsonSecret = '{"note":"not block content"}'
    assert.deepStrictEqual(decodeBlockContent(jsonSecret), {
      masterKey: null,
      secret: jsonSecret,
    })
  })
})
