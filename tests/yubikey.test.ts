import assert from "assert"
import { suite, test } from "node:test"

import {
  buildEnableOtpConfiguration,
  parseDeviceInfo,
} from "@/src/utilities/yubikey/management"
import {
  buildHmacSha1Configuration,
  calculateCrc,
} from "@/src/utilities/yubikey/otp"

// The configuration layout is frozen against the reference implementation in
// yubikey-manager (yubikit/yubiotp.py, _build_config and
// HmacSha1SlotConfiguration) — a YubiKey rejects or misinterprets any
// deviation
const secret = Buffer.from("000102030405060708090a0b0c0d0e0f10111213", "hex")

suite("yubikey", () => {
  test("freezes CRC-16 implementation", () => {
    // CRC-16/X-25 has check value 0x906e after its final complement — the
    // module keeps the running register, so the standard check input yields
    // the complement
    assert.strictEqual(calculateCrc(Buffer.from("123456789")), 0x6f91)
  })

  test("builds 52-byte configuration", () => {
    assert.strictEqual(buildHmacSha1Configuration(secret, false).length, 52)
  })

  test("splits secret across key and private id fields", () => {
    const configuration = buildHmacSha1Configuration(secret, false)
    assert.deepStrictEqual(
      configuration.subarray(22, 38),
      secret.subarray(0, 16)
    )
    assert.deepStrictEqual(configuration.subarray(16, 20), secret.subarray(16))
  })

  test("leaves fixed data, access code and reserved bytes zero", () => {
    const configuration = buildHmacSha1Configuration(secret, false)
    // Fixed data, private id padding, access code, fixed data length and
    // reserved bytes
    assert.deepStrictEqual(configuration.subarray(0, 16), Buffer.alloc(16))
    assert.deepStrictEqual(configuration.subarray(20, 22), Buffer.alloc(2))
    assert.deepStrictEqual(configuration.subarray(38, 45), Buffer.alloc(7))
    assert.deepStrictEqual(configuration.subarray(48, 50), Buffer.alloc(2))
  })

  test("sets flags", () => {
    const configuration = buildHmacSha1Configuration(secret, false)
    // Serial API visible and allow update
    assert.strictEqual(configuration.readUInt8(45), 0x24)
    // Challenge-response
    assert.strictEqual(configuration.readUInt8(46), 0x40)
    // HMAC challenge-response, challenge shorter than 64 bytes
    assert.strictEqual(configuration.readUInt8(47), 0x26)
  })

  test("sets button trigger flag when touch is required", () => {
    const configuration = buildHmacSha1Configuration(secret, true)
    assert.strictEqual(configuration.readUInt8(47), 0x2e)
  })

  test("stores complemented CRC leaving residual over full structure", () => {
    assert.strictEqual(
      calculateCrc(buildHmacSha1Configuration(secret, false)),
      0xf0b8
    )
  })

  test("fails to build configuration from secret that is not 20 bytes", () => {
    assert.throws(() => buildHmacSha1Configuration(Buffer.alloc(19), false), {
      message: "Secret must be 20 bytes",
    })
    assert.throws(() => buildHmacSha1Configuration(Buffer.alloc(21), false), {
      message: "Secret must be 20 bytes",
    })
  })
})

// The device info layout and write payload are frozen against the reference
// implementation in yubikey-manager (yubikit/management.py, DeviceInfo and
// DeviceConfig.get_bytes)
suite("yubikey management", () => {
  // Length prefix, then TLVs: USB supported (0x033f), USB enabled (0x023e —
  // OTP off), version 5.7.1 and unset configuration lock
  const deviceInfo = Buffer.from("100102033f0302023e05030507010a0100", "hex")

  test("parses device info", () => {
    assert.deepStrictEqual(parseDeviceInfo(deviceInfo), {
      configurationLocked: false,
      firmwareVersion: "5.7.1",
      otpSupported: true,
      usbConfigurable: true,
      usbEnabledFlags: 0x023e,
    })
  })

  test("parses configuration lock and single-byte capability masks", () => {
    // USB supported and enabled on 1 byte (pre-FIDO2 masks), version 4.3.2
    // (interface modes, not per-application configuration), locked
    const info = parseDeviceInfo(
      Buffer.from("0e01013f03013e05030403020a0101", "hex")
    )
    assert.deepStrictEqual(info, {
      configurationLocked: true,
      firmwareVersion: "4.3.2",
      otpSupported: true,
      usbConfigurable: false,
      usbEnabledFlags: 0x3e,
    })
  })

  test("rejects malformed device info", () => {
    // Wrong length prefix
    assert.throws(() => parseDeviceInfo(Buffer.from("ff0102033f", "hex")), {
      message: "Malformed device info",
    })
    // TLV overruns the structure
    assert.throws(() => parseDeviceInfo(Buffer.from("030110ff", "hex")), {
      message: "Malformed device info",
    })
    // Missing version
    assert.throws(() => parseDeviceInfo(Buffer.from("040102033f", "hex")), {
      message: "Malformed device info",
    })
  })

  test("builds length-prefixed configuration enabling OTP with reboot", () => {
    assert.deepStrictEqual(
      buildEnableOtpConfiguration(0x023e),
      Buffer.from("060c000302023f", "hex")
    )
  })

  test("preserves already enabled applications", () => {
    assert.deepStrictEqual(
      buildEnableOtpConfiguration(0x023f),
      Buffer.from("060c000302023f", "hex")
    )
  })
})
