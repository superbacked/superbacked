import { createHmac, randomBytes, timingSafeEqual } from "crypto"

import { Device, HIDAsync, devicesAsync } from "node-hid"

import sleep from "@/src/utilities/sleep"

// YubiKey HMAC-SHA1 challenge-response over the OTP HID interface. Yubico
// does not document the wire protocol — this mirrors the reference
// implementation in yubikey-manager (yubikit/core/otp.py and
// yubikit/yubiotp.py). Challenge-response reads and HMAC-SHA1 slot
// configuration writes (which return an updated status instead of a data
// frame) are implemented.

const yubicoVendorId = 0x1050

// The OTP application lives on the keyboard interface (usage page 0x01,
// usage 0x06) and is driven exclusively through 8-byte HID feature reports
// (7 payload bytes + 1 status/sequence byte) — the interrupt endpoint only
// types OTPs
const otpUsagePage = 0x01
const otpUsage = 0x06

const featureReportSize = 8
const featureReportDataSize = featureReportSize - 1

const slotDataSize = 64

// Status/sequence byte flags
const slotWriteFlag = 0x80
const responsePendingFlag = 0x40
const responseTimeoutWaitFlag = 0x20
const sequenceMask = 0x1f

// A report whose status byte has every flag set aborts the pending
// operation and clears the device's read state
const resetStateFlags = 0xff

// Slot commands
const configureSlot1 = 0x01
const configureSlot2 = 0x03
const writeScanMap = 0x12
const challengeHmacSlot1 = 0x30
const challengeHmacSlot2 = 0x38

const hmacChallengeSize = 64
const hmacResponseSize = 20
const hmacSecretSize = 20

// Slot configuration structure: fixed data (16), private id (6), AES key
// (16), new access code (6), fixed data length (1), extended, ticket and
// configuration flags (3), reserved (2) and little-endian CRC (2). An
// HMAC-SHA1 secret spans the key field and the start of the private id
const configurationSize = 52
const configurationUidOffset = 16
const configurationKeyOffset = 22
const configurationKeySize = 16
const configurationExtendedFlagsOffset = 45
const configurationTicketFlagsOffset = 46
const configurationFlagsOffset = 47
const configurationCrcOffset = 50

// Extended flags
const serialApiVisibleExtendedFlag = 0x04
const allowUpdateExtendedFlag = 0x20

// Ticket flags
const challengeResponseTicketFlag = 0x40

// Configuration flags
const challengeHmacConfigurationFlag = 0x22
const hmacLessThan64ConfigurationFlag = 0x04
const challengeButtonConfigurationFlag = 0x08

// Status report: firmware version at bytes 1 to 3, programming sequence at
// byte 4 and per-slot valid flags in the low touch-level byte at byte 5
const firmwareVersionOffset = 1
const programmingSequenceOffset = 4
const touchLevelOffset = 5
const slot1ValidFlag = 0x01
const slot2ValidFlag = 0x02

// CRC-16/ISO-13239 (polynomial 0x8408 reflected, initial value 0xffff) — a
// buffer followed by its own little-endian CRC always leaves this residual
const crcOkResidual = 0xf0b8

// Exported for tests
export const calculateCrc = (data: Buffer): number => {
  let crc = 0xffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      // Branchless select — challenge and response bytes are secrets, so
      // the carry must not steer a branch (best effort, as JavaScript
      // cannot guarantee constant time)
      crc = (crc >> 1) ^ (0x8408 & -(crc & 1))
    }
  }
  return crc
}

const matchesOtpInterface = (device: Device): boolean => {
  if (device.vendorId !== yubicoVendorId) {
    return false
  }
  if (device.usagePage !== undefined && device.usage !== undefined) {
    return device.usagePage === otpUsagePage && device.usage === otpUsage
  }
  // Platforms where hidapi cannot read the usage fall back to the interface
  // number — the OTP application always sits on interface 0
  return device.interface === 0
}

