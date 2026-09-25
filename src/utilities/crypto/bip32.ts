import { HDKey } from "@scure/bip32"

import { mnemonicToSeed, validateMnemonic } from "@/src/utilities/crypto/bip39"

/**
 * Compute BIP32 root fingerprint of mnemonic and passphrase — the
 * fingerprint signing devices and wallets (for example Trezor connected
 * to Electrum) display for the wallet the pair unlocks, letting a user
 * match a backed-up passphrase to its wallet without deriving keys. The
 * fingerprint identifies the master node, so it is independent of
 * derivation path
 * @param mnemonic BIP39 mnemonic
 * @param passphrase BIP39 passphrase
 * @returns fingerprint as eight hexadecimal characters
 */
export const computeBip32RootFingerprint = async (
  mnemonic: string,
  passphrase: string
): Promise<string> => {
  if (validateMnemonic(mnemonic) !== true) {
    throw new Error("Invalid mnemonic")
  }
  const seed = await mnemonicToSeed(mnemonic, passphrase)
  return HDKey.fromMasterSeed(seed).fingerprint.toString(16).padStart(8, "0")
}
