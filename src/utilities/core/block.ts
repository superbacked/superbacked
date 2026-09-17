import { hkdfSync } from "crypto"

import type { ErrorCorrection } from "qr"

import { KdfProfile } from "@/src/shared/kdfProfiles"
import {
  Secret as EncryptionSecret,
  Message,
  decrypt,
  encrypt,
  getDataLength,
} from "@/src/utilities/crypto/fixedSizeEncryption"
import { computePassphraseKey } from "@/src/utilities/crypto/passphraseKey"
import { generateSalt } from "@/src/utilities/crypto/primitives"
import {
  UnsupportedVersionError,
  decodeSchemeHeader,
  encodeSchemeHeader,
  schemeHeaderLength,
} from "@/src/utilities/crypto/schemeHeader"
import { ChallengeResponseOptions, Slot } from "@/src/utilities/yubikey/otp"

// Version written into new blocks (see
// src/utilities/crypto/schemeHeader.ts) — carried inside each secret’s
// encrypted message, so a successful decryption also names the version
export const schemeVersion = 2

// Block density constants — QR code capacity bounds blockSize at the error
// correction level set by qrCodeEcc, so the two must move together
export const blockSize = 768
export const qrCodeEcc: ErrorCorrection = "low"

export interface Secret {
  message: string
  passphrase: string
  // Optional YubiKey slot binding the passphrase and the YubiKey response
  // into a derived key (see computeBlockKdfKey below) — single blocks
  // only, never blocksets
  slot?: Slot
}

// A share-carrying secret whose message is the raw share bytes, unlike
// the string messages of the renderer-facing Secret (see the shamir
// branch in src/handlers/create.ts)
export interface ShareSecret {
  message: Buffer
  passphrase: string
}

export interface Metadata {
  label?: string
}

// The block artifact’s wire format — the JSON a block’s QR code encodes
export interface Payload {
  salt: string
  data: string
  metadata: Metadata
}

/**
 * Encode block content — the plaintext a block secret carries: the
 * secret itself, or, when a detached archive is paired, JSON binding the
 * secret and the archive master key (see
 * src/handlers/detachedArchive.ts)
 * @param secret secret text
 * @param masterKey optional base64-encoded detached archive master key
 * @returns block content
 */
export const encodeBlockContent = (
  secret: string,
  masterKey?: string
): string => {
  if (masterKey === undefined) {
    return secret
  }
  return JSON.stringify(
    {
      secret: secret,
      masterKey: masterKey,
    },
    null,
    2
  )
}

/**
 * Decode block content into the secret and, when present, the detached
 * archive master key — plain (non-JSON) content is the secret itself
 * @param blockContent decrypted block content
 * @returns secret and base64-encoded master key (`null` when the block
 * carries none)
 */
export const decodeBlockContent = (
  blockContent: string
): { masterKey: null | string; secret: string } => {
  try {
    const parsed: unknown = JSON.parse(blockContent)
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "secret" in parsed &&
      typeof parsed.secret === "string"
    ) {
      return {
        masterKey:
          "masterKey" in parsed && typeof parsed.masterKey === "string"
            ? parsed.masterKey
            : null,
        secret: parsed.secret,
      }
    }
  } catch {
    // Not JSON — the content is the secret itself
  }
  return { masterKey: null, secret: blockContent }
}

// Frozen format constants — blocks encrypted under these derivations must
// decrypt forever. The key that authenticates names the message type: block
// keys encrypt plain secrets, blockset keys encrypt shares, so restoration
// classifies messages without a plaintext marker
export const deriveBlockKey = (key: Buffer): Buffer => {
  return Buffer.from(hkdfSync("sha256", key, "", "block-key", 32))
}

export const deriveBlocksetKey = (key: Buffer): Buffer => {
  return Buffer.from(hkdfSync("sha256", key, "", "blockset-key", 32))
}

// HKDF info binding YubiKey-protected block key derivation (see
// src/utilities/passphraseKey.ts) — frozen, as changing it changes the key
// of every YubiKey-protected block. Per-block uniqueness comes from the
// block salt, not from this constant.
export const passphraseKeyInfo = "kdf-key"

/**
 * Prepend the scheme header to a secret’s message before encryption
 * @param message plain secret (string) or blockset share (Buffer)
 * @returns versioned message plaintext
 */
export const encodeBlockMessage = (message: Message): Buffer => {
  return Buffer.concat([
    encodeSchemeHeader(schemeVersion),
    Buffer.from(message),
  ])
}

/**
 * Split a decrypted message into its scheme header and secret
 * @param plaintext decrypted message plaintext
 * @returns declared version and message, or `null` when the plaintext
 * carries no header
 */
export const decodeBlockMessage = (
  plaintext: Buffer
): null | { message: Buffer; version: number } => {
  const version = decodeSchemeHeader(plaintext.subarray(0, schemeHeaderLength))
  if (version === null) {
    return null
  }
  return {
    message: plaintext.subarray(schemeHeaderLength),
    version: version,
  }
}

/**
 * Compute the key derivation function key from the memorized passphrase
 * and the block salt — the stretched key alone, or, with YubiKey
 * challenge-response, mixed with the response (see
 * src/utilities/passphraseKey.ts). The backup type’s HKDF domain key is
 * applied on top either way (see deriveBlockKey and deriveBlocksetKey),
 * and the block format records nothing, so restoring a YubiKey-protected
 * secret requires the same slot secret, and its absence fails exactly like
 * a wrong passphrase
 * @param passphrase memorized passphrase
 * @param salt 16-byte block salt
 * @param profile frozen Argon2d cost profile — the block’s at restore,
 * discovered by probing (see src/shared/kdfProfiles.ts)
 * @param yubikey optional YubiKey challenge-response request
 * @returns 32-byte key derivation function key
 */
