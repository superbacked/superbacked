import { KdfProfile } from "@/src/shared/utilities/kdfProfiles"
import {
  Payload,
  Secret,
  ShareSecret,
  encryptBlock,
} from "@/src/utilities/core/block"
import { UnsupportedVersionError } from "@/src/utilities/crypto/schemeHeader"
import { combineShares, generateShares } from "@/src/utilities/crypto/shamir"

// The blockset scheme — a composition over blocks: each secret is split
// into shares using Shamir Secret Sharing and every block carries one
// share of every secret, sealed exactly like a single block under the
// blockset domain key (see deriveBlocksetKey in
// src/utilities/core/block.ts). The domain key names the type; the
// version byte below names the composition — every scheme layer that
// owns bytes declares its own version at the top of the bytes it owns.

// Version written into new shares (one byte at the start of each share’s
// message, inside the block envelope) — read only after the blockset
// domain key authenticates, so the block and blockset schemes version
// independently. Version 1 is the legacy prefix convention, which never
// wrote the byte (see src/utilities/core/legacy/blockset.ts)
export const schemeVersion = 2

/**
 * Prepend the blockset scheme version to a share before it is sealed
 * into a block message
 * @param share Shamir Secret Sharing share
 * @returns versioned share message
 */
export const encodeBlocksetShare = (share: Buffer): Buffer => {
  return Buffer.concat([Buffer.from([schemeVersion]), share])
}

/**
 * Split a decrypted share message into its version and share — a
 * supported version reveals the share, an unsupported one reports that
 * the blockset requires a newer release of Superbacked, never a wrong
 * passphrase (the domain key already authenticated)
 * @param message decrypted share message
 * @returns share
 */
export const decodeBlocksetShare = (message: Buffer): Buffer => {
  const version = message.at(0)
  if (version === undefined) {
    throw new Error("Share not found")
  }
  if (version !== schemeVersion) {
    throw new UnsupportedVersionError(
      "Blockset requires a newer version of Superbacked"
    )
  }
  return message.subarray(1)
}

/**
 * Combine accumulated shares into the secret — the version 2 combiner
 * (dsprenkels/sss). Version 1 shares combine through the same sublayer:
 * the composition change from 1 to 2 was the share carrier, not the
 * splitting scheme (see src/utilities/core/legacy/blockset.ts)
 * @param shares accumulated shares, threshold met or not
 * @returns secret
 */
export const combineBlocksetShares = async (
  shares: Buffer[]
): Promise<string> => {
  return combineShares(shares)
}

/**
 * Encrypt secrets into a set of blockset payloads — any threshold of
 * blocks reconstructs the secrets while fewer reveal nothing
 * @param secrets secrets — never YubiKey-protected: a blockset’s shares
 * are meant to restore on any machine holding enough blocks, a property
 * a hardware binding would defeat
 * @param numberOfShares number of blocks
 * @param threshold blocks required to reconstruct
 * @param profile frozen Argon2d cost profile (see
 * src/shared/utilities/kdfProfiles.ts)
 * @param label optional plaintext label
 * @param onTouchRequired invoked while a YubiKey awaits touch
 * @returns one block payload per share
 */
export const encryptBlockset = async (
  secrets: Secret[],
  numberOfShares: number,
  threshold: number,
  profile: KdfProfile,
  label?: string,
  onTouchRequired?: () => void
): Promise<Payload[]> => {
  if (
    typeof numberOfShares !== "number" ||
    typeof threshold !== "number" ||
    threshold > numberOfShares
  ) {
    throw new Error("Invalid number of shares or threshold")
  }
  if (secrets.some((secret) => secret.slot !== undefined)) {
    throw new Error("YubiKey protection is not supported for blocksets")
  }
  const shareSecretsByBlock: ShareSecret[][] = []
  for (const secret of secrets) {
    const shares = await generateShares(
      secret.message,
      numberOfShares,
      threshold
    )
    for (const [index, share] of shares.entries()) {
      const shareSecret: ShareSecret = {
        message: encodeBlocksetShare(share),
        passphrase: secret.passphrase,
      }
      const blockSecrets = shareSecretsByBlock[index]
      if (blockSecrets) {
        blockSecrets.push(shareSecret)
      } else {
        shareSecretsByBlock[index] = [shareSecret]
      }
    }
  }
  const payloads: Payload[] = []
  for (const blockSecrets of shareSecretsByBlock) {
    payloads.push(
      await encryptBlock(blockSecrets, true, profile, label, onTouchRequired)
    )
  }
  return payloads
}
