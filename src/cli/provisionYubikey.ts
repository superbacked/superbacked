import { randomBytes } from "crypto"

import confirmYes from "@/src/cli/utilities/confirmYes"
import { errorText, touchYubiKeyText } from "@/src/cli/utilities/localeText"
import { promptHidden } from "@/src/cli/utilities/readPassphrase"
import { bold, red } from "@/src/cli/utilities/style"
import { timingSafeEqualStrings } from "@/src/utilities/crypto/primitives"
import { isSuperbackedOs } from "@/src/utilities/superbackedOs"
import {
  Slot,
  getStatus,
  provisionHmacSha1,
  verifyHmacSha1,
} from "@/src/utilities/yubikey/otp"

// Command action (the CLI surface is declared in index.ts). Provisions a
// slot for HMAC-SHA1 challenge-response and verifies the write end to end by
// challenging the slot and recomputing the response locally.

const secretSize = 20

// Whitespace is stripped so spaced hex (as displayed by some Yubico tools)
// pastes cleanly
const parseSecret = (value: string): Buffer => {
  const normalized = value.replace(/\s+/g, "").toLowerCase()
  if (/^[0-9a-f]{40}$/.test(normalized) === false) {
    throw new Error(
      `Secret must be ${secretSize * 2} hexadecimal characters (${secretSize} bytes)`
    )
  }
  return Buffer.from(normalized, "hex")
}

// When stdin is piped, the whole of stdin is the secret — interactively,
// prompts twice with input hidden, as a typo would silently program a secret
// that no other YubiKey shares
const readSecret = async (): Promise<Buffer> => {
  if (process.stdin.isTTY !== true) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    return parseSecret(Buffer.concat(chunks).toString("utf8"))
  }
  const secret = await promptHidden("Secret (40-character hex): ")
  const confirmation = await promptHidden("Confirm secret: ")
  if (timingSafeEqualStrings(secret, confirmation) === false) {
    throw new Error("Secrets do not match")
  }
  return parseSecret(secret)
}

export const provisionYubikeyAction = async (options: {
  generate?: boolean
  slot: "1" | "2"
  touch: boolean
}): Promise<void> => {
  try {
    const slot: Slot = options.slot === "1" ? 1 : 2
    if (isSuperbackedOs() === false) {
      // Provisioning is the only moment the secret exists in plaintext on
      // the host — recommend the air-gapped, amnesic environment
      await confirmYes(
        red(
          "Provisioning a YubiKey exposes a long-lived secret to the computer running the command.\n" +
            "We recommend using Superbacked OS when provisioning YubiKey hardware."
        ) + "\nDo you wish to continue (yes or no)? ",
        "Provisioning a YubiKey on this computer requires interactive confirmation"
      )
    }
    const status = await getStatus()
    console.error(`YubiKey detected (firmware ${status.firmwareVersion})`)
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
    const secret =
      options.generate === true ? randomBytes(secretSize) : await readSecret()
    if (options.generate === true) {
      // Acknowledged before the slot is written — declining after the write
      // would strand a provisioned slot whose secret was never displayed
      await confirmYes(
        bold(
          "The generated secret will be displayed only once and cannot be recovered from the YubiKey.\n" +
            "Please be ready to back it up using a Superbacked block or blockset secured with a passphrase that does not depend on this YubiKey."
        ) + "\nDo you wish to continue (yes or no)? ",
        "Provisioning with a generated secret requires interactive confirmation"
      )
    }
    await provisionHmacSha1(slot, secret, options.touch === true)
    // Challenge the freshly programmed slot and recompute the response
    // locally — proves the write end to end, not just the status update
    const verified = await verifyHmacSha1(slot, secret, () => {
      console.error(touchYubiKeyText)
    })
    if (verified === false) {
      throw new Error(
        "Verification failed (slot response does not match secret)"
      )
    }
    console.error(`Slot ${slot} provisioned for HMAC-SHA1 challenge-response`)
    if (options.generate === true) {
      // The generated secret is required to program backup YubiKeys — the
      // label goes to stderr so piped stdout carries only the secret, and
      // only when the secret lands on the terminal beside it
      if (process.stdout.isTTY === true) {
        process.stderr.write("Secret: ")
      }
      process.stdout.write(`${secret.toString("hex")}\n`)
    }
    process.exit(0)
  } catch (error) {
    console.error(red(errorText(error, "Could not provision YubiKey")))
    process.exit(1)
  }
}
