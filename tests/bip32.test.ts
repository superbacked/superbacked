import assert from "assert"
import { suite, test } from "node:test"

import { computeBip32RootFingerprint } from "@/src/utilities/crypto/bip32"

// The fingerprint composition — BIP39 seed to BIP32 master node to
// fingerprint — pinned against the publicly documented wallet every
// implementation agrees on (the BIP174 test wallet), so the Restore
// view’s passphrase applet matches what a Trezor connected to Electrum
// displays.

const mnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

suite("bip32", () => {
  test("computes BIP32 root fingerprint", async () => {
    // Public ground truth — the fingerprint documented in BIP174 for
    // this mnemonic without a passphrase
    assert.strictEqual(
      await computeBip32RootFingerprint(mnemonic, ""),
      "73c5da0a"
    )
    // Frozen vector — the official BIP39 test passphrase
    assert.strictEqual(
      await computeBip32RootFingerprint(mnemonic, "TREZOR"),
      "b4e3f5ed"
    )
  })

  test("fails to compute fingerprint of invalid mnemonic", async () => {
    await assert.rejects(
      computeBip32RootFingerprint("abandon ability", "passphrase"),
      { message: "Invalid mnemonic" }
    )
  })
})
