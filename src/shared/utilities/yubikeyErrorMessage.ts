import { ValidateTranslationKeys } from "@/src/shared/types/i18n"
import type { YubiKeyErrorCode } from "@/src/utilities/yubikey"

export type YubiKeyErrorMessage = ValidateTranslationKeys<
  | "common.couldNotCommunicateWithYubiKey"
  | "common.noYubiKeyDetected"
  | "common.multipleYubiKeysDetected"
  | "common.yubiKeySlotNotProvisioned"
  | "common.yubiKeyTouchTimedOut"
>

// Codes with a user-facing message in the app — the en locale is the
// single source for these strings, rendered translated by the app and
// verbatim by the command-line interface (see src/cli/localeText.ts).
// provisioningRejected is absent, as the app never provisions — the
// command-line interface falls back to the message carried by the error.
export const yubikeyErrorMessageKeys: Partial<
  Record<YubiKeyErrorCode, YubiKeyErrorMessage>
> = {
  communication: "common.couldNotCommunicateWithYubiKey",
  multipleDevices: "common.multipleYubiKeysDetected",
  noDevice: "common.noYubiKeyDetected",
  notProvisioned: "common.yubiKeySlotNotProvisioned",
  touchTimeout: "common.yubiKeyTouchTimedOut",
}

// User-actionable causes get their own message — low-level communication
// failures and unmapped codes fall back to the generic one
export const yubikeyErrorMessage = (
  code: YubiKeyErrorCode
): YubiKeyErrorMessage => {
  return (
    yubikeyErrorMessageKeys[code] ?? "common.couldNotCommunicateWithYubiKey"
  )
}
