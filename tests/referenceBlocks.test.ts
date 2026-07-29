import assert from "assert"
import { createHmac } from "crypto"
import { readFileSync } from "fs"
import { suite, test } from "node:test"

import { decode as decodeJpeg } from "jpeg-js"
import decodeQR from "qr/decode.js"

import {
  KdfProfile,
  legacyKdfProfile,
  v2ParanoidKdfProfile,
  v2StandardKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"
import {
  blockVersion,
  decodeBlockMessage,
  deriveBlockKey,
  deriveBlocksetKey,
  passphraseKeyInfo,
} from "@/src/utilities/core/block"
import argon2 from "@/src/utilities/crypto/argon2"
import { decrypt as fixedSizeDecrypt } from "@/src/utilities/crypto/fixedSizeEncryption"
import { decrypt as legacyFixedSizeDecrypt } from "@/src/utilities/crypto/legacyFixedSizeEncryption"
import {
  computeChallenge,
  computeResponseBoundKey,
  computeStretchedKey,
} from "@/src/utilities/crypto/passphraseKey"
import { combineShares } from "@/src/utilities/crypto/shamir"

// The published reference blocks (see docs/reference-blocks) restored
// from their printed artifacts — the JPGs are decoded to pixels and QR
// payloads exactly like a drag and dropped block, then decrypted with
// the real scheme modules, so any regression in backward compatibility
// or format drift fails against physical ground truth. Argon2 runs make
// this the slowest suite (several stretches, one at the paranoid
// profile).
//
// Every reference artifact carries both reference secrets, each under
// its own passphrase.

const secret1 = readFileSync("tests/fixtures/secrets/1.txt")
const secret2 = readFileSync("tests/fixtures/secrets/2.txt")

const v1Passphrases = [
  "debit cola clap iron treat",
  "most cage rack sniff halt",
]
const v2Passphrases = [
  "deletion fragility charging freefall snitch enigmatic outbreak",
  "pristine pod scanner rebound ashes shy favorite",
]

// Published verification secret (never a real one) — provisioning a
// YubiKey slot with it makes the YubiKey reference artifacts physically
// restorable, and simulating its responses in software makes them
// restorable here
const referenceSlotSecret = Buffer.from(
  "1ecb57826ae09610b3b249e1869400e731334229",
  "hex"
)

interface ReferencePayload {
  data: string
  headers?: string
  iv?: string
  metadata: { label?: string }
  salt: string
}

const decodeBlockPayload = (path: string): ReferencePayload => {
  const image = decodeJpeg(readFileSync(path))
  return JSON.parse(
    decodeQR({ data: image.data, height: image.height, width: image.width })
  ) as ReferencePayload
}

// The single-factor block key derivation function key is the raw
// stretched key (see computeBlockKdfKey in src/utilities/core/block.ts —
// composed here from its parts so the two-factor tests can reuse the
// stretch with a simulated response)
const stretch = (
  passphrase: string,
  payload: ReferencePayload,
  profile: KdfProfile
): Promise<Buffer> => {
  return computeStretchedKey(
    passphrase,
    Buffer.from(payload.salt, "base64"),
    profile
  )
}

const decryptVersionedMessage = (key: Buffer, payload: ReferencePayload) => {
  const plaintext = fixedSizeDecrypt(key, Buffer.from(payload.data, "base64"))
  const decoded = decodeBlockMessage(plaintext)
  assert.notStrictEqual(decoded, null)
  assert.strictEqual(decoded?.version, blockVersion)
  return decoded.message
}

suite("referenceBlocks", () => {
  test("restores both secrets of the v2 standard reference block", async () => {
    const payload = decodeBlockPayload(
      "docs/reference-blocks/v2/single-block/standard/870da1ab.jpg"
    )
    assert.strictEqual(payload.metadata.label, "backup")
    const [firstKey, secondKey] = await Promise.all(
      v2Passphrases.map((passphrase) =>
        stretch(passphrase, payload, v2StandardKdfProfile)
      )
    )
    assert.ok(firstKey !== undefined && secondKey !== undefined)
    assert.deepStrictEqual(
      decryptVersionedMessage(deriveBlockKey(firstKey), payload),
      secret1
    )
    assert.deepStrictEqual(
      decryptVersionedMessage(deriveBlockKey(secondKey), payload),
      secret2
    )
    // A single flipped bit fails authentication — a corrupted scan can
    // never decrypt to garbage
    const tampered = Buffer.from(payload.data, "base64")
    tampered.writeUInt8(tampered.readUInt8(100) ^ 1, 100)
    assert.throws(() => fixedSizeDecrypt(deriveBlockKey(firstKey), tampered), {
      message: "Secret not found",
    })
  })

  test("restores the v2 paranoid reference block at the paranoid profile only", async () => {
    const payload = decodeBlockPayload(
      "docs/reference-blocks/v2/single-block/paranoid/deaf44a6.jpg"
    )
    const [firstPassphrase, secondPassphrase] = v2Passphrases
    assert.ok(firstPassphrase !== undefined && secondPassphrase !== undefined)
    const paranoidKey = await stretch(
      firstPassphrase,
      payload,
      v2ParanoidKdfProfile
    )
    assert.deepStrictEqual(
      decryptVersionedMessage(deriveBlockKey(paranoidKey), payload),
      secret1
    )
    assert.deepStrictEqual(
      decryptVersionedMessage(
        deriveBlockKey(
          await stretch(secondPassphrase, payload, v2ParanoidKdfProfile)
        ),
        payload
      ),
      secret2
    )
    // The standard profile derives a different key — a paranoid block
    // restored without the mode fails exactly like a wrong passphrase
    const standardKey = await stretch(
      firstPassphrase,
      payload,
      v2StandardKdfProfile
    )
    assert.throws(
      () =>
        fixedSizeDecrypt(
          deriveBlockKey(standardKey),
          Buffer.from(payload.data, "base64")
        ),
      { message: "Secret not found" }
    )
  })

  test("restores the YubiKey-protected reference block with a simulated response, never without", async () => {
    const payload = decodeBlockPayload(
      "docs/reference-blocks/v2/single-block/standard/yubikey/37e60418.jpg"
    )
    for (const [index, expected] of [secret1, secret2].entries()) {
      const passphrase = v2Passphrases[index]
      assert.ok(passphrase !== undefined)
      const stretchedKey = await stretch(
        passphrase,
        payload,
        v2StandardKdfProfile
      )
      // The YubiKey computes HMAC-SHA1 keyed with the slot secret —
      // simulated in software with the published reference secret
      const response = createHmac("sha1", referenceSlotSecret)
        .update(computeChallenge(stretchedKey))
        .digest()
      const kdfKey = computeResponseBoundKey(
        stretchedKey,
        response,
        passphraseKeyInfo
      )
      assert.deepStrictEqual(
        decryptVersionedMessage(deriveBlockKey(kdfKey), payload),
        expected
      )
      // Without the response, the same stretch derives nothing — the
      // hardware is load-bearing
      assert.throws(
        () =>
          fixedSizeDecrypt(
            deriveBlockKey(stretchedKey),
            Buffer.from(payload.data, "base64")
          ),
        { message: "Secret not found" }
      )
      // A wrong YubiKey (different slot secret) fails exactly like a
      // wrong passphrase
      const wrongResponse = createHmac("sha1", Buffer.alloc(20, 9))
        .update(computeChallenge(stretchedKey))
        .digest()
      assert.throws(
        () =>
          fixedSizeDecrypt(
            deriveBlockKey(
              computeResponseBoundKey(
                stretchedKey,
                wrongResponse,
                passphraseKeyInfo
              )
            ),
            Buffer.from(payload.data, "base64")
          ),
        { message: "Secret not found" }
      )
    }
  })

  test("restores both secrets of the v2 reference blockset from any two members", async () => {
    const payloads = ["3a0bce97", "7bd1698a", "8c9d627b"].map((member) =>
      decodeBlockPayload(
        `docs/reference-blocks/v2/blockset/standard/${member}.jpg`
      )
    )
    for (const payload of payloads) {
      assert.strictEqual(payload.metadata.label, "succession")
    }
    for (const [index, expected] of [secret1, secret2].entries()) {
      const passphrase = v2Passphrases[index]
      assert.ok(passphrase !== undefined)
      const shares = await Promise.all(
        payloads.map(async (payload) =>
          decryptVersionedMessage(
            deriveBlocksetKey(
              await stretch(passphrase, payload, v2StandardKdfProfile)
            ),
            payload
          )
        )
      )
      // 2-of-3 — every pair of members must combine to the secret
      for (const pair of [
        [shares[0], shares[1]],
        [shares[1], shares[2]],
        [shares[0], shares[2]],
      ]) {
        const [firstShare, secondShare] = pair
        assert.ok(firstShare !== undefined && secondShare !== undefined)
        assert.strictEqual(
          await combineShares([firstShare, secondShare]),
          expected.toString("utf8")
        )
      }
    }
  })

  test("fails to decrypt the v2 standard reference block using a wrong passphrase", async () => {
    const payload = decodeBlockPayload(
      "docs/reference-blocks/v2/single-block/standard/870da1ab.jpg"
    )
    const key = await stretch(
      "wrong passphrase entirely",
      payload,
      v2StandardKdfProfile
    )
    assert.throws(
      () =>
        fixedSizeDecrypt(
          deriveBlockKey(key),
          Buffer.from(payload.data, "base64")
        ),
      { message: "Secret not found" }
    )
  })

  test("restores both secrets of the v1 reference block", async () => {
    const payload = decodeBlockPayload(
      "docs/reference-blocks/v1/single-block/bceb4321.jpg"
    )
    assert.strictEqual(payload.metadata.label, "backup")
    assert.ok(payload.iv !== undefined && payload.headers !== undefined)
    // The legacy path rejects a wrong passphrase at the header scan —
    // a different code path from the v2 authentication failure
    await assert.rejects(
      legacyFixedSizeDecrypt(
        "wrong passphrase entirely",
        Buffer.from(payload.salt, "base64"),
        Buffer.from(payload.iv, "base64"),
        Buffer.from(payload.headers, "base64"),
        Buffer.from(payload.data, "base64"),
        (kdfPassphrase, salt) => argon2(kdfPassphrase, salt, legacyKdfProfile)
      ),
      { message: "Header not found" }
    )
    for (const [index, expected] of [secret1, secret2].entries()) {
      const passphrase = v1Passphrases[index]
      assert.ok(passphrase !== undefined)
      const message = await legacyFixedSizeDecrypt(
        passphrase,
        Buffer.from(payload.salt, "base64"),
        Buffer.from(payload.iv, "base64"),
        Buffer.from(payload.headers, "base64"),
        Buffer.from(payload.data, "base64"),
        (kdfPassphrase, salt) => argon2(kdfPassphrase, salt, legacyKdfProfile)
      )
      assert.deepStrictEqual(message, expected)
    }
  })

  test("restores both secrets of the v1 reference blockset from any two members", async () => {
    const payloads = ["689e5b97", "88a1af0d", "d18716f1"].map((member) =>
      decodeBlockPayload(`docs/reference-blocks/v1/blockset/${member}.jpg`)
    )
    const shamirPrefix = Buffer.from("shamir:")
    for (const [index, expected] of [secret1, secret2].entries()) {
      const passphrase = v1Passphrases[index]
      assert.ok(passphrase !== undefined)
      const shares = await Promise.all(
        payloads.map(async (payload) => {
          assert.ok(payload.iv !== undefined && payload.headers !== undefined)
          const message = await legacyFixedSizeDecrypt(
            passphrase,
            Buffer.from(payload.salt, "base64"),
            Buffer.from(payload.iv, "base64"),
            Buffer.from(payload.headers, "base64"),
            Buffer.from(payload.data, "base64"),
            (kdfPassphrase, salt) =>
              argon2(kdfPassphrase, salt, legacyKdfProfile)
          )
          // Legacy shares carry the shamir: prefix (see
          // classifyPrefixedShare in src/handlers/restore.ts)
          assert.deepStrictEqual(
            message.subarray(0, shamirPrefix.length),
            shamirPrefix
          )
          return message.subarray(shamirPrefix.length)
        })
      )
      const [firstShare, secondShare] = shares
      assert.ok(firstShare !== undefined && secondShare !== undefined)
      assert.strictEqual(
        await combineShares([firstShare, secondShare]),
        expected.toString("utf8")
      )
    }
  })
})
