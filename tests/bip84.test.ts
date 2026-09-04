import assert from "assert"
import { suite, test } from "node:test"

import { mnemonicToSeed } from "@/src/utilities/crypto/bip39"
import {
  bip84DerivationPath,
  computeBip84ExtendedPublicKey,
  deriveBip84Addresses,
  deriveBip84ExtendedPrivateKey,
  deriveBip84ExtendedPublicKey,
} from "@/src/utilities/crypto/bip84"

// The projections pinned against the reference vectors published in
// BIP84 itself (the abandon…about test wallet), so both consumers — the
// derived wallet scheme over passphrase-less seeds and the Restore
// view’s mnemonic+passphrase pairing — agree with every wallet that
// implements the spec.

const mnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

const zpub =
  "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs"

suite("bip84", () => {
  test("freezes derivation path at the BIP84 first account", () => {
    assert.strictEqual(bip84DerivationPath, "m/84'/0'/0'")
  })

  test("derives extended keys of BIP84 reference seed", async () => {
    const seed = await mnemonicToSeed(mnemonic, "")
    assert.strictEqual(deriveBip84ExtendedPublicKey(seed), zpub)
    assert.strictEqual(
      deriveBip84ExtendedPrivateKey(seed),
      "zprvAdG4iTXWBoARxkkzNpNh8r6Qag3irQB8PzEMkAFeTRXxHpbF9z4QgEvBRmfvqWvGp42t42nvgGpNgYSJA9iefm1yYNZKEm7z6qUWCroSQnE"
    )
  })

  test("derives receive addresses of BIP84 reference seed", async () => {
    const seed = await mnemonicToSeed(mnemonic, "")
    assert.deepStrictEqual(deriveBip84Addresses(seed, 2), [
      "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
      "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g",
    ])
  })

  test("fails to derive addresses on invalid count", async () => {
    const seed = await mnemonicToSeed(mnemonic, "")
    for (const count of [0, -1, 1.5]) {
      assert.throws(() => deriveBip84Addresses(seed, count), {
        message: "Count must be a positive integer",
      })
    }
  })

  test("computes extended public key of mnemonic and passphrase", async () => {
    // Empty passphrase collapses to the reference seed…
    assert.strictEqual(await computeBip84ExtendedPublicKey(mnemonic, ""), zpub)
    // …while a passphrase salts the seed into a different account — the
    // salting itself is pinned by the fingerprint vectors in
    // tests/bip32.test.ts, which share the seed computation
    const salted = await computeBip84ExtendedPublicKey(mnemonic, "TREZOR")
    assert.notStrictEqual(salted, zpub)
    assert.match(salted, /^zpub/)
  })

  test("fails to compute extended public key of invalid mnemonic", async () => {
    await assert.rejects(computeBip84ExtendedPublicKey("abandon ability", ""), {
      message: "Invalid mnemonic",
    })
  })
})
