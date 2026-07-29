import { InvalidArgumentError, program as cli } from "commander"

import confirmYes from "@/src/cli/confirmYes"
import { errorText, touchYubiKeyText } from "@/src/cli/localeText"
import readPassphrase, {
  promptVisible,
  waitForEnter,
} from "@/src/cli/readPassphrase"
import { red } from "@/src/cli/style"
import {
  v2ParanoidKdfProfile,
  v2StandardKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"
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
  MnemonicWords,
  computeDerivedBitcoinWallet,
  deriveAddresses,
  deriveExtendedPrivateKey,
} from "@/src/utilities/crypto/derivedBitcoinWallet"
import { derivedSchemeVersion } from "@/src/utilities/crypto/derivedKey"
import { timingSafeEqualStrings } from "@/src/utilities/crypto/primitives"
import { Slot } from "@/src/utilities/yubikey/otp"

// Command action (the CLI surface is declared in index.ts). Public by
// default, secret by request: the extended public key (and addresses,
// when asked) print to stdout, while the mnemonic or extended private
// key materialize only under --reveal — copied to the clipboard, keeping
// them out of terminal scrollback

// Parse-time option validation — invalid values must fail before any
// prompting or YubiKey interaction
export const parseDerivationPath = (value: string): string => {
  if (/^m(\/[0-9]+'?)+$/.test(value) !== true) {
    throw new InvalidArgumentError(
      "Derivation path must look like m/84'/0'/0'."
    )
  }
  return value
}

export const parseAddresses = (value: string): number => {
  const count = Number(value)
  if (Number.isInteger(count) === false || count < 1 || count > 100) {
    throw new InvalidArgumentError(
      "Addresses must be an integer between 1 and 100."
    )
  }
  return count
}

export const deriveBitcoinWalletAction = async (
  label: string | undefined,
  options: {
    addresses?: number
    clear: number
    confirm?: boolean
    // Determinism inputs on par with the label — a different path or
    // word count derives a different wallet, which is why every
    // derivation echoes them (see
    // src/utilities/crypto/derivedBitcoinWallet.ts)
    derivationPath: string
    // See src/cli/derivedPassword.ts — only scheme v1 exists; the option
    // gates and documents rather than branches
    derivationVersion: string
    print?: boolean
    reveal?: "mnemonic" | "zprv"
    slot: "1" | "2"
    words: string
    yubikey: boolean
  }
): Promise<void> => {
  try {
    if (options.print === true && options.reveal === undefined) {
      // The public outputs already print — --print only selects how a
      // revealed secret is delivered
      throw new Error("The --print option requires --reveal")
    }
    // A derived wallet trades hardware isolation for determinism — the
    // derivation host sees the wallet, and a forgotten passphrase, label
    // or flag is unrecoverable — so the warning gates every derivation
    await confirmYes(
      red(
        "Derived Bitcoin wallets should only be used for amounts you are willing to lose.\n" +
          "For larger amounts, use a signing device such as a COLDCARD or Trezor."
      ) + "\nDo you wish to continue (yes or no)? ",
      "Deriving a Bitcoin wallet requires interactive confirmation"
    )
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
    // Confirmation catches typos when creating a wallet — a mistyped
    // passphrase silently derives a different mnemonic
    const masterPassphrase = await readPassphrase(options.confirm === true)
    if (masterPassphrase === "") {
      throw new Error("Passphrase required")
    }
    // Derivation is stateless, so the mode is part of what the user must
    // know — deriving without it silently produces a different wallet,
    // which is why every derivation echoes it below
    const paranoid = cli.opts().paranoid === true
    // Matches the app’s passphrase gates, priced at the profile the
    // derivation stretches under (see src/cli/derivedPassword.ts) — and
    // here the passphrase guards funds, not a rotatable password
    if (
      zxcvbn(
        masterPassphrase,
        paranoid === true ? v2ParanoidKdfProfile : v2StandardKdfProfile
      ).strength < minimumPassphraseStrength
    ) {
      throw new Error("Master passphrase too weak")
    }
    const words = Number(options.words) as MnemonicWords
    const { extendedPublicKey, mnemonic } = await computeDerivedBitcoinWallet(
      masterPassphrase,
      resolvedLabel,
      {
        derivationPath: options.derivationPath,
        paranoid: paranoid,
        words: words,
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
    // A wrong version, mode, path or word count at a future derivation
    // would silently produce a different wallet, so every derivation
    // states them all
    console.error(
      `Derived with scheme v${derivedSchemeVersion}${
        paranoid === true ? " (paranoid)" : ""
      }, path ${options.derivationPath}, ${words} words`
    )
    const revealPrinted = options.reveal !== undefined && options.print === true
    // The extended public key is the primary output — except when a
    // revealed secret is printed, which takes stdout so piping stays
    // single-purpose
    if (revealPrinted === true) {
      console.error(`Extended public key: ${extendedPublicKey}`)
    } else {
      process.stdout.write(`${extendedPublicKey}\n`)
    }
    if (options.addresses !== undefined) {
      const addresses = deriveAddresses(
        mnemonic,
        options.derivationPath,
        options.addresses
      )
      for (const [index, address] of addresses.entries()) {
        const line = `${options.derivationPath}/0/${index} ${address}\n`
        if (revealPrinted === true) {
          process.stderr.write(line)
        } else {
          process.stdout.write(line)
        }
      }
    }
    if (options.reveal !== undefined) {
      const secretName =
        options.reveal === "mnemonic" ? "Mnemonic" : "Extended private key"
      const secret =
        options.reveal === "mnemonic"
          ? mnemonic
          : deriveExtendedPrivateKey(mnemonic, options.derivationPath)
      if (options.print === true) {
        process.stdout.write(`${secret}\n`)
      } else {
        // The guard precedes the copy so no window exists where death
        // leaves the secret on the clipboard unguarded
        const releaseClearGuard = spawnClearGuard()
        await copyText(secret)
        process.stderr.write(
          `${secretName} copied to clipboard, clearing in ${
            options.clear
          } second${options.clear === 1 ? "" : "s"}…`
        )
        const enterPressed = await waitForEnter(options.clear * 1000)
        // Enter echoes its own newline in canonical mode — only the
        // timeout path needs to terminate the status line
        if (enterPressed === false) {
          process.stderr.write("\n")
        }
        // Leave the clipboard alone if the user copied something else
        // meanwhile
        if (timingSafeEqualStrings(await readText(), secret) === true) {
          await clearText()
        }
        releaseClearGuard()
      }
    }
    process.exit(0)
  } catch (error) {
    console.error(red(errorText(error, "Could not derive Bitcoin wallet")))
    process.exit(1)
  }
}
