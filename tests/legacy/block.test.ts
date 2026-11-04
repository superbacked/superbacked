import assert from "assert"
import { suite, test } from "node:test"

import { decryptLegacyBlock } from "@/src/utilities/core/legacy/block"

// The legacy block scheme is frozen and restoration-only — pinned here by
// frozen payloads generated at the legacy Argon2d profile with the
// removed legacy encrypt, one per key derivation mode: subkey (v1.6.0
// through v1.12.1) and legacy mode (v1.5.1 and earlier), the latter
// restoring only through the fallback chain inside decryptLegacyBlock.
// The published legacy reference blocks pin the scheme against real
// shipped artifacts (see tests/referenceBlocks.test.ts) — a real
// pre-subkey reference block will pin the fallback the same way. The
// LegacyPayload shape itself is pinned structurally by the era detection
// tests (see tests/pipeline.test.ts). Argon2 runs make this a slow-ish
// suite (three stretches at the legacy profile).

const passphrase = "legacy block reference passphrase"

// Frozen subkey-mode payload holding "subkey mode secret"
const subkeyPayload = {
  salt: Buffer.from("drhSSdjfLJq6kjWEwTolAQ==", "base64"),
  iv: Buffer.from("1OjF0rFsUerXFnVz2VaDeQ==", "base64"),
  headers: Buffer.from(
    "nZykib+IFMzLY/8S614N9PrY9sfip7P9Y2leBLl6RBj+kGlDu4JuDrJ4gW9z8jt8nUV9x6UK4wwrhrmsW69lXg==",
    "base64"
  ),
  data: Buffer.from(
    "zHrJOq4W3UdY1OT1rwQsX/b8Flhvr9jOPD6ZgESFUjdXz3edbBBS6j80OG8WFNTqU7jScKTSrGKy+YoGdMY1FUtwJiEQMwcECKuRGbEUYKDjNpj39kmtJtwKLJ0ePhFEmTwJNrloczVvMCIvhesj4mMBtt9KVJE+U/wIlRsiNmI=",
    "base64"
  ),
}

// Frozen legacy-mode payload holding "legacy mode secret" — created
// before HKDF subkeys, so subkey-mode decryption cannot open it and only
// the fallback chain restores it
const legacyModePayload = {
  salt: Buffer.from("a37vUnBg4yAZpG4IdolQpg==", "base64"),
  iv: Buffer.from("D8s+ukhT/AjqjLiPRwuQPA==", "base64"),
  headers: Buffer.from(
    "/7BkYkD4aIPNMpfK8kaERe/i+Hb2XkNyXMwQQGVR+S/0efMPgYObv3C6dvo/bK5eb6QJqB1lPbvgFzCv4Py+UQ==",
    "base64"
  ),
  data: Buffer.from(
    "yD9ckt3i+XzPglzsqCu1OI18ifQADLEIJrwZLWUnx8UcaaYtOX2hjniVNM9/ACO3rhKjlZ80B+AWNMdOshW7o+BSXE+uRzkcZxhz2Nyn9BS/4GZxQoTadWTUH/zk09CCXAbNk2xp+cckNkFzvzeMEuQHLLLxCXrkat/Q7muTY+A=",
    "base64"
  ),
}

suite("legacyBlock", () => {
  test("decrypts subkey-mode blocks", async () => {
    const message = await decryptLegacyBlock(
      passphrase,
      subkeyPayload.salt,
      subkeyPayload.iv,
      subkeyPayload.headers,
      subkeyPayload.data
    )
    assert.strictEqual(message.toString(), "subkey mode secret")
  })

  test("decrypts legacy-mode blocks through the fallback", async () => {
    // Subkey-mode decryption rejects this payload (pinned at generation),
    // so a successful decrypt proves the legacy-mode fallback ran
    const message = await decryptLegacyBlock(
      passphrase,
      legacyModePayload.salt,
      legacyModePayload.iv,
      legacyModePayload.headers,
      legacyModePayload.data
    )
    assert.strictEqual(message.toString(), "legacy mode secret")
  })

  test("fails to decrypt using wrong passphrase", async () => {
    // Both modes reject at the header scan — a wrong passphrase and an
    // absent secret fail identically
    await assert.rejects(
      decryptLegacyBlock(
        "wrong passphrase entirely",
        subkeyPayload.salt,
        subkeyPayload.iv,
        subkeyPayload.headers,
        subkeyPayload.data
      ),
      { message: "Header not found" }
    )
  })
})
