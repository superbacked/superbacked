import assert from "assert"
import { createHmac } from "crypto"
import { suite, test } from "node:test"

import {
  computeChallenge,
  computeResponseBoundKey,
} from "@/src/utilities/passphraseKey"
import {
  computeArchiveKey,
  passphraseKeyInfo,
} from "@/src/utilities/standaloneArchive"

// Reference vectors freeze both archive key derivation paths — the
// single-factor path decrypts every existing archive and the two-factor
// path every archive created with --yubikey, so changing either breaks
// archives in the wild. The two-factor path is pinned by composing the
// stretched key with a software-simulated YubiKey response, as driving
// computeArchiveKey through it requires hardware.
const salt = Buffer.alloc(16, 2)
// Argon2d("lip gift name net sixth", salt) — the frozen stretched key
const stretchedKey = Buffer.from(
  "a6a3889592fe2207aa186c97bdd04d896aef299255bf3c19b3879885c136a4e4",
  "hex"
)

suite("standaloneArchive", () => {
  test("freezes passphrase key info", () => {
    // Changing it changes the key of every archive created with --yubikey
    // (see src/utilities/passphraseKey.ts)
    assert.strictEqual(passphraseKeyInfo, "encryption-key-v1")
  })

  test("computes archive key from passphrase", async () => {
    // Pins the pre-existing Argon2d derivation — existing archives must
    // decrypt forever
    const key = await computeArchiveKey("lip gift name net sixth", salt)
    assert.deepStrictEqual(key, stretchedKey)
  })

  test("computes archive key from simulated YubiKey response", () => {
    // The full two-factor pipeline for this passphrase and salt, with the
    // YubiKey simulated in software using a known slot secret
    const slotSecret = Buffer.alloc(20, 3)
    const challenge = computeChallenge(stretchedKey)
    assert.strictEqual(
      challenge.toString("hex"),
      "e8fc8c8f9ee9a35a8e5b9f3a19cabcae5ee66d188e25e9befbaad4b1570d2d38"
    )
    const response = createHmac("sha1", slotSecret).update(challenge).digest()
    assert.strictEqual(
      computeResponseBoundKey(
        stretchedKey,
        response,
        passphraseKeyInfo
      ).toString("hex"),
      "d5491bd883d6db88f81bb9c6bcd4d14993f74ad1b062c50bd95803bbf13c6a48"
    )
  })
})