// User-actionable failures carry a code the app and the command-line
// interface resolve into user-facing text through the en locale (see
// src/shared/utilities/yubikeyErrorMessage.ts and
// src/cli/utilities/localeText.ts) —
// low-level failures collapse into the communication code (see
// asYubiKeyError below)
export type YubiKeyErrorCode =
  | "communication"
  | "multipleDevices"
  | "noDevice"
  | "notProvisioned"
  | "provisioningRejected"
  | "touchTimeout"

export class YubiKeyError extends Error {
  code: YubiKeyErrorCode
  constructor(code: YubiKeyErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = "YubiKeyError"
    this.code = code
    this.cause = cause
  }
}

// Every error escaping the public functions below is a YubiKeyError, so
// both surfaces resolve the same code into the same wording — the message
// carried here serves logs, cause chains and codes without a locale key,
// with low-level failures collapsed into one, preserving the underlying
// error as cause
const asYubiKeyError = (error: unknown): YubiKeyError => {
  if (error instanceof YubiKeyError) {
    return error
  }
  return new YubiKeyError(
    "communication",
    "Could not communicate with YubiKey",
    error
  )
}

const findDevicePath = async (): Promise<string> => {
  const devices = await devicesAsync()
  const matches = devices.filter(matchesOtpInterface)
  if (matches.length === 0) {
    throw new YubiKeyError("noDevice", "No YubiKey detected")
  }
  if (matches.length > 1) {
    throw new YubiKeyError(
      "multipleDevices",
      "Multiple YubiKeys detected — keep only one connected"
    )
  }
  const path = matches[0]?.path
  if (path === undefined) {
    throw new Error("Could not resolve YubiKey device path")
  }
  return path
}

// hidapi convention: the leading byte of every feature report is the report
// id (0 for devices without numbered reports, such as YubiKeys)
const receive = async (device: HIDAsync): Promise<Buffer> => {
  const report = Buffer.from(
    await device.getFeatureReport(0, featureReportSize + 1)
  )
  const data = report.subarray(1)
  if (data.length !== featureReportSize) {
    throw new Error(`Incorrect feature report size: ${data.length}`)
  }
  return data
}

const send = async (device: HIDAsync, data: Buffer): Promise<void> => {
  if (data.length !== featureReportSize) {
    throw new Error(`Feature report must be ${featureReportSize} bytes`)
  }
  await device.sendFeatureReport(Buffer.concat([Buffer.from([0]), data]))
}

// Wait for up to ~1 second for the device to clear the write flag
const awaitReadyToWrite = async (device: HIDAsync): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const report = await receive(device)
    if ((report.readUInt8(featureReportDataSize) & slotWriteFlag) === 0) {
      return
    }
    await sleep(50)
  }
  throw new Error("Timed out waiting for YubiKey to become ready to receive")
}

// A frame is 70 bytes — payload, slot command, little-endian CRC of the
// payload and 3 filler bytes — sent as 10 packets of 7 bytes, each tagged
// with the write flag and its sequence number. All-zero packets are skipped
// (the device reconstructs them), except the first and last which delimit
// the frame
const sendFrame = async (
  device: HIDAsync,
  slotCommand: number,
  payload: Buffer
): Promise<void> => {
  const frame = Buffer.alloc(slotDataSize + 6)
  payload.copy(frame)
  frame.writeUInt8(slotCommand, slotDataSize)
  frame.writeUInt16LE(calculateCrc(payload), slotDataSize + 1)
  const packetCount = frame.length / featureReportDataSize
  for (let sequence = 0; sequence < packetCount; sequence++) {
    const packet = frame.subarray(
      sequence * featureReportDataSize,
      (sequence + 1) * featureReportDataSize
    )
    if (
      sequence === 0 ||
      sequence === packetCount - 1 ||
      packet.some((byte) => byte !== 0)
    ) {
      await awaitReadyToWrite(device)
      await send(
        device,
        Buffer.concat([packet, Buffer.from([slotWriteFlag | sequence])])
      )
    }
  }
}

