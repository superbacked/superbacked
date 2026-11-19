import { ValidateTranslationKeys } from "@/src/shared/types/i18n"
import type { YubiKeyErrorCode } from "@/src/utilities/yubikey/otp"

export type YubiKeyErrorMessage = ValidateTranslationKeys<
  | "common.couldNotCommunicateWithYubiKey"
  | "common.noYubiKeyDetected"
  | "common.multipleYubiKeysDetected"
  | "common.yubiKeyConfigurationLocked"
  | "common.yubiKeyOtpInterfaceDisabled"
  | "common.yubiKeyOtpNotSupported"
  | "common.yubiKeyProvisioningRejected"
  | "common.yubiKeySlotNotProvisioned"
  | "common.yubiKeyTouchTimedOut"
  | "common.yubiKeyVerificationFailed"
>

// Codes with a user-facing message in the app — the en locale is the
// single source for these strings, rendered translated by the app and
// verbatim by the command-line interface (see src/cli/utilities/localeText.ts)
export const yubikeyErrorMessageKeys: Record<
  YubiKeyErrorCode,
  YubiKeyErrorMessage
> = {
  communication: "common.couldNotCommunicateWithYubiKey",
  configurationLocked: "common.yubiKeyConfigurationLocked",
  multipleDevices: "common.multipleYubiKeysDetected",
  noDevice: "common.noYubiKeyDetected",
  notProvisioned: "common.yubiKeySlotNotProvisioned",
  otpInterfaceDisabled: "common.yubiKeyOtpInterfaceDisabled",
  otpNotSupported: "common.yubiKeyOtpNotSupported",
  provisioningRejected: "common.yubiKeyProvisioningRejected",
  touchTimeout: "common.yubiKeyTouchTimedOut",
  verificationFailed: "common.yubiKeyVerificationFailed",
}

// User-actionable causes get their own message — low-level failures
// arrive already collapsed into the communication code (see
// asYubiKeyError in src/utilities/yubikey/otp.ts)
export const yubikeyErrorMessage = (
  code: YubiKeyErrorCode
): YubiKeyErrorMessage => {
  return yubikeyErrorMessageKeys[code]
}