export const computeBlockKdfKey = async (
  passphrase: string,
  salt: Buffer,
  profile: KdfProfile,
  yubikey?: ChallengeResponseOptions
): Promise<Buffer> => {
  return computePassphraseKey(
    passphrase,
    salt,
    profile,
    passphraseKeyInfo,
    yubikey
  )
}

/**
 * Encrypt secrets into a block payload — one key per secret from its
 * passphrase and the block’s salt (computeBlockKdfKey — sequentially, so
 * each YubiKey-protected secret costs its own challenge-response
 * round-trip and touch — then the backup type’s HKDF domain key so
 * restoration classifies messages by which key authenticates), all
 * secrets sealed into a single fixed-size block
 * @param secrets secrets (share-carrying for blocksets)
 * @param blockset seal under the blockset domain key — the block and
 * blockset backup types yield indistinguishable blocks
 * @param profile frozen Argon2d cost profile (see
 * src/shared/kdfProfiles.ts)
 * @param label optional plaintext label
 * @param onTouchRequired invoked while a YubiKey awaits touch
 * @returns block payload
 */
export const encryptBlock = async (
  secrets: (Secret | ShareSecret)[],
  blockset: boolean,
  profile: KdfProfile,
  label?: string,
  onTouchRequired?: () => void
): Promise<Payload> => {
  const salt = generateSalt()
  const blockSecrets: EncryptionSecret[] = []
  for (const secret of secrets) {
    const slot = "slot" in secret ? secret.slot : undefined
    const kdfKey = await computeBlockKdfKey(
      secret.passphrase,
      salt,
      profile,
      slot === undefined
        ? undefined
        : { onTouchRequired: onTouchRequired, slot: slot }
    )
    blockSecrets.push({
      key: blockset ? deriveBlocksetKey(kdfKey) : deriveBlockKey(kdfKey),
      message: encodeBlockMessage(secret.message),
    })
  }
  return {
    salt: salt.toString("base64"),
    data: encrypt(blockSecrets, blockSize).toString("base64"),
    metadata: {
      label: label,
    },
  }
}

const tryDecrypt = (key: Buffer, block: Buffer): null | Buffer => {
  try {
    return decrypt(key, block)
  } catch {
    // Not this key’s block — the caller tries the next candidate key
    return null
  }
}

// Strip and validate the scheme header a successful decryption reveals
// (see encodeBlockMessage) — headerless plaintexts fail like a wrong
// passphrase, as the only blocks that decrypt without a header are
// pre-release ones
const decodeVersionedMessage = (plaintext: Buffer): Buffer => {
  const decoded = decodeBlockMessage(plaintext)
  if (decoded === null) {
    throw new Error("Secret not found")
  }
  if (decoded.version !== schemeVersion) {
    throw new UnsupportedVersionError(
      "Block requires a newer version of Superbacked"
    )
  }
  return decoded.message
}

/**
 * Decrypt one secret of a block payload — each profile trial is one
 * stretch (and, with YubiKey, one touch), and the key that authenticates
 * names the message type: block keys encrypt plain secrets, blockset
 * keys encrypt shares, so restoration classifies messages without a
 * plaintext marker. Fails as a wrong passphrase when no candidate key
 * authenticates, and reports a supported newer version as such
 * @param passphrase memorized passphrase
 * @param salt 16-byte block salt
 * @param data fixed-size encryption output
 * @param profiles frozen Argon2d cost profiles to trial, newest first —
 * the caller decides whether the paranoid row joins (see
 * src/handlers/restore.ts)
 * @param yubikey optional YubiKey challenge-response request
 * @returns message and whether it is a blockset share
 */
export const decryptBlock = async (
  passphrase: string,
  salt: Buffer,
  data: Buffer,
  profiles: KdfProfile[],
  yubikey?: ChallengeResponseOptions
): Promise<{ message: Buffer; share: boolean }> => {
  for (const profile of profiles) {
    const kdfKey = await computeBlockKdfKey(passphrase, salt, profile, yubikey)
    const blockMessage = tryDecrypt(deriveBlockKey(kdfKey), data)
    if (blockMessage !== null) {
      return { message: decodeVersionedMessage(blockMessage), share: false }
    }
    const blocksetMessage = tryDecrypt(deriveBlocksetKey(kdfKey), data)
    if (blocksetMessage !== null) {
      return { message: decodeVersionedMessage(blocksetMessage), share: true }
    }
  }
  throw new Error("Secret not found")
}

// Extra space a message occupies when secret is split into blockset shares —
// the per-share overhead added by secret-share-split, plus the blockset
// scheme version byte each share carries (see
// src/utilities/core/blockset.ts, stated here to keep capacity math in
// one place without a module cycle)
const shamirOverhead = 49
const blocksetVersionLength = 1

// All secrets draw from the same fixed-size block, so capacity reduces to a
// single remaining space (negative when secrets no longer fit)
export interface BlockUsage {
  blockSize: number
  remainingSpace: number
}

/**
 * Get usage of block under construction
 * @param messages messages (empty messages are ignored)
 * @param shamir account for Shamir Secret Sharing overhead
 * @returns block usage
 */
export const getBlockUsage = (
  messages: string[],
  shamir: boolean
): BlockUsage => {
  const overhead = shamir ? shamirOverhead + blocksetVersionLength : 0
  let usedSpace = 0
  for (const message of messages) {
    if (message !== "") {
      // Every message carries the scheme header (see encodeBlockMessage)
      usedSpace += getDataLength(message) + schemeHeaderLength + overhead
    }
  }
  return {
    blockSize: blockSize,
    remainingSpace: blockSize - usedSpace,
  }
}
