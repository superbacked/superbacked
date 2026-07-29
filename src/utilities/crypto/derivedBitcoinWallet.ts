import { bech32 } from "@scure/base"
import { HDKey } from "@scure/bip32"
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

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
// of it. The frozen context string predates the command’s name — scheme
// identities never move with product naming.
//
// The rendering is frozen: changing any constant or construction below
// silently changes every derived mnemonic — and a mnemonic can guard
// funds, so unlike a password it can never be rotated away from a
// mistake. The word count and derivation path are determinism inputs on
// par with the label and Paranoid mode: part of what the user must know,
// surfaced at every derivation.

const mnemonicContext = "superbacked-derived-mnemonic-v1"

export const defaultDerivationPath = "m/84'/0'/0'"

export type MnemonicWords = 12 | 24

// SLIP-132 mainnet version bytes by BIP purpose — the emitted extended
// key is labeled by what the path derives (zpub for native segwit 84',
// ypub for wrapped segwit 49', xpub otherwise)
const versionsByPurpose: Record<string, { private: number; public: number }> = {
  "49'": { private: 0x049d7878, public: 0x049d7cb2 },
  "84'": { private: 0x04b2430c, public: 0x04b24746 },
}
const defaultVersions = { private: 0x0488ade4, public: 0x0488b21e }

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

const rootForPath = (mnemonic: string, derivationPath: string): HDKey => {
  const purpose = derivationPath.split("/")[1]
  const versions = versionsByPurpose[purpose ?? ""] ?? defaultVersions
  return HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic), versions)
}

/**
 * Derive the extended public key of a mnemonic at a derivation path —
 * the verification handle: re-deriving on any device must yield the same
 * key, without exposing what it guards
 * @param mnemonic BIP39 mnemonic
 * @param derivationPath BIP32 derivation path (for example m/84'/0'/0')
 * @returns extended public key, SLIP-132-labeled by purpose
 */
export const deriveExtendedPublicKey = (
  mnemonic: string,
  derivationPath: string
): string => {
  return rootForPath(mnemonic, derivationPath).derive(derivationPath)
    .publicExtendedKey
}

/**
 * Derive the extended private key of a mnemonic at a derivation path —
 * pasting it into a wallet (for example Electrum) imports the entire
 * account, unlike sweeping loose keys
 * @param mnemonic BIP39 mnemonic
 * @param derivationPath BIP32 derivation path (for example m/84'/0'/0')
 * @returns extended private key, SLIP-132-labeled by purpose
 */
export const deriveExtendedPrivateKey = (
  mnemonic: string,
  derivationPath: string
): string => {
  return rootForPath(mnemonic, derivationPath).derive(derivationPath)
    .privateExtendedKey
}

/**
 * Derive the first receive addresses of a mnemonic at a derivation path
 * — the eyeball check: a wallet importing the same mnemonic must show
 * the same addresses
 * @param mnemonic BIP39 mnemonic
 * @param derivationPath BIP32 derivation path — native segwit (m/84')
 * only, as other purposes use other address encodings
 * @param count number of addresses
 * @returns bech32 addresses at derivationPath/0/0 through /0/count-1
 */
export const deriveAddresses = (
  mnemonic: string,
  derivationPath: string,
  count: number
): string[] => {
  if (derivationPath.split("/")[1] !== "84'") {
    throw new Error("Addresses are supported for m/84' derivation paths only")
  }
  if (Number.isInteger(count) === false || count < 1) {
    throw new Error("Count must be a positive integer")
  }
  const root = rootForPath(mnemonic, derivationPath)
  const addresses: string[] = []
  for (let index = 0; index < count; index++) {
    const node = root.derive(`${derivationPath}/0/${index}`)
    // Native segwit P2WPKH — witness version 0 over hash160 of the
    // compressed public key (the node identifier), bech32-encoded. The
    // identifier is only ever absent on a wiped key, which derive cannot
    // return
    if (node.identifier === undefined) {
      throw new Error("Could not derive address")
    }
    addresses.push(bech32.encode("bc", [0, ...bech32.toWords(node.identifier)]))
  }
  return addresses
}

/**
 * Derive a Bitcoin wallet — its BIP39 mnemonic and extended public key —
 * from master passphrase and label, computing the response on YubiKey
 * when challenge-response is requested (single factor otherwise)
 * @param masterPassphrase memorized master passphrase
 * @param label memorized label (for example savings)
 * @param options derivation options — words, derivationPath and paranoid
 * are determinism inputs the user must know (see
 * src/utilities/crypto/derivedKey.ts)
 * @returns mnemonic and extended public key
 */
export const computeDerivedBitcoinWallet = async (
  masterPassphrase: string,
  label: string,
  options: {
    derivationPath: string
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
    extendedPublicKey: deriveExtendedPublicKey(
      mnemonic,
      options.derivationPath
    ),
    mnemonic: mnemonic,
  }
}
