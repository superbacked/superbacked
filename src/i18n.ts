import { changeLanguage, use as i18nextUse } from "i18next"
import { initReactI18next } from "react-i18next"

import en from "@/src/locales/en.json"
// French is commented out but kept as a working example of how to add
// a language: restore its import and resource entry below, then
// uncomment the “Choose app language” menu in menu.ts.
// import fr from "@/src/locales/fr.json"

export const resources = {
  en: {
    label: "English",
    translation: en,
  },
  // fr: {
  //   label: "Français",
  //   translation: fr satisfies typeof en,
  // },
}

export type Locale = keyof typeof resources

export const locales = Object.keys(resources) as Locale[]

export const defaultLocale = "en"

export const setLocale = async (locale: Locale) => {
  if (locales.includes(locale) === false) {
    throw new Error("Invalid locale")
  }
  await changeLanguage(locale)
}

await i18nextUse(initReactI18next).init({
  lng: defaultLocale,
  interpolation: {
    escapeValue: false,
  },
  resources,
})