// Signal the device to stop sending and clear its read state
const resetState = async (device: HIDAsync): Promise<void> => {
  const report = Buffer.alloc(featureReportSize)
  report.writeUInt8(resetStateFlags, featureReportDataSize)
  await send(device, report)
}

const readFrame = async (
  device: HIDAsync,
  onTouchRequired?: () => void
): Promise<Buffer> => {
  const chunks: Buffer[] = []
  let sequence = 0
  let touchRequired = false
  for (;;) {
    const report = await receive(device)
    const statusByte = report.readUInt8(featureReportDataSize)
    if ((statusByte & responsePendingFlag) !== 0) {
      if ((statusByte & sequenceMask) === sequence) {
        chunks.push(report.subarray(0, featureReportDataSize))
        sequence++
      } else if ((statusByte & sequenceMask) === 0) {
        // Sequence wrapped back to 0 — transmission complete
        await resetState(device)
        return Buffer.concat(chunks)
      }
    } else if (statusByte === 0) {
      if (chunks.length > 0) {
        throw new Error("Incomplete transfer")
      }
      if (touchRequired === true) {
        throw new YubiKeyError("touchTimeout", "YubiKey touch timed out")
      }
      // A rejected challenge (status 0, no response frames) means the slot
      // has no HMAC-SHA1 challenge-response credential
      throw new YubiKeyError(
        "notProvisioned",
        "YubiKey slot not provisioned for challenge-response"
      )
    } else {
      // Device is busy — either computing or waiting for touch (the device
      // itself times out after ~15 seconds, ending the wait)
      if ((statusByte & responseTimeoutWaitFlag) !== 0) {
        if (touchRequired === false) {
          touchRequired = true
          if (onTouchRequired) {
            onTouchRequired()
          }
        }
        await sleep(100)
      } else {
        await sleep(20)
      }
    }
  }
}

// Challenge-response and its slot configuration require firmware 2.2 or
// later; the per-slot valid flags require 2.1
const assertFirmwareVersion = (
  status: Buffer,
  major: number,
  minor: number,
  feature: string
): void => {
  const deviceMajor = status.readUInt8(firmwareVersionOffset)
  const deviceMinor = status.readUInt8(firmwareVersionOffset + 1)
  if (deviceMajor < major || (deviceMajor === major && deviceMinor < minor)) {
    throw new Error(
      `${feature} requires YubiKey firmware ${major}.${minor} or later`
    )
  }
}

export type Slot = 1 | 2

// A challenge-response request as higher layers carry it — the slot to
// challenge and the notice invoked while the device awaits touch
export interface ChallengeResponseOptions {
  onTouchRequired?: () => void
  slot: Slot
}

/**
 * Compute HMAC-SHA1 challenge-response on YubiKey
 * @param slot slot provisioned for HMAC-SHA1 challenge-response
 * @param challenge challenge (1 to 64 bytes)
 * @param onTouchRequired called once if the slot requires touch
 * @returns 20-byte HMAC-SHA1 response
 */
