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
  "common.yubiKeySlotNotProvisioned": en.common.yubiKeySlotNotProvisioned,
  "common.yubiKeyTouchTimedOut": en.common.yubiKeyTouchTimedOut,
}

export const touchYubiKeyText = en.common.touchYubiKey

/**
 * Resolve error into the text a command prints — YubiKey failures resolve
 * from the en locale like the app renders them
 * @param error caught error
 * @param fallback text for non-Error throwables
 * @returns user-facing text
 */
export const errorText = (error: unknown, fallback: string): string => {
  if (error instanceof YubiKeyError) {
    const key = yubikeyErrorMessageKeys[error.code]
    // Codes without an app-side key (provisioningRejected — the app never
    // provisions) carry their only message on the error
    return key === undefined ? error.message : yubikeyErrorText[key]
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}
