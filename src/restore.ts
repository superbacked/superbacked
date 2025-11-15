import { decrypt } from "blockcrypt"

import { Payload } from "@/src/create"
import argon2 from "@/src/utilities/argon2"
import { concatenatePassphrases } from "@/src/utilities/crypto"
import { combineShares } from "@/src/utilities/shamir"

const shamirShares: Buffer[] = []

const duplicateShamirShare = (additionalShamirShare: Buffer) => {
  for (const shamirShare of shamirShares) {
    if (Buffer.compare(shamirShare, additionalShamirShare) === 0) {
      return true
    }
  }
  return false
}

export const restoreReset = () => {
  shamirShares.length = 0
}

export type Result =
  | { message: string; success: true }
  | { error: string; success: false }

export default async (
  passphrases: string[],
  payload: Payload
): Promise<Result> => {
  try {
    const concatenatedPassphrases = concatenatePassphrases(passphrases)
    const salt = Buffer.from(payload.salt, "base64")
    const iv = Buffer.from(payload.iv, "base64")
    const headers = Buffer.from(payload.headers, "base64")
    const data = Buffer.from(payload.data, "base64")
    const message = await decrypt(
      concatenatedPassphrases,
      salt,
      iv,
      headers,
      data,
      argon2
    ).catch(() =>
      // Try legacy mode
      decrypt(concatenatedPassphrases, salt, iv, headers, data, argon2, true)
    )
    const shamirBuffer = Buffer.from("shamir:")
    const shamirBufferLength = shamirBuffer.length
    if (
      Buffer.compare(message.subarray(0, shamirBufferLength), shamirBuffer) ===
      0
    ) {
      const shamirShare = message.subarray(shamirBufferLength)
      if (!duplicateShamirShare(shamirShare)) {
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
