import { t } from "i18next"

import { TranslationKey } from "@/src/shared/types/i18n"
import { yubikeyErrorMessageKeys } from "@/src/shared/utilities/yubikeyErrorMessage"
import { YubiKeyError } from "@/src/utilities/yubikey/otp"

// The command-line interface is English-only by design (guides pin
// verbatim transcripts), but strings the app also renders resolve through
// i18next (initialized by src/i18n.ts before any command parses) so the two
// surfaces cannot drift — pinned to the en locale so the system language
// never changes a transcript

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
  return t(key, { ...values, lng: "en" }).replace(/<\/?(anchor|bold)>/g, "")
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
