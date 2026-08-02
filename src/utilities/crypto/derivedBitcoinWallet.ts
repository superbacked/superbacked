import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import {
  bip84DerivationPath,
  deriveBip84Addresses,
  deriveBip84ExtendedPrivateKey,
  deriveBip84ExtendedPublicKey,
} from "@/src/utilities/crypto/bip84"
import {
  computeDerivedKey,
  computeSingleFactorDerivedKey,
} from "@/src/utilities/crypto/derivedKey"
import { hkdf } from "@/src/utilities/crypto/primitives"
import { ChallengeResponseOptions } from "@/src/utilities/yubikey/otp"

// Deterministic Bitcoin wallet rendering from a derived key (see
// src/utilities/crypto/derivedKey.ts) — the key is expanded through HKDF
// under the mnemonic context into BIP39 entropy, so a mnemonic and a
// password derived from the same label never share bytes. The mnemonic
// is the root artifact; the extended keys and addresses are projections
// of it. The context names the mnemonic, not the command: product
// naming is free to move, scheme identities are not.
//
// Scheme version 1 (see schemeVersion in
// src/utilities/crypto/derivedKey.ts) — the rendering is frozen: changing
// any constant or construction below silently changes every derived
// mnemonic, and a mnemonic can guard funds, so unlike a password it can
// never be rotated away from a mistake. The word count is a determinism
// input on par with the label and Paranoid mode: part of what the user
// must know, surfaced at every derivation.
//
// The derivation path is fixed at the BIP84 first account — a stateless
// wallet punishes every forgettable input with silently empty wallets,
// and the mnemonic is Superbacked-independent, so other paths and script
// types stay reachable by importing it into wallet software. The BIP84
// projections (extended keys, addresses) are spec, not scheme — they
// live in src/utilities/crypto/bip84.ts and are consumed here over
// passphrase-less seeds: a BIP39 passphrase is deliberately not a
// determinism input of this scheme.

const mnemonicContext = "superbacked-derived-mnemonic"

export const derivationPath = bip84DerivationPath

export type MnemonicWords = 12 | 24

/**
 * Render a BIP39 mnemonic from a derived key
 * @param derivedKey 32-byte derived key (see src/utilities/crypto/derivedKey.ts)
 * @param words mnemonic length in words (24 draws 256 bits of entropy,
 * 12 draws 128 — distinct wallets by construction)
 * @returns mnemonic
 */
export const deriveMnemonic = (
  derivedKey: Buffer,
  words: MnemonicWords
): string => {
  if (words !== 12 && words !== 24) {
    throw new Error("Words must be 12 or 24")
  }
  // The word count is part of the info — HKDF outputs of different
  // lengths share a prefix, so without it the 12-word mnemonic would be
  // a truncation of the 24-word one instead of an independent wallet
  const entropy = hkdf(
    derivedKey,
    Buffer.alloc(0),
    Buffer.from(`${mnemonicContext}-${words}`, "utf8"),
    words === 24 ? 32 : 16
  )
  return entropyToMnemonic(entropy, wordlist)
}

/**
 * Derive the extended public key of a mnemonic — the verification
 * handle: re-deriving on any device must yield the same key, without
 * exposing what it guards
 * @param mnemonic BIP39 mnemonic
 * @returns extended public key (zpub)
 */
export const deriveExtendedPublicKey = (mnemonic: string): string => {
  return deriveBip84ExtendedPublicKey(mnemonicToSeedSync(mnemonic))
}

/**
 * Derive the extended private key of a mnemonic — pasting it into a
 * wallet (for example Electrum) imports the entire account, unlike
 * sweeping loose keys
 * @param mnemonic BIP39 mnemonic
 * @returns extended private key (zprv)
 */
export const deriveExtendedPrivateKey = (mnemonic: string): string => {
  return deriveBip84ExtendedPrivateKey(mnemonicToSeedSync(mnemonic))
}

/**
 * Derive the first receive addresses of a mnemonic — the eyeball check:
 * a wallet importing the same mnemonic must show the same addresses
 * @param mnemonic BIP39 mnemonic
 * @param count number of addresses
 * @returns bech32 addresses at derivationPath/0/0 through /0/count-1
 */
export const deriveAddresses = (mnemonic: string, count: number): string[] => {
  return deriveBip84Addresses(mnemonicToSeedSync(mnemonic), count)
}

/**
 * Derive a Bitcoin wallet — its BIP39 mnemonic and extended public key —
 * from master passphrase and label, computing the response on YubiKey
 * when challenge-response is requested (single factor otherwise)
 * @param masterPassphrase memorized master passphrase
 * @param label memorized label (for example savings)
 * @param options derivation options — words and paranoid are determinism
 * inputs the user must know (see src/utilities/crypto/derivedKey.ts)
 * @returns mnemonic and extended public key
 */
export const computeDerivedBitcoinWallet = async (
  masterPassphrase: string,
  label: string,
  options: {
    paranoid: boolean
    words: MnemonicWords
    yubikey?: ChallengeResponseOptions
  }
): Promise<{ extendedPublicKey: string; mnemonic: string }> => {
  const derivedKey =
    options.yubikey === undefined
      ? await computeSingleFactorDerivedKey(
          masterPassphrase,
          label,
          options.paranoid
        )
      : await computeDerivedKey(
          masterPassphrase,
          label,
          options.paranoid,
          options.yubikey.slot,
          options.yubikey.onTouchRequired
        )
  const mnemonic = deriveMnemonic(derivedKey, options.words)
  return {
    extendedPublicKey: deriveExtendedPublicKey(mnemonic),
    mnemonic: mnemonic,
  }
}
