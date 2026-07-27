import assert from "assert"
import { createHmac, hkdfSync } from "crypto"
import { suite, test } from "node:test"

import {
  computeChallenge,
  computeResponseBoundKey,
} from "@/src/utilities/passphraseKey"

// Reference vectors freeze the two-factor arm of the passphrase key scheme
// — changing any constant or construction breaks them, and with it every
// YubiKey-protected standalone archive and block. The single-factor arm
// (Argon2d over the artifact salt) is pinned by the consumer suites (see
// tests/standaloneArchive.test.ts and tests/block.test.ts). Context
// strings are pinned by raw crypto recomputation, not just output values.
const stretchedKey = Buffer.alloc(32, 1)
const otherStretchedKey = Buffer.alloc(32, 2)

suite("passphraseKey", () => {
  test("computes challenge", () => {
    assert.strictEqual(
      computeChallenge(stretchedKey).toString("hex"),
      "a23d7e8ee203cb1fd1e2ef18be450dd6c7f8da571e31ac80adfd94bdea6e18b2"
    )
  })

  test("verifies challenge construction independently", () => {
    // Raw crypto recomputation pins the frozen context string
    assert.deepStrictEqual(
      computeChallenge(stretchedKey),
      createHmac("sha256", stretchedKey)
        .update("superbacked-passphrase-key-v1-challenge", "utf8")
        .digest()
    )
  })

  test("computes distinct challenges for distinct stretched keys", () => {
    // The artifact salt is stretched into the key, so every artifact asks
    // the YubiKey a different question
    assert.notDeepStrictEqual(
      computeChallenge(stretchedKey),
      computeChallenge(otherStretchedKey)
    )
  })

  test("computes response-bound key from simulated YubiKey response", () => {
    // The YubiKey computes HMAC-SHA1 keyed with the slot secret — simulated
    // in software with a known secret, pinning the full two-factor arm
    const slotSecret = Buffer.alloc(20, 3)
    const response = createHmac("sha1", slotSecret)
      .update(computeChallenge(stretchedKey))
      .digest()
    assert.strictEqual(response.length, 20)
    assert.strictEqual(
      computeResponseBoundKey(stretchedKey, response, "info").toString("hex"),
      "1966f620f8b3fbdcafdf46d669c7d0fdba0214996401ec4d2d0eb05959365790"
    )
  })

  test("verifies response-bound key construction independently", () => {
    const response = Buffer.alloc(20, 4)
    assert.deepStrictEqual(
      computeResponseBoundKey(stretchedKey, response, "info"),
      Buffer.from(
        hkdfSync(
          "sha256",
          stretchedKey,
          response,
          Buffer.from("info", "utf8"),
          32
        )
      )
    )
  })

  test("computes distinct keys for distinct infos", () => {
    const response = Buffer.alloc(20, 4)
    assert.notDeepStrictEqual(
      computeResponseBoundKey(stretchedKey, response, "info"),
      computeResponseBoundKey(stretchedKey, response, "other-info")
    )
  })
})
