import en from "@/src/locales/en.json"
// French is commented out but kept as a working example of how to add
// a language: restore its import and resource entry below, then
// uncomment the “Choose app language” menu in menu.ts.
// import fr from "@/src/locales/fr.json"

// Locale resources and options shared by the app’s i18next instance (see
// src/i18n.ts), which follows the chosen language, and the command-line
// interface’s English-only instance (see src/cli/utilities/localeText.ts)
// — one definition so the two surfaces cannot drift. i18next stores
// resources by reference, so both instances read the same objects — adding
// or removing resources at runtime on one would change the other

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

// Copy carries typographic characters rendered as-is — HTML escaping
// would mangle them
export const interpolation = { escapeValue: false }
