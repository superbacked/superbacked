import {
  isYubiKeySecret,
  yubikeySecretLength,
} from "@/src/shared/yubikeySecret"
import { refineYubiKeyError } from "@/src/utilities/yubikey/management"
import {
  Slot,
  YubiKeyError,
  YubiKeyErrorCode,
  getStatus,
  verifyHmacSha1,
} from "@/src/utilities/yubikey/otp"

export type VerifyYubiKeyChallengeResponseSecretResult =
  | { success: false; error: string; yubikeyErrorCode?: YubiKeyErrorCode }
  // slot null — connected YubiKey has no slot provisioned with the
  // secret (unprovisioned slots included)
  | { success: true; slot: null | Slot }

/**
 * Verify which slot of the connected YubiKey is provisioned with a
 * challenge-response secret, computing the response on the key —
 * touch-required slots prompt once per challenged slot
 * @param secret 40-hexadecimal-character slot secret
 * @param onTouchRequired called while the device awaits touch
 * @returns matching slot, or null when no provisioned slot matches
 */
export const verifyYubiKeyChallengeResponseSecret = async (
  secret: string,
  onTouchRequired?: () => void
): Promise<VerifyYubiKeyChallengeResponseSecretResult> => {
  if (isYubiKeySecret(secret) === false) {
    return {
      success: false,
      error: `Secret must be ${yubikeySecretLength} hexadecimal characters`,
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
