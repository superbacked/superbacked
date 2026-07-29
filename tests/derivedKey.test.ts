import assert from "assert"
import { createHash, createHmac, hkdfSync } from "crypto"
import { suite, test } from "node:test"

import {
  computeChallenge,
  computeMasterKey,
  computeSingleFactorDerivedKey,
  deriveKey,
  noYubiKeySalt,
} from "@/src/utilities/crypto/derivedKey"

// Reference vectors freeze the derivation scheme — changing any constant,
// cost parameter or construction in the module breaks them. Context strings
// are pinned by raw crypto recomputation, not just output values.
const masterKey = Buffer.alloc(32, 1)
const otherMasterKey = Buffer.alloc(32, 2)

suite("derivedKey", () => {
  test("freezes no-YubiKey salt", () => {
    assert.strictEqual(
      noYubiKeySalt.toString("hex"),
      "0b3aba156bf3ad0019e38a551b5a59b260c112e31492ee023981c5f330ad534c"
    )
    // Raw crypto recomputation pins the frozen context string
    assert.deepStrictEqual(
      noYubiKeySalt,
      createHash("sha256")
        .update("superbacked-derived-key-v1-no-yubikey", "utf8")
        .digest()
    )
    // A real YubiKey response is 20 bytes, so the two modes can never share
    // a salt
    assert.strictEqual(noYubiKeySalt.length, 32)
  })

  test("computes challenge", () => {
    assert.strictEqual(
      computeChallenge(masterKey, "github").toString("hex"),
      "8286ad9b27953a4d5b555eed86bce3caa0c9af20ed9a9fc7bdb2a3f3b2fb7751"
    )
  })

  test("verifies challenge construction independently", () => {
    // Raw crypto recomputation pins the frozen context string, not just the
    // output value
    assert.deepStrictEqual(
      computeChallenge(masterKey, "github"),
      createHmac("sha256", masterKey)
        .update("superbacked-derived-key-v1-challenge-github", "utf8")
        .digest()
    )
  })

  test("computes distinct challenges for distinct labels", () => {
    assert.notDeepStrictEqual(
      computeChallenge(masterKey, "github"),
      computeChallenge(masterKey, "proton")
    )
  })

  test("derives key", () => {
    assert.strictEqual(
      deriveKey(masterKey, noYubiKeySalt).toString("hex"),
      "477af217affde3f5a7d176d89fd2cfb5a496603c4b20339176d3d7f88864481c"
    )
  })

  test("verifies key construction independently", () => {
    // Raw crypto recomputation pins the frozen info string
    assert.deepStrictEqual(
      deriveKey(masterKey, noYubiKeySalt),
      Buffer.from(
        hkdfSync(
          "sha256",
          masterKey,
          noYubiKeySalt,
          Buffer.from("superbacked-derived-key-v1", "utf8"),
          32
        )
      )
    )
  })

  test("derives key from simulated YubiKey response", () => {
    // The YubiKey computes HMAC-SHA1 keyed with the slot secret — simulated
    // in software with a known secret, pinning the full two-factor path
    const slotSecret = Buffer.alloc(20, 3)
    const response = createHmac("sha1", slotSecret)
      .update(computeChallenge(masterKey, "github"))
      .digest()
    assert.strictEqual(response.length, 20)
    assert.strictEqual(
      deriveKey(masterKey, response).toString("hex"),
      "79bb33d2db5a6a613167e467805e7b8605935c614cc4a691d3df391d9e8729c3"
    )
  })

  test("derives distinct keys for distinct salts", () => {
    assert.notDeepStrictEqual(
      deriveKey(masterKey, noYubiKeySalt),
      deriveKey(masterKey, Buffer.alloc(20, 3))
    )
  })

  test("derives distinct keys for distinct master keys", () => {
    assert.notDeepStrictEqual(
      deriveKey(masterKey, noYubiKeySalt),
      deriveKey(otherMasterKey, noYubiKeySalt)
    )
  })

  test("computes master key", async () => {
    // Argon2d at the v2 standard profile (64 MiB, 80 passes, 4 lanes) —
    // the permanent cost of scheme v1, frozen before any derived password
    // shipped
    const key = await computeMasterKey(
      "lip gift name net sixth",
      "github",
      false
    )
    assert.strictEqual(
      key.toString("hex"),
      "8183259ed6aff4aae03536e7de042a9bc16ff24f67c1c4d9447f175246463241"
    )
  })

  test("computes paranoid master key", async () => {
    // Argon2d at the v2 paranoid profile (1 GiB, 50 passes, 4 lanes) —
    // statelessness makes the mode part of what the user must know, so
    // both costs are frozen vectors
    const key = await computeMasterKey(
      "lip gift name net sixth",
      "github",
      true
    )
    assert.strictEqual(
      key.toString("hex"),
      "c90eeab569a2d9faacdc71484de1b4e677d5dd9ad7476b2b5c99a6fb627f27f9"
    )
  })

  test("computes distinct master keys for distinct labels", async () => {
    assert.notDeepStrictEqual(
      await computeMasterKey("lip gift name net sixth", "github", false),
      await computeMasterKey("lip gift name net sixth", "proton", false)
    )
  })

  test("computes single-factor derived key equal to composed derivation", async () => {
    // The single-factor variant substitutes the fixed public salt for the
    // response
    assert.deepStrictEqual(
      await computeSingleFactorDerivedKey(
        "lip gift name net sixth",
        "github",
        false
      ),
      deriveKey(
        await computeMasterKey("lip gift name net sixth", "github", false),
        noYubiKeySalt
      )
    )
  })
})
