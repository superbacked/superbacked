import { randomBytes } from "crypto"

import {
  isYubiKeySecret,
  normalizeYubiKeySecret,
  yubikeySecretLength,
  yubikeySecretSize,
} from "@/src/shared/yubikeySecret"
import sleep from "@/src/utilities/sleep"
import {
  DeviceInfo,
  enableOtp,
  readDeviceInfo,
  refineYubiKeyError,
} from "@/src/utilities/yubikey/management"
import {
  Slot,
  Status,
  YubiKeyError,
  YubiKeyErrorCode,
  getStatus,
  provisionHmacSha1,
  verifyHmacSha1,
} from "@/src/utilities/yubikey/otp"

// Slot provisioning shared by the app route and the command-line command
// (see src/main/routes/ProvisionYubiKey.tsx and
// src/cli/provisionYubikey.ts) — both confirm the irreversible steps on
// their own surface and call in here for the hardware work. Results carry
// YubiKey failures as codes, so the app renders its translated messages
// and the command-line interface rethrows them.

/**
 * Parse a slot secret as entered (see src/shared/yubikeySecret.ts)
 * @param value 40-hexadecimal-character secret
 * @returns 20-byte secret
 */
export const parseYubiKeySecret = (value: string): Buffer => {
  const normalized = normalizeYubiKeySecret(value)
  if (isYubiKeySecret(normalized) === false) {
    throw new Error(
      `Secret must be ${yubikeySecretLength} hexadecimal characters (${yubikeySecretSize} bytes)`
    )
  }
  return Buffer.from(normalized, "hex")
}

/**
 * Generate a slot secret for the app’s provisioning route — the
 * command-line command generates inside provisionYubiKey instead, as it
 * displays the secret only after the write
 * @returns 40-hexadecimal-character secret
 */
export const generateYubiKeySecret = (): string => {
  return randomBytes(yubikeySecretSize).toString("hex")
}

// Yubico’s product names, as slugs: the series takes a “c” for USB-C, then
// the variant — keychain keys carry “nfc” when they have the interface,
// the Lightning key is the “i” model and the rest name themselves
const modelSlug = (info: DeviceInfo): string => {
  const series = info.firmwareVersion.split(".")[0] ?? ""
  switch (info.formFactor) {
    case "usbAKeychain":
      return info.nfcSupported === true ? `${series}-nfc` : series
    case "usbCKeychain":
      return info.nfcSupported === true ? `${series}c-nfc` : `${series}c`
    case "usbANano":
      return `${series}-nano`
    case "usbCNano":
      return `${series}c-nano`
    case "usbCLightning":
      return `${series}ci`
    case "usbABio":
      return `${series}-bio`
    case "usbCBio":
      return `${series}c-bio`
    case null:
      return series
  }
}

/**
 * Block label for a backup of the slot secret — Yubico’s product name and
 * the serial number as a slug (for example yubikey-5c-nfc-12345678),
 * naming the key the backup belongs to
 * @param info device info
 * @returns label
 */
export const yubikeyLabel = (info: DeviceInfo): string => {
  return [
    "yubikey",
    modelSlug(info),
    info.fips === true ? "fips" : null,
    info.serialNumber,
  ]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join("-")
}

export type YubiKeyProvisioningFailure = {
  success: false
  error: string
  yubikeyErrorCode?: YubiKeyErrorCode
}

const failure = async (
  caughtError: unknown
): Promise<YubiKeyProvisioningFailure> => {
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
    error:
      error instanceof Error ? error.message : "Could not provision YubiKey",
  }
}

/**
 * Read which slots of the connected YubiKey are provisioned
 * @returns status, or failure
 */
export const getYubiKeyStatus = async (): Promise<
  YubiKeyProvisioningFailure | { success: true; status: Status }
> => {
  try {
    return { success: true, status: await getStatus() }
  } catch (error) {
    return failure(error)
  }
}

/**
 * Check whether the OTP interface of the connected YubiKey can be enabled
 * in place — the management application remains reachable over the FIDO
 * interface (the firmware refuses to disable every interface). Reports
 * the detection failure whenever management is unreachable (FIDO also
 * disabled, missing permissions, pre-5 firmware)
 * @returns success, or failure naming why enabling is impossible
 */
