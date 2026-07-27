import { InvalidArgumentError } from "commander"

import { errorText, touchYubiKeyText } from "@/src/cli/localeText"
import readPassphrase, {
  promptVisible,
  waitForEnter,
} from "@/src/cli/readPassphrase"
import zxcvbn, {
  minimumPassphraseStrength,
} from "@/src/shared/utilities/zxcvbn"
import {
  clearText,
  copyText,
  readText,
  spawnClearGuard,
} from "@/src/utilities/clipboard"
import {
  computeDerivedPassword,
  maximumPasswordLength,
  minimumPasswordLength,
} from "@/src/utilities/crypto/derivedPassword"
import { timingSafeEqualStrings } from "@/src/utilities/crypto/primitives"
import { Slot } from "@/src/utilities/yubikey/otp"

// Command action (the CLI surface is declared in index.ts). The password is
// copied to the clipboard by default, keeping it out of terminal scrollback.

// Parse-time option validation — invalid values must fail before any
// prompting or YubiKey interaction
export const parseLength = (value: string): number => {
  const length = Number(value)
  if (
    Number.isInteger(length) === false ||
    length < minimumPasswordLength ||
    length > maximumPasswordLength
  ) {
    throw new InvalidArgumentError(
      `Length must be an integer between ${minimumPasswordLength} and ${maximumPasswordLength}.`
    )
  }
  return length
}

export const parseClear = (value: string): number => {
  const seconds = Number(value)
  if (Number.isInteger(seconds) === false || seconds < 1) {
    throw new InvalidArgumentError("Clear seconds must be a positive integer.")
  }
  return seconds
}

export const derivePasswordAction = async (
  label: string | undefined,
  options: {
    clear: number
    confirm?: boolean
    length: number
    print?: boolean
    slot: "1" | "2"
    yubikey: boolean
  }
): Promise<void> => {
  try {
    // Prompting keeps labels out of shell history and process listings —
    // when the passphrase is piped, the prompt reads from the controlling
    // terminal, so the argument is only required fully non-interactively
    let resolvedLabel = label
    if (resolvedLabel === undefined) {
      try {
        resolvedLabel = (await promptVisible("Label: ")).trim()
      } catch {
        // No controlling terminal — fall through to the label requirement
      }
    }
    if (resolvedLabel === undefined || resolvedLabel === "") {
      throw new Error("Label required")
    }
    const slot: Slot | undefined =
      options.yubikey === false ? undefined : options.slot === "1" ? 1 : 2
    // Confirmation catches typos when creating a password — a mistyped
    // passphrase silently derives a different password
    const masterPassphrase = await readPassphrase(options.confirm === true)
    if (masterPassphrase === "") {
      throw new Error("Passphrase required")
    }
    // Matches the app’s passphrase gates, enforced since scheme v1 so
    // every passphrase that ever derived a password passed it — derivation
    // is deterministic and stateless, so the threshold can never rise
    // without stranding established passphrases
    if (zxcvbn(masterPassphrase).strength < minimumPassphraseStrength) {
      throw new Error("Master passphrase too weak")
    }
    const password = await computeDerivedPassword(
      masterPassphrase,
      resolvedLabel,
      {
        length: options.length,
        yubikey:
          slot === undefined
            ? undefined
            : {
                onTouchRequired: () => {
                  console.error(touchYubiKeyText)
                },
                slot: slot,
              },
      }
    )
    if (options.print === true) {
      process.stdout.write(`${password}\n`)
    } else {
      // The guard precedes the copy so no window exists where death leaves
      // the password on the clipboard unguarded
      const releaseClearGuard = spawnClearGuard()
      await copyText(password)
      process.stderr.write(
        `Password copied to clipboard, clearing in ${options.clear} second${
          options.clear === 1 ? "" : "s"
        }…`
      )
      const enterPressed = await waitForEnter(options.clear * 1000)
      // Enter echoes its own newline in canonical mode — only the timeout
      // path needs to terminate the status line
      if (enterPressed === false) {
        process.stderr.write("\n")
      }
      // Leave the clipboard alone if the user copied something else meanwhile
      if (timingSafeEqualStrings(await readText(), password) === true) {
        await clearText()
      }
      releaseClearGuard()
    }
    process.exit(0)
  } catch (error) {
    console.error(errorText(error, "Could not derive password"))
    process.exit(1)
  }
}
