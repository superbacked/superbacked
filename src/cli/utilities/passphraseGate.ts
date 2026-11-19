import confirmYes from "@/src/cli/utilities/confirmYes"
import {
  useWeakPassphraseText,
  weakPassphraseAllowedText,
  weakPassphraseWarningText,
} from "@/src/cli/utilities/localeText"
import { red } from "@/src/cli/utilities/style"
import {
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/kdfProfiles"
import zxcvbn, {
  minimumPassphraseStrength,
} from "@/src/shared/utilities/zxcvbn"

// The strength gate every command accepting a new passphrase applies —
// the same threshold as the app, priced at the profile the passphrase
// will stretch under, and the same override: a weak passphrase is
// refused unless explicitly allowed when prompted or using the
// --allow-weak-passphrase flag (which skips the prompt but not the notice).
// Restoration is never gated (see
// docs/technical-documentation/passphrase-strength.md)

export type PassphraseSubject = "Master passphrase" | "Passphrase"

/**
 * Whether the gate refuses passphrase without an override
 * @param passphrase new passphrase
 * @param paranoid whether the passphrase stretches at the paranoid profile
 * @returns true when strength falls below the gate
 */
export const isPassphraseWeak = (
  passphrase: string,
  paranoid: boolean
): boolean => {
  return (
    zxcvbn(
      passphrase,
      paranoid === true ? paranoidKdfProfile : standardKdfProfile
    ).strength < minimumPassphraseStrength
  )
}

/**
 * Error the gate reports when the override cannot be prompted for
 * @param subject noun the command uses for the passphrase
 * @returns error text
 */
export const passphraseTooWeakError = (subject: PassphraseSubject): string => {
  return `${subject} too weak (use --allow-weak-passphrase to proceed)`
}

/**
 * Apply the strength gate — resolves when the passphrase passes or the
 * override applies, throws otherwise (CancelledError when the disclaimer
 * is declined)
 * @param passphrase new passphrase
 * @param options allowWeak skips the disclaimer; paranoid selects the
 * profile; subject is the noun the command uses for the passphrase
 */
export const gatePassphrase = async (
  passphrase: string,
  options: {
    allowWeak: boolean
    paranoid: boolean
    subject: PassphraseSubject
  }
): Promise<void> => {
  if (isPassphraseWeak(passphrase, options.paranoid) === false) {
    return
  }
  if (options.allowWeak === false) {
    // The disclaimer reads from the controlling terminal like the wallet
    // warning — without one the gate refuses, so scripts cannot hang and
    // must state the override explicitly
    await confirmYes(
      `${red(weakPassphraseWarningText)}\n${useWeakPassphraseText} (yes or no)? `,
      passphraseTooWeakError(options.subject)
    )
  }
  // The override is never silent — the notice mirrors the app’s error
  console.error(red(weakPassphraseAllowedText))
}
