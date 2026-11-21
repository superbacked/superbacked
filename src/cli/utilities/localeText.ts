import { createInstance } from "i18next"

import { interpolation, resources } from "@/src/shared/i18n"
import { TranslationKey } from "@/src/shared/types/i18n"
import { yubikeyErrorMessageKeys } from "@/src/shared/utilities/yubikeyErrorMessage"
import { YubiKeyError } from "@/src/utilities/yubikey/otp"

// The command-line interface is English-only by design (guides pin
// verbatim transcripts), but strings the app also renders resolve from the
// same resources (see src/shared/i18n.ts) so the two surfaces cannot drift.
// A dedicated i18next instance knowing only English keeps the language the
// app follows (see src/i18n.ts) from ever changing a transcript —
// initialized synchronously (inline resources need no loading), so
// commands and tests need no bootstrap
const i18n = createInstance()
void i18n.init({
  initAsync: false,
  interpolation: interpolation,
  lng: "en",
  resources: { en: resources.en },
})

/**
 * Resolve a locale string for the terminal — Trans markup is stripped, as
 * the line is styled as a whole and links stay in the guides (the explicit
 * tag list keeps an unknown tag visible rather than silently dropped)
 * @param key translation key the app renders
 * @param values interpolation values
 * @returns plain text
 */
export const localeText = (
  key: TranslationKey,
  values: Record<string, number | string> = {}
): string => {
  return i18n.t(key, values).replace(/<\/?(anchor|bold)>/g, "")
}

/**
 * Resolve error into the text a command prints — YubiKey failures resolve
 * from the locale like the app renders them
 * @param error caught error
 * @param fallback text for non-Error throwables
 * @returns user-facing text
 */
export const errorText = (error: unknown, fallback: string): string => {
  if (error instanceof YubiKeyError) {
    return localeText(yubikeyErrorMessageKeys[error.code])
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}
