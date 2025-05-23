import { decrypt } from "blockcrypt"
import { Payload } from "./create"
import argon2 from "./utilities/argon2"
import { concatenatePassphrases } from "./utilities/crypto"
import { combineShares } from "./utilities/shamir"

export interface Result {
  error: string
  message: string
}

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
        error: null,
        message: secret.toString(),
      }
    } else {
      return {
        error: null,
        message: message.toString(),
      }
    }
  } catch (error) {
    if (error.message.match(/header not found/i)) {
      restoreReset()
    }
    return {
      error: error.message,
      message: null,
    }
  }
}
