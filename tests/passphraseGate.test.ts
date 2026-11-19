import assert from "assert"
import { suite, test } from "node:test"

import {
  gatePassphrase,
  isPassphraseWeak,
  passphraseTooWeakError,
} from "@/src/cli/utilities/passphraseGate"

// The command-line gate wraps the app’s threshold (pinned by
// tests/zxcvbn.test.ts) — these pins cover the wrapper: the profile it
// prices at, the paths that resolve without prompting and the error the
// non-interactive path reports (see src/cli/utilities/passphraseGate.ts)

const strongPassphrase =
  "trace synopsis retake enlarging liftoff snazzy chastity"
const weakPassphrase = "blast dance visor jog broil"

suite("passphraseGate", () => {
  test("prices the gate at the profile the passphrase stretches under", () => {
    assert.strictEqual(isPassphraseWeak(strongPassphrase, false), false)
    assert.strictEqual(isPassphraseWeak(weakPassphrase, false), true)
    // Paranoid mode buys the same years from weaker passphrases
    assert.strictEqual(isPassphraseWeak(weakPassphrase, true), false)
  })

  test("resolves without prompting when passphrase passes", async () => {
    await gatePassphrase(strongPassphrase, {
      allowWeak: false,
      paranoid: false,
      subject: "Passphrase",
    })
  })

  test("resolves without prompting when override is given", async () => {
    await gatePassphrase(weakPassphrase, {
      allowWeak: true,
      paranoid: false,
      subject: "Master passphrase",
    })
  })

  test("names the override in the non-interactive error", () => {
    assert.strictEqual(
      passphraseTooWeakError("Master passphrase"),
      "Master passphrase too weak (use --allow-weak-passphrase to proceed)"
    )
  })
})
