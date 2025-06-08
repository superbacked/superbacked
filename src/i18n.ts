import { changeLanguage, use } from "i18next"
import { initReactI18next } from "react-i18next"
import en from "./locales/en.json"
import fr from "./locales/fr.json"
import pt from "./locales/pt.json"


export const resources = {
  en: {
    label: "English",
    translation: en,
  },
  fr: {
    label: "Français",
    translation: fr,
  },
  pt: {
    label: "Português",
    translation: pt,
  },
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

use(initReactI18next).init({
  lng: defaultLocale,
  interpolation: {
    escapeValue: false,
  },
  resources,
})
