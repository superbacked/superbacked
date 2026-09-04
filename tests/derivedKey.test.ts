import assert from "assert"
import { createHmac, hkdfSync } from "crypto"
import { suite, test } from "node:test"

import {
  computeChallenge,
  computeMasterKey,
  deriveKey,
  schemeVersion,
} from "@/src/utilities/crypto/derivedKey"

// Reference vectors freeze the derivation scheme — changing any constant,
// cost parameter or construction in the module breaks them. Context strings
// are pinned by raw crypto recomputation, not just output values.
const masterKey = Buffer.alloc(32, 1)
const otherMasterKey = Buffer.alloc(32, 2)
// Stands in for a YubiKey HMAC-SHA1 response (20 bytes) — derivation
// always mixes in a response, so tests pin against a fixed one
const testSalt = Buffer.alloc(20, 4)

suite("derivedKey", () => {
  test("freezes scheme version", () => {
    // Surfaced at every derivation and selectable with
    // --derivation-version — a silent bump would strand every derived
    // password and wallet behind a version nobody chose
    assert.strictEqual(schemeVersion, 1)
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
      deriveKey(masterKey, testSalt).toString("hex"),
      "0c23a1d44867c6ee155a5c85c1ca3e8e7c3b09ad83d8847d9bafa3089da53113"
    )
  })

  test("verifies key construction independently", () => {
    // Raw crypto recomputation pins the frozen info string
    assert.deepStrictEqual(
      deriveKey(masterKey, testSalt),
      Buffer.from(
        hkdfSync(
          "sha256",
          masterKey,
          testSalt,
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
      deriveKey(masterKey, testSalt),
      deriveKey(masterKey, Buffer.alloc(20, 3))
    )
  })

  test("derives distinct keys for distinct master keys", () => {
    assert.notDeepStrictEqual(
      deriveKey(masterKey, testSalt),
      deriveKey(otherMasterKey, testSalt)
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
      "48121ed96e95351ffc9a24d71b9e140e2c0b393d5922e17695806ba66578bf2e"
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
      "02bc93548a5e177d5a74987ce7d787a2f60c99595c7d5f69bd460dc53f5b565b"
    )
  })

  test("computes distinct master keys for distinct labels", async () => {
    assert.notDeepStrictEqual(
      await computeMasterKey("lip gift name net sixth", "github", false),
      await computeMasterKey("lip gift name net sixth", "proton", false)
    )
  })
})
