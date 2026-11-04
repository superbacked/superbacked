import assert from "assert"
import { suite, test } from "node:test"

import { HDKey } from "@scure/bip32"

import { mnemonicToSeed } from "@/src/utilities/crypto/bip39"
import {
  bip85DerivationPath,
  computeBip85Mnemonic,
  deriveBip85Entropy,
  deriveBip85Mnemonic,
} from "@/src/utilities/crypto/bip85"

// The derivations pinned against the reference vectors published in
// BIP85 itself (the xprv9s21ZrQH143K2LB… test root), so child mnemonics
// agree with every wallet that implements the spec.

const masterKey =
  "xprv9s21ZrQH143K2LBWUUQRFXhucrQqBpKdRRxNVq2zBqsx8HVqFk2uYo8kmbaLLHRdqtQpUm98uKfu3vca1LqdGhUtyoFnCNkfmXRyPXLjbKb"

const mnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

suite("bip85", () => {
  test("freezes derivation path at the BIP85 purpose", () => {
    assert.strictEqual(bip85DerivationPath, "m/83696968'")
  })

  test("derives entropy of BIP85 reference root key", () => {
    const root = HDKey.fromExtendedKey(masterKey)
    // Test cases 1 and 2 of the spec
    assert.strictEqual(
      deriveBip85Entropy(root, "m/83696968'/0'/0'").toString("hex"),
      "efecfbccffea313214232d29e71563d941229afb4338c21f9517c41aaa0d16f00b83d2a09ef747e7a64e8e2bd5a14869e693da66ce94ac2da570ab7ee48618f7"
    )
    assert.strictEqual(
      deriveBip85Entropy(root, "m/83696968'/0'/1'").toString("hex"),
      "70c6e3e8ebee8dc4c0dbba66076819bb8c09672527c4277ca8729532ad711872218f826919f6b67218adde99018a6df9095ab2b58d803b5b93ec9802085a690e"
    )
    // The HEX application vector (m/83696968'/128169'/{num_bytes}'/{index}')
    // — at 64 bytes the application is the untruncated pool, so the
    // vector pins the generic derivation
    assert.strictEqual(
      deriveBip85Entropy(root, "m/83696968'/128169'/64'/0'").toString("hex"),
      "492db4698cf3b73a5a24998aa3e9d7fa96275d85724a91e71aa2d645442f878555d078fd1f1f67e368976f04137b1f7a0d19232136ca50c44614af72b5582a5c"
    )
  })

  test("fails to derive entropy on invalid path", () => {
    const root = HDKey.fromExtendedKey(masterKey)
    for (const path of [
      "m/84'/0'/0'", // wrong purpose
      "m/83696968'", // purpose without application
      "m/83696968'/39'/0'/12'/0", // unhardened segment
      "83696968'/0'/0'", // relative path
    ]) {
      assert.throws(() => deriveBip85Entropy(root, path), {
        message: "Invalid BIP85 derivation path",
      })
    }
  })

  test("fails to derive entropy of non-master root key", () => {
    const root = HDKey.fromExtendedKey(masterKey).deriveChild(0)
    assert.throws(() => deriveBip85Entropy(root, "m/83696968'/0'/0'"), {
      message: "Root key must be master node",
    })
  })

  test("derives mnemonics of BIP85 reference root key", () => {
    const root = HDKey.fromExtendedKey(masterKey)
    // The BIP39 application vectors of the spec — 12, 18 and 24 English
    // words at index 0
    assert.strictEqual(
      deriveBip85Mnemonic(root, 12, 0),
      "girl mad pet galaxy egg matter matrix prison refuse sense ordinary nose"
    )
    assert.strictEqual(
      deriveBip85Mnemonic(root, 18, 0),
      "near account window bike charge season chef number sketch tomorrow excuse sniff circle vital hockey outdoor supply token"
    )
    assert.strictEqual(
      deriveBip85Mnemonic(root, 24, 0),
      "puppy ocean match cereal symbol another shed magic wrap hammer bulb intact gadget divorce twin tonight reason outdoor destroy simple truth cigar social volcano"
    )
    // Word count and index are derivation path segments — distinct
    // children by construction, never truncations of one another
    assert.notStrictEqual(
      deriveBip85Mnemonic(root, 12, 1),
      deriveBip85Mnemonic(root, 12, 0)
    )
  })

  test("fails to derive mnemonic on invalid words or index", () => {
    const root = HDKey.fromExtendedKey(masterKey)
    assert.throws(() => deriveBip85Mnemonic(root, 15 as 12, 0), {
      message: "Words must be 12, 18 or 24",
    })
    for (const index of [-1, 1.5, 2 ** 31]) {
      assert.throws(() => deriveBip85Mnemonic(root, 12, index), {
        message: "Invalid index",
      })
    }
  })

  test("computes child mnemonic of mnemonic and passphrase", async () => {
    // No published vector pairs the spec root with a mnemonic, so the
    // composition is pinned against its parts — the seed computation is
    // pinned by the fingerprint vectors in tests/bip32.test.ts and the
    // root derivation by the spec vectors above
    const seed = await mnemonicToSeed(mnemonic, "")
    assert.strictEqual(
      await computeBip85Mnemonic(mnemonic, "", 12, 0),
      deriveBip85Mnemonic(HDKey.fromMasterSeed(seed), 12, 0)
    )
    // A passphrase salts the seed into a different root, so children
    // diverge too
    assert.notStrictEqual(
      await computeBip85Mnemonic(mnemonic, "TREZOR", 12, 0),
      await computeBip85Mnemonic(mnemonic, "", 12, 0)
    )
  })

  test("fails to compute child mnemonic of invalid mnemonic", async () => {
    await assert.rejects(computeBip85Mnemonic("abandon ability", "", 12, 0), {
      message: "Invalid mnemonic",
    })
  })
})
