import assert from "assert"
import { createHash, createHmac, hkdfSync } from "crypto"
import { suite, test } from "node:test"

import {
  computeChallenge,
  computeMasterKey,
  computeSingleFactorDerivedKey,
  deriveKey,
  noYubiKeySalt,
  schemeVersion,
} from "@/src/utilities/crypto/derivedKey"

// Reference vectors freeze the derivation scheme — changing any constant,
// cost parameter or construction in the module breaks them. Context strings
// are pinned by raw crypto recomputation, not just output values.
const masterKey = Buffer.alloc(32, 1)
const otherMasterKey = Buffer.alloc(32, 2)

suite("derivedKey", () => {
  test("freezes scheme version", () => {
    // Surfaced at every derivation and selectable with
    // --derivation-version — a silent bump would strand every derived
    // password and wallet behind a version nobody chose
    assert.strictEqual(schemeVersion, 1)
  })

  test("freezes no-YubiKey salt", () => {
    assert.strictEqual(
      noYubiKeySalt.toString("hex"),
      "7df9f6209325de42d129e9cc4900ca2f0c34fefad9c8ee76874010e0e89917a3"
    )
    // Raw crypto recomputation pins the frozen context string
    assert.deepStrictEqual(
      noYubiKeySalt,
      createHash("sha256")
        .update("superbacked-derived-key-no-yubikey", "utf8")
        .digest()
    )
    // A real YubiKey response is 20 bytes, so the two modes can never share
    // a salt
    assert.strictEqual(noYubiKeySalt.length, 32)
  })

  test("computes challenge", () => {
    assert.strictEqual(
      computeChallenge(masterKey, "github").toString("hex"),
      "2fec4474a54a452630699ab31c4bc703030cdb01d45722204804a8c87c2280ff"
    )
  })

  test("verifies challenge construction independently", () => {
    // Raw crypto recomputation pins the frozen context string, not just the
    // output value
    assert.deepStrictEqual(
      computeChallenge(masterKey, "github"),
      createHmac("sha256", masterKey)
        .update("superbacked-derived-key-challenge-github", "utf8")
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
      "e623b3ec80f5042f2e4e5453b2bd4bcb25cf78c3d4a1bdd0dfeee030535ce20a"
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
          Buffer.from("superbacked-derived-key", "utf8"),
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
      "9bb88b23ebd9e3efb92424bbb96a53ffe2110bc7e3a33f28ce873dbc06d039b0"
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
    // Argon2d at the standard profile (64 MiB, 80 passes, 4 lanes) —
    // the permanent cost of scheme v1, frozen before any derived password
    // shipped
    const key = await computeMasterKey(
      "lip gift name net sixth",
      "github",
      false
    )
    assert.strictEqual(
      key.toString("hex"),
      "794091dfc706c2e8e916389801ca58c83cf155d34c7248ec870eefb9b83d072c"
    )
  })

  test("computes paranoid master key", async () => {
    // Argon2d at the paranoid profile (1 GiB, 50 passes, 4 lanes) —
    // statelessness makes the mode part of what the user must know, so
    // both costs are frozen vectors
    const key = await computeMasterKey(
      "lip gift name net sixth",
      "github",
      true
    )
    assert.strictEqual(
      key.toString("hex"),
      "951c1fc722e2b39e62a21d89b948f6d75453c662c614f219fcdc3c63d58984c7"
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
