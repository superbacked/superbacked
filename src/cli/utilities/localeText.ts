import en from "@/src/locales/en.json"
import {
  YubiKeyErrorMessage,
  yubikeyErrorMessageKeys,
} from "@/src/shared/utilities/yubikeyErrorMessage"
import { YubiKeyError } from "@/src/utilities/yubikey/otp"

// The command-line interface is English-only by design (guides pin
// verbatim transcripts), but strings the app also renders resolve from the
// en locale so the two surfaces cannot drift.

// Exhaustive over YubiKeyErrorMessage — adding a code to the app mapping
// without wiring its en string here is a compile error, and renaming a
// locale key breaks the property access
const yubikeyErrorText: Record<YubiKeyErrorMessage, string> = {
  "common.couldNotCommunicateWithYubiKey":
    en.common.couldNotCommunicateWithYubiKey,
  "common.multipleYubiKeysDetected": en.common.multipleYubiKeysDetected,
  "common.noYubiKeyDetected": en.common.noYubiKeyDetected,
  "common.yubiKeyConfigurationLocked": en.common.yubiKeyConfigurationLocked,
  "common.yubiKeyOtpInterfaceDisabled": en.common.yubiKeyOtpInterfaceDisabled,
  "common.yubiKeyOtpNotSupported": en.common.yubiKeyOtpNotSupported,
  "common.yubiKeyProvisioningRejected": en.common.yubiKeyProvisioningRejected,
  "common.yubiKeySlotNotProvisioned": en.common.yubiKeySlotNotProvisioned,
  "common.yubiKeyTouchTimedOut": en.common.yubiKeyTouchTimedOut,
  "common.yubiKeyVerificationFailed": en.common.yubiKeyVerificationFailed,
}

export const touchYubiKeyText = en.common.touchYubiKey

// The weak passphrase disclaimer and the allowed notice print the words
// the app renders (see src/main/components/WeakPassphraseDisclaimerModal.tsx
// and src/main/components/PassphraseInputWithStrength.tsx)
export const useWeakPassphraseText =
  en.components.weakPassphraseDisclaimerModal.useWeakPassphrase
export const weakPassphraseWarningText =
  en.components.weakPassphraseDisclaimerModal.weakPassphraseWarning
export const weakPassphraseAllowedText =
  en.components.passphraseInputWithStrength.weakPassphraseAllowed

/**
 * Resolve error into the text a command prints — YubiKey failures resolve
 * from the en locale like the app renders them
 * @param error caught error
 * @param fallback text for non-Error throwables
 * @returns user-facing text
 */
export const errorText = (error: unknown, fallback: string): string => {
  if (error instanceof YubiKeyError) {
    return yubikeyErrorText[yubikeyErrorMessageKeys[error.code]]
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}
