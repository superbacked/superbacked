import { isUtf8 } from "buffer"

import { LegacyPayload, Payload } from "@/src/handlers/create"
import argon2 from "@/src/utilities/argon2"
import { deriveBlockKey, deriveBlocksetKey } from "@/src/utilities/block"
import { decrypt } from "@/src/utilities/fixedSizeEncryption"
import { getSenderWebContents } from "@/src/utilities/handleContext"
import { decrypt as decryptLegacy } from "@/src/utilities/legacyFixedSizeEncryption"
import { combineShares } from "@/src/utilities/shamir"

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

export type Result =
  { error: string; success: false } | { message: string; success: true }

export default async (
  passphrase: string,
  payload: Payload | LegacyPayload
): Promise<Result> => {
  try {
    const salt = Buffer.from(payload.salt, "base64")
    const data = Buffer.from(payload.data, "base64")
    let message: Buffer
    let shamirShare: null | Buffer = null
    if ("iv" in payload && "headers" in payload) {
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
        argon2
      ).catch(() =>
        // Try legacy mode (blocks created before HKDF subkeys)
        decryptLegacy(passphrase, salt, iv, headers, data, argon2, true)
      )
      shamirShare = classifyPrefixedShare(message)
    } else {
      const kdfKey = await argon2(passphrase, payload.salt)
      // The key that authenticates names the message type — block keys
      // encrypt plain secrets, blockset keys encrypt shares
      const blockMessage = tryDecrypt(deriveBlockKey(kdfKey), data)
      if (blockMessage !== null) {
        message = blockMessage
      } else {
        const blocksetMessage = tryDecrypt(deriveBlocksetKey(kdfKey), data)
        if (blocksetMessage === null) {
          throw new Error("Secret not found")
        }
        message = blocksetMessage
        shamirShare = blocksetMessage
      }
    }
    if (shamirShare !== null) {
      const shamirShares = getShamirShares()
      if (!duplicateShamirShare(shamirShares, shamirShare)) {
        shamirShares.push(shamirShare)
      }
      const secret = await combineShares(shamirShares)
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
    }
  }
}
