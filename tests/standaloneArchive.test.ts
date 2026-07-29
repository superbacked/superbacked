import assert from "assert"
import { createHmac, hkdfSync } from "crypto"
import { suite, test } from "node:test"

import { legacyKdfProfile } from "@/src/shared/utilities/kdfProfiles"
import {
  computeArchiveKeys,
  passphraseKeyInfo,
  probeKeyInfo,
  standaloneArchiveVersion,
} from "@/src/utilities/core/standaloneArchive"
import {
  computeChallenge,
  computeProbeKey,
  computeResponseBoundKey,
} from "@/src/utilities/crypto/passphraseKey"

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
    // (see src/utilities/crypto/passphraseKey.ts)
    assert.strictEqual(passphraseKeyInfo, "encryption-key-v1")
  })

  test("computes archive key from passphrase", async () => {
    // Pins the pre-existing Argon2d derivation — existing archives must
    // decrypt forever
    const keys = await computeArchiveKeys(
      "lip gift name net sixth",
      salt,
      legacyKdfProfile
    )
    assert.deepStrictEqual(keys.key, stretchedKey)
  })

  test("freezes archive version", () => {
    assert.strictEqual(standaloneArchiveVersion, 2)
  })

  test("freezes probe key info and construction", async () => {
    assert.strictEqual(probeKeyInfo, "version-probe-v1")
    // Raw crypto recomputation pins the single-factor probe key — the
    // HKDF sibling of the raw stretched key, never the key itself
    const keys = await computeArchiveKeys(
      "lip gift name net sixth",
      salt,
      legacyKdfProfile
    )
    assert.deepStrictEqual(
      keys.probeKey,
      Buffer.from(
        hkdfSync(
          "sha256",
          stretchedKey,
          Buffer.alloc(0),
          Buffer.from(probeKeyInfo, "utf8"),
          32
        )
      )
    )
    assert.notDeepStrictEqual(keys.probeKey, keys.key)
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
    // The two-factor probe key sits at the same factor depth — deriving
    // it requires the response, and it never collides with the
    // encryption key
    const probeKey = computeProbeKey(stretchedKey, probeKeyInfo, response)
    assert.notDeepStrictEqual(
      probeKey,
      computeProbeKey(stretchedKey, probeKeyInfo)
    )
    assert.notDeepStrictEqual(
      probeKey,
      computeResponseBoundKey(stretchedKey, response, passphraseKeyInfo)
    )
  })
})
