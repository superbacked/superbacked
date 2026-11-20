import { changeLanguage, use as i18nextUse } from "i18next"
import { initReactI18next } from "react-i18next"

import {
  Locale,
  defaultLocale,
  interpolation,
  locales,
  resources,
} from "@/src/shared/i18n"

// The app’s i18next instance — follows the chosen language (see setLocale
// in src/index.ts) and re-renders React on change. Resources and options
// live in src/shared/i18n.ts so the command-line interface builds its
// English-only instance from the same definition

export const setLocale = async (locale: Locale) => {
  if (locales.includes(locale) === false) {
    throw new Error("Invalid locale")
  }
  await changeLanguage(locale)
}

await i18nextUse(initReactI18next).init({
  lng: defaultLocale,
  interpolation: interpolation,
  resources: resources,
})