export const calculateHmacSha1 = async (
  slot: Slot,
  challenge: Buffer,
  onTouchRequired?: () => void
): Promise<Buffer> => {
  if (challenge.length < 1 || challenge.length > hmacChallengeSize) {
    throw new Error(`Challenge must be 1 to ${hmacChallengeSize} bytes`)
  }
  try {
    // Seizing the keyboard interface requires elevated input permissions
    // on macOS — feature reports work without exclusive access
    const device = await HIDAsync.open(await findDevicePath(), {
      nonExclusive: true,
    })
    try {
      // Idle reads return a status report
      const status = await receive(device)
      assertFirmwareVersion(status, 2, 2, "Challenge-response")
      // In HMAC_LT64 mode (the standard challenge-response configuration)
      // the device recovers the challenge length by stripping trailing
      // copies of the final byte, so the pad byte must differ from the
      // last challenge byte
      const lastByte = challenge.readUInt8(challenge.length - 1)
      const payload = Buffer.alloc(slotDataSize, lastByte === 0 ? 1 : 0)
      challenge.copy(payload)
      await sendFrame(
        device,
        slot === 1 ? challengeHmacSlot1 : challengeHmacSlot2,
        payload
      )
      const response = await readFrame(device, onTouchRequired)
      if (response.length < hmacResponseSize + 2) {
        throw new Error("Response too short")
      }
      // The response is 20 bytes followed by its CRC
      const checked = response.subarray(0, hmacResponseSize + 2)
      if (calculateCrc(checked) !== crcOkResidual) {
        throw new Error("Invalid response CRC")
      }
      return response.subarray(0, hmacResponseSize)
    } finally {
      await device.close()
    }
  } catch (error) {
    throw asYubiKeyError(error)
  }
}

/**
 * Verify that a slot is configured with a secret — a slot secret can
 * never be read back, so the slot is challenged with fresh randomness
 * and its response compared against the one the secret predicts (a
 * fresh challenge proves the key computes rather than replays)
 * @param slot slot provisioned for HMAC-SHA1 challenge-response
 * @param secret 20-byte slot secret
 * @param onTouchRequired called once if the slot requires touch
 * @returns whether the slot response matches the secret
 */
export const verifyHmacSha1 = async (
  slot: Slot,
  secret: Buffer,
  onTouchRequired?: () => void
): Promise<boolean> => {
  const challenge = randomBytes(32)
  const expected = createHmac("sha1", secret).update(challenge).digest()
  const response = await calculateHmacSha1(slot, challenge, onTouchRequired)
  return (
    response.length === expected.length &&
    timingSafeEqual(response, expected) === true
  )
}

export interface Status {
  firmwareVersion: string
  slot1Provisioned: boolean
  slot2Provisioned: boolean
}

/**
 * Read YubiKey status
 * @returns firmware version and which slots are provisioned
 */
export const getStatus = async (): Promise<Status> => {
  try {
    const device = await HIDAsync.open(await findDevicePath(), {
      nonExclusive: true,
    })
    try {
      const status = await receive(device)
      assertFirmwareVersion(status, 2, 1, "Reading slot status")
      const touchLevel = status.readUInt8(touchLevelOffset)
      return {
        firmwareVersion: [0, 1, 2]
          .map((offset) => status.readUInt8(firmwareVersionOffset + offset))
          .join("."),
        slot1Provisioned: (touchLevel & slot1ValidFlag) !== 0,
        slot2Provisioned: (touchLevel & slot2ValidFlag) !== 0,
      }
    } finally {
      await device.close()
    }
  } catch (error) {
    throw asYubiKeyError(error)
  }
}

/**
 * Build 52-byte slot configuration for HMAC-SHA1 challenge-response
 * (exported for tests)
 * @param secret 20-byte HMAC-SHA1 secret
 * @param requireTouch whether computing responses requires touch
 * @returns slot configuration
 */
