import { createHmac } from "crypto"

import { HDKey } from "@scure/bip32"
import { entropyToMnemonic } from "@scure/bip39"

import {
  mnemonicToSeed,
  validateMnemonic,
  wordlist,
} from "@/src/utilities/crypto/bip39"

// BIP85 spec utilities — deterministic entropy from a BIP32 root key.
// Root in, artifacts out: callers own how the root is produced, so no
// passphrase policy lives here (mirroring
// src/utilities/crypto/bip84.ts). The spec anchors derivation at the
// master node — deriving from a child would silently change every
// artifact — so the root is rejected unless it is one.

export const bip85DerivationPath = "m/83696968'"

// The domain separator fixed by the spec — the derived private key is
// never entropy itself, it is keyed through HMAC-SHA512 so BIP85
// artifacts cannot collide with BIP32 child keys
const bip85HmacKey = "bip-entropy-from-k"

// The spec mandates fully hardened derivation under the BIP85 purpose —
// a public parent must never be able to enumerate derived entropy
const bip85PathPattern = /^m\/83696968'(\/\d+')+$/

/**
 * Derive BIP85 entropy of a root key at an application path — the
 * 512-bit pool applications truncate to their own width
 * @param root BIP32 root key (master node)
 * @param path fully hardened application path under
 * bip85DerivationPath (for example `m/83696968'/39'/0'/12'/0'`)
 * @returns 64 bytes of entropy
 */
export const deriveBip85Entropy = (root: HDKey, path: string): Buffer => {
  if (root.depth !== 0) {
    throw new Error("Root key must be master node")
  }
  if (bip85PathPattern.test(path) !== true) {
    throw new Error("Invalid BIP85 derivation path")
  }
  const node = root.derive(path)
  // Hardened derivation from a private master always yields a private
  // key — it is only ever absent on a wiped key, which derive cannot
  // return
  if (node.privateKey === null) {
    throw new Error("Could not derive private key")
  }
  return createHmac("sha512", bip85HmacKey).update(node.privateKey).digest()
}

export type Bip85MnemonicWords = 12 | 18 | 24

/**
 * Derive a BIP39 mnemonic of a root key — the BIP85 BIP39 application
 * (`m/83696968'/39'/0'/{words}'/{index}'`, English wordlist): child
 * mnemonics a wallet re-derives from the same root, so backing up the
 * root backs up every child
 * @param root BIP32 root key (master node)
 * @param words mnemonic length in words (12, 18 or 24 draw 128, 192 or
 * 256 bits of entropy — distinct wallets by construction, the word
 * count is a derivation path segment)
 * @param index child index
 * @returns mnemonic
 */
export const deriveBip85Mnemonic = (
  root: HDKey,
  words: Bip85MnemonicWords,
  index: number
): string => {
  if ([12, 18, 24].includes(words) !== true) {
    throw new Error("Words must be 12, 18 or 24")
  }
  if (Number.isInteger(index) === false || index < 0 || index >= 2 ** 31) {
    throw new Error("Invalid index")
  }
  const entropy = deriveBip85Entropy(
    root,
    `${bip85DerivationPath}/39'/0'/${words}'/${index}'`
  )
  // The spec truncates trailing (least significant) bytes of the
  // 512-bit pool — keeping the leading 16, 24 or 32 bytes for 12, 18
  // or 24 words
  return entropyToMnemonic(entropy.subarray(0, (words / 3) * 4), wordlist)
}

/**
 * Compute BIP85 child mnemonic of mnemonic and passphrase — deriving
 * child wallets from a backed-up parent without the children ever
 * touching the backup
 * @param mnemonic BIP39 mnemonic
 * @param passphrase BIP39 passphrase
 * @param words mnemonic length in words (12, 18 or 24)
 * @param index child index
 * @returns mnemonic
 */
export const computeBip85Mnemonic = async (
  mnemonic: string,
  passphrase: string,
  words: Bip85MnemonicWords,
  index: number
): Promise<string> => {
  if (validateMnemonic(mnemonic) !== true) {
    throw new Error("Invalid mnemonic")
  }
  const seed = await mnemonicToSeed(mnemonic, passphrase)
  return deriveBip85Mnemonic(HDKey.fromMasterSeed(seed), words, index)
}
