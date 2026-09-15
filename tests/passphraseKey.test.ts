import assert from "assert"
import { createHmac, hkdfSync } from "crypto"
import { suite, test } from "node:test"

import {
  computeChallenge,
  computeProbeKey,
  computeResponseBoundKey,
} from "@/src/utilities/crypto/passphraseKey"

// Reference vectors freeze the two-factor arm of the passphrase key scheme
// — changing any constant or construction breaks them, and with it every
// YubiKey-protected standalone archive and block. The single-factor arm
// (Argon2d over the stored salt) is pinned by the consumer suites (see
// tests/standaloneArchive.test.ts and tests/block.test.ts). Context
// strings are pinned by raw crypto recomputation, not just output values.
const stretchedKey = Buffer.alloc(32, 1)
const otherStretchedKey = Buffer.alloc(32, 2)

suite("passphraseKey", () => {
  test("computes challenge", () => {
    assert.strictEqual(
      computeChallenge(stretchedKey).toString("hex"),
      "88dcafb4ccea7641da77a33ba11eaceb88cb2fa4308149d4174d9ef5250a440f"
    )
  })

  test("verifies challenge construction independently", () => {
    // Raw crypto recomputation pins the frozen context string
    assert.deepStrictEqual(
      computeChallenge(stretchedKey),
      createHmac("sha256", stretchedKey)
        .update("superbacked-passphrase-key-challenge", "utf8")
        .digest()
    )
  })

  test("computes distinct challenges for distinct stretched keys", () => {
    // The stored salt is stretched into the key, so every block and
    // standalone archive asks the YubiKey a different question
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
      "a91abc823fa7695fb7e21d4ec60df456e0b984177a6fa590be1787629a7f5767"
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

  test("verifies single-factor probe key construction independently", () => {
    // Raw crypto recomputation pins the frozen construction — HKDF with an
    // empty salt, never the raw stretched key, so the probe stays
    // domain-separated from the single-factor consumer key
    assert.deepStrictEqual(
      computeProbeKey(stretchedKey, "probe-info"),
      Buffer.from(
        hkdfSync(
          "sha256",
          stretchedKey,
          Buffer.alloc(0),
          Buffer.from("probe-info", "utf8"),
          32
        )
      )
    )
  })

  test("computes two-factor probe key at response depth", () => {
    // With a response, the probe matches the response-bound construction
    // under the probe info — a correctness check that requires the
    // hardware, like the payload key it probes for
    const response = Buffer.alloc(20, 4)
    assert.deepStrictEqual(
      computeProbeKey(stretchedKey, "probe-info", response),
      computeResponseBoundKey(stretchedKey, response, "probe-info")
    )
    assert.notDeepStrictEqual(
      computeProbeKey(stretchedKey, "probe-info", response),
      computeProbeKey(stretchedKey, "probe-info")
    )
  })

  test("computes probe key distinct from consumer keys", () => {
    const response = Buffer.alloc(20, 4)
    assert.notDeepStrictEqual(
      computeProbeKey(stretchedKey, "probe-info"),
      stretchedKey
    )
    assert.notDeepStrictEqual(
      computeProbeKey(stretchedKey, "probe-info", response),
      computeResponseBoundKey(stretchedKey, response, "info")
    )
  })
})
