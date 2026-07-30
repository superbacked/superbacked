import assert from "assert"
import { suite, test } from "node:test"

import { standardKdfProfile } from "@/src/shared/utilities/kdfProfiles"
import {
  decodeBlocksetShare,
  encodeBlocksetShare,
  encryptBlockset,
  schemeVersion,
} from "@/src/utilities/core/blockset"
import { UnsupportedVersionError } from "@/src/utilities/crypto/schemeHeader"

// The blockset composition — version declaration, share codec and
// creation guards. Scheme law is enforced at creation before any share
// generation or key derivation, so rejection costs nothing. The full
// split → seal → accumulate → combine flow runs in
// tests/pipeline.test.ts (Argon2 makes it a pipeline-tier cost), and
// the published reference blockset pins the composition against real
// shipped artifacts (see tests/referenceBlocks.test.ts).

suite("blockset", () => {
  test("freezes scheme version", () => {
    // Version 1 is the legacy prefix convention, which never wrote the
    // byte (see src/utilities/core/legacy/blockset.ts)
    assert.strictEqual(schemeVersion, 2)
  })

  test("round-trips share message", () => {
    const share = Buffer.alloc(50, 0xff)
    const message = encodeBlocksetShare(share)
    assert.strictEqual(message.length, share.length + 1)
    assert.strictEqual(message.at(0), schemeVersion)
    assert.deepStrictEqual(decodeBlocksetShare(message), share)
  })

  test("fails to decode shares from a newer version", () => {
    // The domain key already authenticated, so an unknown version must
    // report as such — never as a wrong passphrase
    const message = encodeBlocksetShare(Buffer.alloc(50, 0xff))
    message.writeUInt8(3, 0)
    assert.throws(() => decodeBlocksetShare(message), UnsupportedVersionError)
    assert.throws(() => decodeBlocksetShare(Buffer.alloc(0)), {
      message: "Share not found",
    })
  })

  test("fails to create blocksets protected by YubiKey", async () => {
    // A blockset’s shares are meant to restore on any machine holding
    // enough blocks — a hardware binding would defeat that property
    await assert.rejects(
      encryptBlockset(
        [{ message: "secret", passphrase: "passphrase", slot: 2 }],
        3,
        2,
        standardKdfProfile
      ),
      { message: "YubiKey protection is not supported for blocksets" }
    )
  })

  test("fails to create blocksets using invalid thresholds", async () => {
    await assert.rejects(
      encryptBlockset(
        [{ message: "secret", passphrase: "passphrase" }],
        2,
        3,
        standardKdfProfile
      ),
      { message: "Invalid number of shares or threshold" }
    )
    await assert.rejects(
      encryptBlockset(
        [{ message: "secret", passphrase: "passphrase" }],
        3,
        // @ts-expect-error missing threshold — create() forwards runtime
        // input, so the guard backs the types
        undefined,
        standardKdfProfile
      ),
      { message: "Invalid number of shares or threshold" }
    )
  })
})