export const canEnableYubiKeyOtp = async (): Promise<
  YubiKeyProvisioningFailure | { success: true }
> => {
  const detectionFailure: YubiKeyProvisioningFailure = {
    success: false,
    error: "YubiKey detected but OTP interface is disabled",
    yubikeyErrorCode: "otpInterfaceDisabled",
  }
  let info: DeviceInfo
  try {
    info = await readDeviceInfo()
  } catch (error) {
    if (error instanceof YubiKeyError && error.code === "multipleDevices") {
      return failure(error)
    }
    return detectionFailure
  }
  if (info.otpSupported === false) {
    return {
      success: false,
      error:
        "YubiKey does not support OTP challenge-response (Bio and Security Key series)",
      yubikeyErrorCode: "otpNotSupported",
    }
  }
  if (info.configurationLocked === true) {
    return {
      success: false,
      error: "YubiKey configuration protected by a lock code",
      yubikeyErrorCode: "configurationLocked",
    }
  }
  if (info.usbConfigurable === false) {
    return detectionFailure
  }
  return { success: true }
}

/**
 * Enable the OTP interface and wait for the YubiKey to return — the key
 * drops off the bus to re-enumerate with the OTP interface (restart takes
 * a few seconds)
 * @returns status once the key is back, or failure
 */
export const enableYubiKeyOtpInterface = async (): Promise<
  YubiKeyProvisioningFailure | { success: true; status: Status }
> => {
  try {
    await enableOtp()
  } catch (error) {
    return failure(error)
  }
  let lastError: unknown = new YubiKeyError(
    "otpInterfaceDisabled",
    "YubiKey detected but OTP interface is disabled"
  )
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(250)
    try {
      return { success: true, status: await getStatus() }
    } catch (error) {
      lastError = error
    }
  }
  return failure(lastError)
}

/**
 * Read the connected YubiKey’s model as a block label for a backup of its
 * secret (see yubikeyLabel) — the app’s provisioning route calls this
 * after the write, and a failure surfaces there with its cause logged
 * here, as management is reachable only over the FIDO interface
 * @returns label, or failure
 */
export const readYubiKeyModel = async (): Promise<
  YubiKeyProvisioningFailure | { success: true; label: string }
> => {
  // The read follows the slot write and its verification — the key has
  // been seen to answer slowly right after a write, and a request given
  // up on stays in flight, so attempts are few and spaced a second apart
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return { success: true, label: yubikeyLabel(await readDeviceInfo()) }
    } catch (error) {
      // The cause names the transport failure (no FIDO interface listed, a
      // CTAPHID timeout or an error reply) that the code collapses
      console.error(`Could not read YubiKey model (attempt ${attempt})`, error)
      lastError = error
      await sleep(1000)
    }
  }
  return failure(lastError)
}

/**
 * Provision a slot for HMAC-SHA1 challenge-response and verify the write
 * end to end by challenging the slot and recomputing the response locally
 * @param slot slot to provision
 * @param secret 40-hexadecimal-character secret, or null to generate one
 * @param requireTouch whether computing responses requires touch
 * @param onTouchRequired called while the device awaits touch
 * @returns the programmed secret, or failure
 */
export const provisionYubiKey = async (
  slot: Slot,
  secret: null | string,
  requireTouch: boolean,
  onTouchRequired?: () => void
): Promise<YubiKeyProvisioningFailure | { success: true; secret: string }> => {
  let key: Buffer
  try {
    key =
      secret === null
        ? randomBytes(yubikeySecretSize)
        : parseYubiKeySecret(secret)
  } catch (error) {
    return failure(error)
  }
  try {
    await provisionHmacSha1(slot, key, requireTouch)
    const verified = await verifyHmacSha1(slot, key, onTouchRequired)
    if (verified === false) {
      // Coded like every other YubiKey failure, so both surfaces resolve
      // the same message from the en locale
      throw new YubiKeyError(
        "verificationFailed",
        "YubiKey verification failed — slot response does not match secret"
      )
    }
  } catch (error) {
    return failure(error)
  }
  return { success: true, secret: key.toString("hex") }
}
