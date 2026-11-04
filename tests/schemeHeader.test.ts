import assert from "assert"
import { randomBytes } from "crypto"
import { suite, test } from "node:test"

import {
  decodeProbeBlock,
  decodeSchemeHeader,
  encodeProbeBlock,
  encodeSchemeHeader,
  probeBlockLength,
  schemeHeaderLength,
  schemeHeaderMagic,
} from "@/src/utilities/crypto/schemeHeader"

// The header and probe codecs pin the version declaration scheme (see
// docs/technical-documentation/README.md) — the magic and
// layout are frozen forever, and the decoder’s null contract is the
// false-positive gate every version trial leans on: wrong keys, wrong
// profiles and headerless legacy artifacts must all land in the same
// place.

suite("schemeHeader", () => {
  test("freezes magic and length", () => {
    // The magic is version-free and frozen forever — it is how an old app
    // recognizes an artifact from a newer version instead of misreporting
    // a wrong passphrase
    assert.strictEqual(schemeHeaderMagic.toString("hex"), "7362636b")
    assert.strictEqual(schemeHeaderLength, 8)
  })
  test("encodes version 2", () => {
    assert.strictEqual(
      encodeSchemeHeader(2).toString("hex"),
      "7362636b02000000"
    )
  })
  test("round-trips every version", () => {
    for (let version = 1; version <= 255; version++) {
      assert.strictEqual(
        decodeSchemeHeader(encodeSchemeHeader(version)),
        version
      )
    }
  })
  test("fails to encode invalid versions", () => {
    for (const version of [0, 256, -1, 1.5, NaN]) {
      assert.throws(() => encodeSchemeHeader(version), /Invalid scheme version/)
    }
  })
  test("returns null on wrong length", () => {
    assert.strictEqual(decodeSchemeHeader(Buffer.alloc(0)), null)
    assert.strictEqual(decodeSchemeHeader(Buffer.alloc(7)), null)
    assert.strictEqual(decodeSchemeHeader(Buffer.alloc(9)), null)
  })
  test("returns null on wrong magic", () => {
    const header = encodeSchemeHeader(2)
    header.writeUInt8(header.readUInt8(0) ^ 1, 0)
    assert.strictEqual(decodeSchemeHeader(header), null)
  })
  test("returns null on version zero", () => {
    const header = encodeSchemeHeader(2)
    header.writeUInt8(0, 4)
    assert.strictEqual(decodeSchemeHeader(header), null)
  })
  test("returns null on nonzero reserved bytes", () => {
    for (const index of [5, 6, 7]) {
      const header = encodeSchemeHeader(2)
      header.writeUInt8(1, index)
      assert.strictEqual(decodeSchemeHeader(header), null)
    }
  })
  test("returns null on random bytes", () => {
    // A trial decrypt with the wrong key yields uniform bytes — the
    // decoder is the probe's false-positive gate
    assert.strictEqual(
      decodeSchemeHeader(Buffer.from("a1b2c3d4e5f60718", "hex")),
      null
    )
  })

  test("round-trips probe block", () => {
    const probeKey = randomBytes(32)
    const probeBlock = encodeProbeBlock(probeKey, 2)
    assert.strictEqual(probeBlock.length, probeBlockLength)
    assert.strictEqual(decodeProbeBlock(probeKey, probeBlock), 2)
  })

  test("decodes future versions from probe block", () => {
    // An old build must recognize an artifact from a newer one and report
    // it as such instead of misreporting a wrong passphrase
    const probeKey = randomBytes(32)
    assert.strictEqual(
      decodeProbeBlock(probeKey, encodeProbeBlock(probeKey, 3)),
      3
    )
  })

  test("returns null on wrong probe key", () => {
    const probeBlock = encodeProbeBlock(randomBytes(32), 2)
    assert.strictEqual(decodeProbeBlock(randomBytes(32), probeBlock), null)
  })

  test("returns null on tampered probe block", () => {
    const probeKey = randomBytes(32)
    for (let index = 0; index < probeBlockLength; index++) {
      const probeBlock = encodeProbeBlock(probeKey, 2)
      probeBlock.writeUInt8(probeBlock.readUInt8(index) ^ 1, index)
      assert.strictEqual(decodeProbeBlock(probeKey, probeBlock), null)
    }
  })

  test("returns null on headerless bytes", () => {
    // A v1 artifact puts other ciphertext where v2 puts the probe block —
    // uniform bytes no key reveals a header in
    assert.strictEqual(
      decodeProbeBlock(randomBytes(32), randomBytes(probeBlockLength)),
      null
    )
    assert.strictEqual(decodeProbeBlock(randomBytes(32), Buffer.alloc(0)), null)
  })
})
