import {
  generateMnemonic as _generateMnemonic,
  validateMnemonic as _validateMnemonic,
} from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

export { wordlist }

export type Strength = 128 | 256

/**
 * Generate mnemonic
 * @param strength strength, defaults to `256`
 * @returns mnemonic
 */
export const generateMnemonic = (strength: Strength = 256): string => {
  if ([128, 256].includes(strength) !== true) {
    throw new Error("Invalid strength")
  }
  const mnemonic = _generateMnemonic(wordlist, strength)
  return mnemonic
}

export const validateMnemonic = (mnemonic: string): boolean => {
  const result = _validateMnemonic(mnemonic, wordlist)
  return result
}
