import {
  generateMnemonic as _generateMnemonic,
  validateMnemonic as _validateMnemonic,
  wordlists,
} from "bip39"

export type Strength = 128 | 256

export const wordlist = wordlists["english"]

/**
 * Generate mnemonic
 * @param strength strength, defaults to `256`
 * @returns mnemonic
 */
export const generateMnemonic = (strength: Strength = 256): string => {
  if ([128, 256].includes(strength) !== true) {
    throw new Error("Invalid strength")
  }
  const mnemonic = _generateMnemonic(strength)
  return mnemonic
}

export const validateMnemonic = (mnemonic: string): boolean => {
  const result = _validateMnemonic(mnemonic, wordlist)
  return result
}
