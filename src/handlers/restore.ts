import { isUtf8 } from "buffer"

import { LegacyPayload, Payload } from "@/src/handlers/create"
import {
  legacyKdfProfile,
  v2ParanoidKdfProfile,
  v2StandardKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"
import {
  blockVersion,
  computeBlockKdfKey,
  decodeBlockMessage,
  deriveBlockKey,
  deriveBlocksetKey,
} from "@/src/utilities/core/block"
import argon2 from "@/src/utilities/crypto/argon2"
import { decrypt } from "@/src/utilities/crypto/fixedSizeEncryption"
import {
  Kdf,
  decrypt as decryptLegacy,
} from "@/src/utilities/crypto/legacyFixedSizeEncryption"
import { UnsupportedVersionError } from "@/src/utilities/crypto/schemeHeader"
import { combineShares } from "@/src/utilities/crypto/shamir"
import { getSenderWebContents } from "@/src/utilities/ipc/handleContext"
import broadcastYubiKeyTouchRequired from "@/src/utilities/yubikey/broadcastTouchRequired"
import {
  Slot,
  YubiKeyError,
  YubiKeyErrorCode,
} from "@/src/utilities/yubikey/otp"

// Legacy payloads were all created at legacy cost — the pin is their
// compatibility contract, not a default
const legacyArgon2: Kdf = (passphrase, salt) =>
  argon2(passphrase, salt, legacyKdfProfile)

// Shamir shares accumulate per sender, so concurrent restore sessions in
// separate windows cannot mix shares from different blocksets
const shamirSharesBySender = new Map<number, Buffer[]>()

const getShamirShares = (): Buffer[] => {
  const sender = getSenderWebContents()
  if (!sender) {
    throw new Error("Could not resolve sender")
  }
  let shamirShares = shamirSharesBySender.get(sender.id)
  if (!shamirShares) {
    shamirShares = []
    shamirSharesBySender.set(sender.id, shamirShares)
    // Free share material when the window goes away — an abandoned restore
    // session must not leak into a future one (sender.id is captured before
    // destruction because destroyed objects throw on property access)
    const senderId = sender.id
    sender.once("destroyed", () => {
      shamirSharesBySender.delete(senderId)
    })
  }
  return shamirShares
}

const duplicateShamirShare = (
  shamirShares: Buffer[],
  additionalShamirShare: Buffer
) => {
  for (const shamirShare of shamirShares) {
    if (Buffer.compare(shamirShare, additionalShamirShare) === 0) {
      return true
    }
  }
  return false
}

export const restoreReset = () => {
  const sender = getSenderWebContents()
  if (sender) {
    shamirSharesBySender.delete(sender.id)
  }
}

// A share is a keyshare (33 bytes), ciphertext (at least 1 byte) and
// authentication tag (16 bytes) — anything shorter cannot be one
const minimumShareLength = 50

const shamirPrefix = Buffer.from("shamir:")

// Classify a message decrypted from a legacy block, where shares carry a
// “shamir:” prefix. The prefix alone cannot classify — a plain secret may
// start with it. Plain messages are UTF-8-encoded strings by contract while
// shares are effectively random bytes, so a share must also be share-shaped:
// long enough and not valid UTF-8. Returns the share, or null for a plain
// secret.
const classifyPrefixedShare = (message: Buffer): null | Buffer => {
  if (
    Buffer.compare(message.subarray(0, shamirPrefix.length), shamirPrefix) !== 0
  ) {
    return null
  }
  const candidate = message.subarray(shamirPrefix.length)
  if (candidate.length < minimumShareLength || isUtf8(candidate) === true) {
    return null
  }
  return candidate
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
// (see encodeBlockMessage in src/utilities/core/block.ts). Headerless
// plaintexts fail like a wrong passphrase — the only blocks that decrypt
// without a header are pre-release ones
const decodeVersionedMessage = (plaintext: Buffer): Buffer => {
  const decoded = decodeBlockMessage(plaintext)
  if (decoded === null) {
    throw new Error("Secret not found")
  }
  if (decoded.version !== blockVersion) {
    throw new UnsupportedVersionError(
      "Block requires a newer version of Superbacked"
    )
  }
  return decoded.message
}

export type Result =
  | {
      error: string
      success: false
      // Present when the message declared a version this build does not
      // implement — the passphrase is correct, so the error must never
      // read as a wrong passphrase
      unsupportedVersion?: boolean
      // Present when the failure belongs to the YubiKey step — the code
      // routes error display (see src/shared/utilities/yubikeyErrorMessage.ts)
      yubikeyErrorCode?: YubiKeyErrorCode
    }
  | { message: string; success: true }

export default async (
  passphrase: string,
  payload: Payload | LegacyPayload,
  paranoid = false,
  slot?: Slot,
  // Injectable for the pipeline tests (and a future command-line
  // restore) — the renderer path scopes accumulated shares per sender
  // window (see getShamirShares)
  shamirShares?: Buffer[]
): Promise<Result> => {
  try {
    const salt = Buffer.from(payload.salt, "base64")
    const data = Buffer.from(payload.data, "base64")
    let message: Buffer
    let shamirShare: null | Buffer = null
    if ("iv" in payload && "headers" in payload) {
      if (slot !== undefined) {
        // Legacy blocks predate YubiKey protection — the switch cannot
        // apply, so it fails exactly like a wrong passphrase
        throw new Error("Secret not found")
      }
      // Legacy payload (iv and headers fields) — headers locate secrets and
      // the key derivation function runs inside decryption
      const iv = Buffer.from(payload.iv, "base64")
      const headers = Buffer.from(payload.headers, "base64")
      message = await decryptLegacy(
        passphrase,
        salt,
        iv,
        headers,
        data,
        legacyArgon2
      ).catch(() =>
        // Try legacy mode (blocks created before HKDF subkeys)
        decryptLegacy(passphrase, salt, iv, headers, data, legacyArgon2, true)
      )
      shamirShare = classifyPrefixedShare(message)
    } else {
      // Hardware access lives in computeBlockKdfKey — with a slot, the key
      // comes from the derived key binding the passphrase and the YubiKey
      // response (see src/utilities/core/block.ts). Headered payloads
      // ship at v2 cost — or paranoid cost, trialed only when the mode is
      // on (wrong passphrases stay fast for everyone else, and paranoid
      // blocks report a wrong passphrase until the mode is enabled). The
      // released v1 population is the legacy payload shape above
      const profiles = [v2StandardKdfProfile]
      if (paranoid === true) {
        profiles.push(v2ParanoidKdfProfile)
      }
      let decrypted: null | Buffer = null
      for (const profile of profiles) {
        const kdfKey = await computeBlockKdfKey(
          passphrase,
          salt,
          profile,
          slot === undefined
            ? undefined
            : { onTouchRequired: broadcastYubiKeyTouchRequired, slot: slot }
        )
        // The key that authenticates names the message type — block keys
        // encrypt plain secrets, blockset keys encrypt shares
        const blockMessage = tryDecrypt(deriveBlockKey(kdfKey), data)
        if (blockMessage !== null) {
          decrypted = blockMessage
          break
        }
        const blocksetMessage = tryDecrypt(deriveBlocksetKey(kdfKey), data)
        if (blocksetMessage !== null) {
          decrypted = blocksetMessage
          shamirShare = blocksetMessage
          break
        }
      }
      if (decrypted === null) {
        throw new Error("Secret not found")
      }
      message = decodeVersionedMessage(decrypted)
      if (shamirShare !== null) {
        shamirShare = message
      }
    }
    if (shamirShare !== null) {
      const accumulatedShares = shamirShares ?? getShamirShares()
      if (!duplicateShamirShare(accumulatedShares, shamirShare)) {
        accumulatedShares.push(shamirShare)
      }
      const secret = await combineShares(accumulatedShares)
      restoreReset()
      return {
        message: secret.toString(),
        success: true,
      }
    } else {
      return {
        message: message.toString(),
        success: true,
      }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not restore block",
      success: false,
      unsupportedVersion:
        error instanceof UnsupportedVersionError ? true : undefined,
      yubikeyErrorCode: error instanceof YubiKeyError ? error.code : undefined,
    }
  }
}
