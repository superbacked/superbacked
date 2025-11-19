import "react-i18next"

import en from "@/src/locales/en.json"

export type Translation = typeof en

type Paths<T, K extends keyof T = keyof T> = K extends string | number
  ? T[K] extends Record<string, unknown>
    ? `${K}.${Paths<T[K]>}`
    : K
  : never

export type TranslationKey = Paths<Translation>

export type ValidateTranslationKeys<T extends TranslationKey> = T

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: {
      translation: Translation
    }
  }
}