export const buildHmacSha1Configuration = (
  secret: Buffer,
  requireTouch: boolean
): Buffer => {
  if (secret.length !== hmacSecretSize) {
    throw new Error(`Secret must be ${hmacSecretSize} bytes`)
  }
  const configuration = Buffer.alloc(configurationSize)
  // The secret spans two fields: bytes 0 to 15 land in the AES key field,
  // bytes 16 to 19 at the start of the private id (fixed data, access code,
  // fixed data length and reserved bytes stay zero)
  secret.copy(configuration, configurationKeyOffset, 0, configurationKeySize)
  secret.copy(configuration, configurationUidOffset, configurationKeySize)
  configuration.writeUInt8(
    serialApiVisibleExtendedFlag | allowUpdateExtendedFlag,
    configurationExtendedFlagsOffset
  )
  configuration.writeUInt8(
    challengeResponseTicketFlag,
    configurationTicketFlagsOffset
  )
  configuration.writeUInt8(
    challengeHmacConfigurationFlag |
      hmacLessThan64ConfigurationFlag |
      (requireTouch === true ? challengeButtonConfigurationFlag : 0),
    configurationFlagsOffset
  )
  // The structure CRC is stored complemented — unlike the frame CRC — which
  // leaves the residual over the full structure
  configuration.writeUInt16LE(
    ~calculateCrc(configuration.subarray(0, configurationCrcOffset)) & 0xffff,
    configurationCrcOffset
  )
  return configuration
}

// A configuration write returns an updated status report instead of a data
// frame — success is the programming sequence incrementing (a single byte,
// wrapping at 255). The reference implementation also accepts a reset to 0,
// which only deleting the last configuration produces — provisioning always
// leaves the written slot valid, so only an increment counts here
const awaitConfigurationWrite = async (
  device: HIDAsync,
  previousSequence: number
): Promise<void> => {
  for (;;) {
    const report = await receive(device)
    const statusByte = report.readUInt8(featureReportDataSize)
    if ((statusByte & responsePendingFlag) !== 0) {
      await resetState(device)
      throw new Error("Unexpected data response while provisioning")
    }
    if (statusByte === 0) {
      const sequence = report.readUInt8(programmingSequenceOffset)
      if (sequence === ((previousSequence + 1) & 0xff)) {
        return
      }
      // Coded so the message survives the communication collapse — the
      // access-code hint is the actionable part
      throw new YubiKeyError(
        "provisioningRejected",
        "Provisioning rejected (is the slot protected by an access code?)"
      )
    }
    // Device is busy applying the write
    await sleep(20)
  }
}

// A NEO (firmware 3.x) may report a programming sequence cached by its
// arbitrator before it went stale — following the reference implementation,
// writing an invalid scan map (which the device rejects, changing nothing)
// forces the applet to refresh it
const refreshProgrammingSequence = async (device: HIDAsync): Promise<void> => {
  const payload = Buffer.alloc(slotDataSize)
  payload.fill("c", 0, 51)
  await sendFrame(device, writeScanMap, payload)
  try {
    await readFrame(device)
  } catch {
    // Rejection is the expected outcome
  }
}

/**
 * Provision slot for HMAC-SHA1 challenge-response, overwriting its current
 * configuration
 * @param slot slot to provision
 * @param secret 20-byte HMAC-SHA1 secret
 * @param requireTouch whether computing responses requires touch
 */
export const provisionHmacSha1 = async (
  slot: Slot,
  secret: Buffer,
  requireTouch = false
): Promise<void> => {
  // Validation errors (secret size) stay specific — only device
  // communication collapses
  const configuration = buildHmacSha1Configuration(secret, requireTouch)
  try {
    const device = await HIDAsync.open(await findDevicePath(), {
      nonExclusive: true,
    })
    try {
      let status = await receive(device)
      assertFirmwareVersion(status, 2, 2, "Challenge-response")
      if (status.readUInt8(firmwareVersionOffset) === 3) {
        await refreshProgrammingSequence(device)
        status = await receive(device)
      }
      // The frame payload is the configuration followed by the current
      // access code — left zero, as access-code-protected slots are not
      // supported (the device rejects the write, leaving the slot
      // untouched)
      const payload = Buffer.alloc(slotDataSize)
      configuration.copy(payload)
      await sendFrame(
        device,
        slot === 1 ? configureSlot1 : configureSlot2,
        payload
      )
      await awaitConfigurationWrite(
        device,
        status.readUInt8(programmingSequenceOffset)
      )
    } finally {
      await device.close()
    }
  } catch (error) {
    throw asYubiKeyError(error)
  }
}
