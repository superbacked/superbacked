import assert from "assert"
import { suite, test } from "node:test"

import {
  parseYubiKeySecret,
  yubikeyLabel,
} from "@/src/handlers/yubikeyProvisioning"

// The pure parts of slot provisioning shared by the app and the
// command-line interface (see src/handlers/yubikeyProvisioning.ts) —
// the hardware path is exercised by hand

suite("yubikeyProvisioning", () => {
  test("parses spaced and uppercase hex secrets", () => {
    const secret = "8d66618b105e51cbf0412f8a29368e71d4bb27b5"
    assert.deepStrictEqual(
      parseYubiKeySecret(secret),
      Buffer.from(secret, "hex")
    )
    assert.deepStrictEqual(
      parseYubiKeySecret("8D66 618B 105E 51CB F041 2F8A 2936 8E71 D4BB 27B5\n"),
      Buffer.from(secret, "hex")
    )
  })

  test("fails to parse secrets that are not 20 bytes of hex", () => {
    for (const value of [
      "",
      "8d66618b",
      "8d66618b105e51cbf0412f8a29368e71d4bb27b",
      "zz66618b105e51cbf0412f8a29368e71d4bb27b5",
    ]) {
      assert.throws(() => parseYubiKeySecret(value), {
        message: "Secret must be 40 hexadecimal characters (20 bytes)",
      })
    }
  })

  test("labels backups with the product name and serial number", () => {
    const info = {
      configurationLocked: false,
      fips: false,
      firmwareVersion: "5.7.1",
      nfcSupported: true,
      otpSupported: true,
      serialNumber: 12345678,
      usbConfigurable: true,
      usbEnabledFlags: 0,
    }
    assert.strictEqual(
      yubikeyLabel({ ...info, formFactor: "usbAKeychain" }),
      "yubikey-5-nfc-12345678"
    )
    assert.strictEqual(
      yubikeyLabel({ ...info, formFactor: "usbCKeychain" }),
      "yubikey-5c-nfc-12345678"
    )
    assert.strictEqual(
      yubikeyLabel({
        ...info,
        formFactor: "usbCKeychain",
        nfcSupported: false,
      }),
      "yubikey-5c-12345678"
    )
    assert.strictEqual(
      yubikeyLabel({ ...info, formFactor: "usbCNano", nfcSupported: false }),
      "yubikey-5c-nano-12345678"
    )
    assert.strictEqual(
      yubikeyLabel({
        ...info,
        formFactor: "usbCLightning",
        nfcSupported: false,
      }),
      "yubikey-5ci-12345678"
    )
    assert.strictEqual(
      yubikeyLabel({ ...info, formFactor: "usbAKeychain", fips: true }),
      "yubikey-5-nfc-fips-12345678"
    )
    // Unknown form factor and missing serial keep what is known
    assert.strictEqual(
      yubikeyLabel({ ...info, formFactor: null, serialNumber: null }),
      "yubikey-5"
    )
  })
})
