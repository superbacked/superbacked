import { bech32 } from "@scure/base"
import { HDKey } from "@scure/bip32"

import { mnemonicToSeed, validateMnemonic } from "@/src/utilities/crypto/bip39"

// BIP84 spec utilities — the first account of the native segwit tree
// (Bitcoin mainnet), projected from a BIP39 seed. Seed in, artifacts
// out: callers own how the seed is produced — the derived wallet scheme
// (see src/utilities/crypto/derivedBitcoinWallet.ts) seeds without a
// BIP39 passphrase by design, while restored secrets pair a mnemonic
// with one — so no passphrase policy lives here.

export const bip84DerivationPath = "m/84'/0'/0'"

// SLIP-132 mainnet version bytes for native segwit (zpub and zprv) —
// what the fixed path derives. Version bytes in the BIP32 serialization
// sense, unrelated to scheme versioning
export const slip132Versions = { private: 0x04b2430c, public: 0x04b24746 }

const bip84Root = (seed: Uint8Array): HDKey => {
  return HDKey.fromMasterSeed(seed, slip132Versions)
}

/**
 * Derive the extended public key of a seed — the verification handle:
 * re-deriving on any device must yield the same key, without exposing
 * what it guards
 * @param seed BIP39 seed
 * @returns extended public key (zpub)
 */
export const deriveBip84ExtendedPublicKey = (seed: Uint8Array): string => {
  return bip84Root(seed).derive(bip84DerivationPath).publicExtendedKey
}

/**
 * Derive the extended private key of a seed — pasting it into a wallet
 * (for example Electrum) imports the entire account, unlike sweeping
 * loose keys
 * @param seed BIP39 seed
 * @returns extended private key (zprv)
 */
export const deriveBip84ExtendedPrivateKey = (seed: Uint8Array): string => {
  return bip84Root(seed).derive(bip84DerivationPath).privateExtendedKey
}

/**
 * Derive the first receive addresses of a seed — the eyeball check: a
 * wallet importing the same seed must show the same addresses
 * @param seed BIP39 seed
 * @param count number of addresses
 * @returns bech32 addresses at bip84DerivationPath/0/0 through
 * /0/count-1
 */
export const deriveBip84Addresses = (
  seed: Uint8Array,
  count: number
): string[] => {
  if (Number.isInteger(count) === false || count < 1) {
    throw new Error("Count must be a positive integer")
  }
  const root = bip84Root(seed)
  const addresses: string[] = []
  for (let index = 0; index < count; index++) {
    const node = root.derive(`${bip84DerivationPath}/0/${index}`)
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
 * Compute BIP84 first-account extended public key (zpub) of mnemonic
 * and passphrase — the watch-only handle a wallet imports to see every
 * address of the account without being able to spend
 * @param mnemonic BIP39 mnemonic
 * @param passphrase BIP39 passphrase
 * @returns extended public key (zpub)
 */
export const computeBip84ExtendedPublicKey = async (
  mnemonic: string,
  passphrase: string
): Promise<string> => {
  if (validateMnemonic(mnemonic) !== true) {
    throw new Error("Invalid mnemonic")
  }
  const seed = await mnemonicToSeed(mnemonic, passphrase)
  return deriveBip84ExtendedPublicKey(seed)
}
