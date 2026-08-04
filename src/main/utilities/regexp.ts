import { createExtractor } from "@/src/main/utilities/extraction"

export type {
  Bip39MnemonicResult,
  Bip39PassphraseResult,
  ExtractionType,
  TotpUriResult,
  YubiKeyChallengeResponseSecretResult,
} from "@/src/main/utilities/extraction"

// The window binding — extraction itself is pure (see
// src/main/utilities/extraction.ts); the wordlist, mnemonic validator
// and password character classes cross the bridge as data so the
// renderer never imports crypto modules
export const extract = createExtractor({
  characterClasses: window.api.invokeSync.getPasswordCharacterClasses(),
  validateMnemonic: window.api.invokeSync.validateMnemonic,
  wordlist: window.api.invokeSync.getWordlist(),
})
