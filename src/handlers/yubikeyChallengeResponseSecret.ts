import { refineYubiKeyError } from "@/src/utilities/yubikey/management"
import {
  Slot,
  YubiKeyError,
  YubiKeyErrorCode,
  getStatus,
  verifyHmacSha1,
} from "@/src/utilities/yubikey/otp"

// 20-byte HMAC-SHA1 slot secret, the size provisioning programs (see
// src/cli/provisionYubikey.ts) — rendered as hexadecimal, the format
// the extraction pipeline recognizes (see
// src/main/utilities/extraction.ts)
const secretSize = 20

export type VerifyYubiKeyChallengeResponseSecretResult =
  | { success: false; error: string; yubikeyErrorCode?: YubiKeyErrorCode }
  // slot null — connected YubiKey has no slot configured with the
  // secret (unprovisioned slots included)
  | { success: true; slot: Slot | null }

/**
 * Verify which slot of the connected YubiKey is configured with a
 * challenge-response secret, computing the response on the key —
 * touch-required slots prompt once per challenged slot
 * @param secret 40-hexadecimal-character slot secret
 * @param onTouchRequired called while the device awaits touch
 * @returns matching slot, or null when no configured slot matches
 */
export const verifyYubiKeyChallengeResponseSecret = async (
  secret: string,
  onTouchRequired?: () => void
): Promise<VerifyYubiKeyChallengeResponseSecretResult> => {
  if (new RegExp(`^[0-9a-fA-F]{${secretSize * 2}}$`).test(secret) === false) {
    return {
      success: false,
      error: `Secret must be ${secretSize * 2} hexadecimal characters`,
    }
  }
  const key = Buffer.from(secret, "hex")
  try {
    const status = await getStatus()
    // Slot 2 first — the provisioning default, so the common case
    // costs one touch
    const slots: Slot[] = [2, 1]
    for (const slot of slots) {
      const provisioned =
        slot === 1 ? status.slot1Provisioned : status.slot2Provisioned
      if (provisioned === false) {
        continue
      }
      if ((await verifyHmacSha1(slot, key, onTouchRequired)) === true) {
        return { success: true, slot: slot }
      }
    }
    return { success: true, slot: null }
  } catch (caughtError) {
    const error = await refineYubiKeyError(caughtError)
    if (error instanceof YubiKeyError) {
      return {
        success: false,
        error: error.message,
        yubikeyErrorCode: error.code,
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not verify",
    }
  }
}
