import en from "@/src/locales/en.json"

export type Translation = typeof en

type Paths<T, K extends keyof T = keyof T> = K extends string | number
  ? T[K] extends Record<string, unknown>
    ? `${K}.${Paths<T[K]>}`
    : K
  : never

// Base translation paths from JSON
type TranslationPaths = Paths<Translation>

// For plural keys (_one, _other), also include the base key without suffix
type WithPluralBase<T extends string> =
  | T
  | (T extends `${infer Base}_${"one" | "other"}` ? Base : never)

// TranslationKey includes both full keys and base keys for plurals
export type TranslationKey = WithPluralBase<TranslationPaths>

export type ValidateTranslationKeys<T extends TranslationKey> = T
