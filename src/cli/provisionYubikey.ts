import { program as cli } from "commander"

import confirmYes, { CancelledError } from "@/src/cli/utilities/confirmYes"
import { errorText, touchYubiKeyText } from "@/src/cli/utilities/localeText"
import { promptHidden } from "@/src/cli/utilities/readPassphrase"
import { bold, red } from "@/src/cli/utilities/style"
import {
  YubiKeyProvisioningFailure,
  canEnableYubiKeyOtp,
  enableYubiKeyOtpInterface,
  getYubiKeyStatus,
  parseYubiKeySecret,
  provisionYubiKey,
} from "@/src/handlers/yubikeyProvisioning"
import { timingSafeEqualStrings } from "@/src/utilities/crypto/primitives"
import { isSuperbackedOs } from "@/src/utilities/superbackedOs"
import { Slot, Status, YubiKeyError } from "@/src/utilities/yubikey/otp"

// Command action (the CLI surface is declared in index.ts). Calls the same
// handlers as the app’s provisioning route, confirming the irreversible
// steps on the terminal — the handlers program the slot and verify the
// write end to end.

// YubiKey failures travel through handler results as codes — rethrown as
// YubiKeyError so errorText resolves them like directly-thrown ones
const resultError = (result: YubiKeyProvisioningFailure): Error => {
  if (result.yubikeyErrorCode === undefined) {
    return new Error(result.error)
  }
  return new YubiKeyError(result.yubikeyErrorCode, result.error)
}

// When stdin is piped, the whole of stdin is the secret — interactively,
// prompts twice with input hidden, as a typo would silently program a secret
// that no other YubiKey shares
const readSecret = async (): Promise<string> => {
  if (process.stdin.isTTY !== true) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    return parseYubiKeySecret(Buffer.concat(chunks).toString("utf8")).toString(
      "hex"
    )
  }
  const secret = await promptHidden(
    "Challenge-response secret (40-character hex): "
  )
  const confirmation = await promptHidden("Confirm challenge-response secret: ")
  if (timingSafeEqualStrings(secret, confirmation) === false) {
    throw new Error("Challenge-response secrets do not match")
  }
  return parseYubiKeySecret(secret).toString("hex")
}

// Detection may report the OTP interface disabled. Rather than sending
// the user to another tool, the command offers to enable it in place. The
// handler first checks whether that is possible — the Bio and Security
// Key series lack the application, a locked configuration forbids the
// write and pre-5 firmware cannot switch applications on — and when it is
// not, the command reports why instead of asking
const enableOtpInterface = async (): Promise<Status> => {
  const probe = await canEnableYubiKeyOtp()
  if (probe.success === false) {
    throw resultError(probe)
  }
  await confirmYes(
    bold("YubiKey detected but OTP interface is disabled.") +
      "\nDo you wish to enable the OTP interface (yes or no)? ",
    "Enabling the OTP interface requires interactive confirmation"
  )
  console.error("OTP interface enabled — waiting for YubiKey to restart…")
  const result = await enableYubiKeyOtpInterface()
  if (result.success === false) {
    throw resultError(result)
  }
  return result.status
}

export const provisionYubikeyAction = async (options: {
  generate?: boolean
  slot: "1" | "2"
  touch: boolean
}): Promise<void> => {
  // Provisioning derives nothing, so the root flag has no effect here —
  // refuse it rather than discard it silently (see the root action in
  // src/index.ts)
  if (cli.opts().paranoid === true) {
    console.error("Error: Unknown option: --paranoid")
    process.exit(1)
  }
  try {
    const slot: Slot = options.slot === "1" ? 1 : 2
    if (isSuperbackedOs() === false) {
      // Provisioning is the only moment the secret exists in plaintext on
      // the host — recommend the air-gapped, amnesic environment
      await confirmYes(
        red(
          "Provisioning YubiKey exposes challenge-response secret to this computer.\n" +
            "For high-stakes secrets, provision YubiKey using Superbacked OS (https://superbacked.com/superbacked-os)."
        ) + "\nDo you wish to continue (yes or no)? ",
        "Provisioning a YubiKey on this computer requires interactive confirmation"
      )
    }
    let status: Status
    const statusResult = await getYubiKeyStatus()
    if (statusResult.success === true) {
      status = statusResult.status
    } else if (statusResult.yubikeyErrorCode === "otpInterfaceDisabled") {
      status = await enableOtpInterface()
    } else {
      throw resultError(statusResult)
    }
    console.error("YubiKey detected")
    const provisioned =
      slot === 1 ? status.slot1Provisioned : status.slot2Provisioned
    if (provisioned === true) {
      await confirmYes(
        red(
          `Slot ${slot} is already programmed — overwriting it permanently destroys the current secret.`
        ) + `\nDo you wish to overwrite slot ${slot} (yes or no)? `,
        `Slot ${slot} is already programmed (overwriting requires interactive confirmation)`
      )
    }
    const secret = options.generate === true ? null : await readSecret()
    if (options.generate === true) {
      // Acknowledged before the slot is written — declining after the write
      // would strand a provisioned slot whose secret was never displayed.
      // Red like the app’s result step: ignoring it means permanent loss
      await confirmYes(
        red(
          "The generated challenge-response secret is displayed once and cannot be read back from the YubiKey.\n" +
            "Use a block that is not YubiKey-protected to back up the secret or provision another YubiKey with the same secret — without either, everything relying on that secret is unrecoverable if the YubiKey is lost or broken."
        ) + "\nDo you wish to continue (yes or no)? ",
        "Provisioning with a generated challenge-response secret requires interactive confirmation"
      )
    }
    const result = await provisionYubiKey(
      slot,
      secret,
      options.touch === true,
      () => {
        console.error(touchYubiKeyText)
      }
    )
    if (result.success === false) {
      throw resultError(result)
    }
    console.error(`Slot ${slot} provisioned for challenge-response`)
    if (options.generate === true) {
      // The generated secret is required to program backup YubiKeys — the
      // label goes to stderr so piped stdout carries only the secret, and
      // only when the secret lands on the terminal beside it
      if (process.stdout.isTTY === true) {
        process.stderr.write("Challenge-response secret: ")
      }
      process.stdout.write(`${result.secret}\n`)
    }
    process.exit(0)
  } catch (error) {
    if (error instanceof CancelledError) {
      console.error(error.message)
    } else {
      console.error(red(errorText(error, "Could not provision YubiKey")))
    }
    process.exit(1)
  }
}
