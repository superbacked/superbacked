import { LegacyPayload, Payload } from "@/src/handlers/create"
import {
  DetachedArchive,
  describeDetachedArchive,
} from "@/src/handlers/detachedArchive"
import {
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/kdfProfiles"
import { decodeBlockContent, decryptBlock } from "@/src/utilities/core/block"
import {
  combineBlocksetShares,
  decodeBlocksetShare,
} from "@/src/utilities/core/blockset"
import { decryptLegacyBlock } from "@/src/utilities/core/legacy/block"
import { classifyPrefixedShare } from "@/src/utilities/core/legacy/blockset"
import { UnsupportedVersionError } from "@/src/utilities/crypto/schemeHeader"
import { getSenderWebContents } from "@/src/utilities/ipc/handleContext"
import broadcastYubiKeyTouchRequired from "@/src/utilities/yubikey/broadcastTouchRequired"
import { refineYubiKeyError } from "@/src/utilities/yubikey/management"
import {
  Slot,
  YubiKeyError,
  YubiKeyErrorCode,
} from "@/src/utilities/yubikey/otp"

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
  | {
      // Present when the block content carries a master key — what the
      // renderer needs to prompt for the paired detached archive (see
      // src/handlers/detachedArchive.ts)
      detachedArchive?: DetachedArchive
      message: string
      success: true
    }

// Unwrap the block content into the secret and, when a master key is
// present, the detached archive description — plain (non-JSON) messages
// are the secret itself
const assembleSuccess = (
  blockContent: string,
  legacy: boolean
): Extract<Result, { success: true }> => {
  const { secret } = decodeBlockContent(blockContent)
  const detachedArchive = describeDetachedArchive(blockContent, legacy)
  if (detachedArchive === null) {
    return { message: secret, success: true }
  }
  return {
    detachedArchive: detachedArchive,
    message: secret,
    success: true,
  }
}

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
    const legacyPayload = "iv" in payload && "headers" in payload
    let message: Buffer
    let shamirShare: null | Buffer = null
    if ("iv" in payload && "headers" in payload) {
      if (slot !== undefined) {
        // Legacy blocks predate YubiKey protection — the switch cannot
        // apply, so it fails exactly like a wrong passphrase
        throw new Error("Secret not found")
      }
      message = await decryptLegacyBlock(
        passphrase,
        salt,
        Buffer.from(payload.iv, "base64"),
        Buffer.from(payload.headers, "base64"),
        data
      )
      shamirShare = classifyPrefixedShare(message)
    } else {
      // Headered payloads ship at standard cost — or paranoid cost,
      // trialed only when the mode is on (wrong passphrases stay fast for
      // everyone else, and paranoid blocks report a wrong passphrase
      // until the mode is enabled). The released v1 population is the
      // legacy payload shape above
      const profiles = [standardKdfProfile]
      if (paranoid === true) {
        profiles.push(paranoidKdfProfile)
      }
      const decrypted = await decryptBlock(
        passphrase,
        salt,
        data,
        profiles,
        slot === undefined
          ? undefined
          : { onTouchRequired: broadcastYubiKeyTouchRequired, slot: slot }
      )
      message = decrypted.message
      if (decrypted.share === true) {
        // The share carries the blockset scheme version at its head —
        // read only now that the domain key has named the type (see
        // src/utilities/core/blockset.ts)
        shamirShare = decodeBlocksetShare(message)
      }
    }
    if (shamirShare !== null) {
      const accumulatedShares = shamirShares ?? getShamirShares()
      if (!duplicateShamirShare(accumulatedShares, shamirShare)) {
        accumulatedShares.push(shamirShare)
      }
      const secret = await combineBlocksetShares(accumulatedShares)
      restoreReset()
      return assembleSuccess(secret, legacyPayload)
    } else {
      return assembleSuccess(message.toString(), legacyPayload)
    }
  } catch (caughtError) {
    const error = await refineYubiKeyError(caughtError)
    return {
      error: error instanceof Error ? error.message : "Could not restore block",
      success: false,
      unsupportedVersion:
        error instanceof UnsupportedVersionError ? true : undefined,
      yubikeyErrorCode: error instanceof YubiKeyError ? error.code : undefined,
    }
  }
}
