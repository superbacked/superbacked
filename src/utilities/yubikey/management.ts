import { randomBytes } from "crypto"

import { HIDAsync, devicesAsync } from "node-hid"

import { YubiKeyError, asYubiKeyError } from "@/src/utilities/yubikey/otp"

// YubiKey management application over the FIDO HID interface — this mirrors
// the reference implementation in yubikey-manager (yubikit/management.py,
// with the CTAPHID framing of python-fido2). The management application is
// exposed on every enabled interface and the firmware refuses to disable
// them all, so when the OTP interface is off a sibling interface can read
// the device configuration and turn OTP back on.

const yubicoVendorId = 0x1050

// The FIDO application sits on its own HID interface (FIDO alliance usage
// page) and is driven through full 64-byte input/output reports — unlike
// the OTP interface, which uses feature reports
const fidoUsagePage = 0xf1d0
const fidoUsage = 0x01

// A CTAPHID message is an initialization packet — channel (4, big-endian),
// command with the initialization bit, payload length (2, big-endian),
// payload — followed by continuation packets: channel, sequence, payload
const reportSize = 64
const initializationFlag = 0x80
const initializationPayloadSize = reportSize - 7
const continuationPayloadSize = reportSize - 5

// Channel allocation happens on the broadcast channel
const broadcastChannel = 0xffffffff

// CTAPHID commands
const initCommand = 0x06
const keepaliveCommand = 0x3b
const errorCommand = 0x3f
// Yubico vendor commands carrying the management application
const readConfigCommand = 0x42
const writeConfigCommand = 0x43

// INIT response: nonce echo (8), allocated channel (4), CTAPHID protocol
// version (1), device version (3) and capabilities (1)
const initNonceSize = 8
const initResponseSize = 17

// Device configuration TLV tags
const usbSupportedTag = 0x01
const usbEnabledTag = 0x03
const versionTag = 0x05
const configurationLockTag = 0x0a
const rebootTag = 0x0c

// USB application capability flags (CAPABILITY in the reference
// implementation) — only OTP is acted on here
const otpCapabilityFlag = 0x01

// Per-application USB configuration requires firmware 5 — earlier keys
// switch whole interface modes through a different command
const usbConfigurableMajor = 5

const readTimeout = 1000

const findFidoDevicePath = async (): Promise<string> => {
  const devices = await devicesAsync()
  const matches = devices.filter(
    (device) =>
      device.vendorId === yubicoVendorId &&
      device.usagePage === fidoUsagePage &&
      device.usage === fidoUsage
  )
  if (matches.length === 0) {
    // Collapses into the communication code — callers fall back to manual
    // instructions when management is unreachable
    throw new Error("No YubiKey FIDO interface detected")
  }
  if (matches.length > 1) {
    throw new YubiKeyError(
      "multipleDevices",
      "Multiple YubiKeys detected — keep only one connected"
    )
  }
  const path = matches[0]?.path
  if (path === undefined) {
    throw new Error("Could not resolve YubiKey FIDO device path")
  }
  return path
}

// hidapi convention: the leading byte of every output report is the report
// id (0 for devices without numbered reports, such as YubiKeys)
const writeReport = async (device: HIDAsync, packet: Buffer): Promise<void> => {
  await device.write(Buffer.concat([Buffer.from([0]), packet]))
}

const readReport = async (device: HIDAsync): Promise<Buffer> => {
  const report = await device.read(readTimeout)
  if (report === undefined || report.length === 0) {
    throw new Error("Timed out waiting for YubiKey FIDO interface")
  }
  return Buffer.from(report)
}

const sendRequest = async (
  device: HIDAsync,
  channel: number,
  command: number,
  payload: Buffer
): Promise<void> => {
  const first = Buffer.alloc(reportSize)
  first.writeUInt32BE(channel, 0)
  first.writeUInt8(command | initializationFlag, 4)
  first.writeUInt16BE(payload.length, 5)
  payload.copy(first, 7, 0, initializationPayloadSize)
  await writeReport(device, first)
  let sequence = 0
  for (
    let offset = initializationPayloadSize;
    offset < payload.length;
    offset += continuationPayloadSize
  ) {
    const packet = Buffer.alloc(reportSize)
    packet.writeUInt32BE(channel, 0)
    packet.writeUInt8(sequence, 4)
    payload.copy(packet, 5, offset, offset + continuationPayloadSize)
    await writeReport(device, packet)
    sequence++
  }
}

const receiveResponse = async (
  device: HIDAsync,
  channel: number,
  command: number
): Promise<Buffer> => {
  for (;;) {
    const report = await readReport(device)
    // Every open handle sees the device's input reports — traffic for other
    // channels and stray continuations of aborted exchanges are skipped
    if (report.length < 7 || report.readUInt32BE(0) !== channel) {
      continue
    }
    const commandByte = report.readUInt8(4)
    if ((commandByte & initializationFlag) === 0) {
      continue
    }
    const responseCommand = commandByte & ~initializationFlag
    if (responseCommand === keepaliveCommand) {
      continue
    }
    if (responseCommand === errorCommand) {
      throw new Error(
        `CTAPHID error 0x${report.readUInt8(7).toString(16).padStart(2, "0")}`
      )
    }
    if (responseCommand !== command) {
      throw new Error(
        `Unexpected CTAPHID response command 0x${responseCommand.toString(16)}`
      )
    }
    const length = report.readUInt16BE(5)
    const first = report.subarray(
      7,
      7 + Math.min(length, initializationPayloadSize)
    )
    const chunks = [first]
    let received = first.length
    let sequence = 0
    while (received < length) {
      const continuation = await readReport(device)
      if (continuation.length < 5 || continuation.readUInt32BE(0) !== channel) {
        continue
      }
      const sequenceByte = continuation.readUInt8(4)
      if ((sequenceByte & initializationFlag) !== 0) {
        throw new Error("Unexpected CTAPHID initialization packet")
      }
      if (sequenceByte !== sequence) {
        throw new Error("Out-of-sequence CTAPHID packet")
      }
      const chunk = continuation.subarray(
        5,
        5 + Math.min(length - received, continuationPayloadSize)
      )
      chunks.push(chunk)
      received += chunk.length
      sequence++
    }
    return Buffer.concat(chunks)
  }
}

// Concurrent clients share the broadcast channel — the nonce ties the
// allocation response to this request
const openChannel = async (device: HIDAsync): Promise<number> => {
  const nonce = randomBytes(initNonceSize)
  await sendRequest(device, broadcastChannel, initCommand, nonce)
  for (;;) {
    const response = await receiveResponse(
      device,
      broadcastChannel,
      initCommand
    )
    if (
      response.length >= initResponseSize &&
      response.subarray(0, initNonceSize).equals(nonce)
    ) {
      return response.readUInt32BE(initNonceSize)
    }
  }
}

const transact = async (command: number, payload: Buffer): Promise<Buffer> => {
  // As on the OTP interface, exclusive access is not required — reports
  // still reach a non-exclusive handle and other clients stay functional
  const device = await HIDAsync.open(await findFidoDevicePath(), {
    nonExclusive: true,
  })
  try {
    const channel = await openChannel(device)
    await sendRequest(device, channel, command, payload)
    return await receiveResponse(device, channel, command)
  } finally {
    await device.close()
  }
}

export interface DeviceInfo {
  configurationLocked: boolean
  firmwareVersion: string
  otpSupported: boolean
  usbConfigurable: boolean
  usbEnabledFlags: number
}

// Capability masks are 1 or 2 bytes big-endian depending on firmware
const readCapabilityFlags = (value: Buffer | undefined): number => {
  if (value === undefined || value.length === 0) {
    return 0
  }
  return value.readUIntBE(0, value.length)
}

/**
 * Parse device configuration page (exported for tests)
 * @param response length-prefixed TLV structure returned by READ_CONFIG
 * @returns device info
 */
export const parseDeviceInfo = (response: Buffer): DeviceInfo => {
  if (response.length < 1 || response.readUInt8(0) !== response.length - 1) {
    throw new Error("Malformed device info")
  }
  const values = new Map<number, Buffer>()
  let offset = 1
  while (offset < response.length) {
    if (offset + 2 > response.length) {
      throw new Error("Malformed device info")
    }
    const tag = response.readUInt8(offset)
    const length = response.readUInt8(offset + 1)
    if (offset + 2 + length > response.length) {
      throw new Error("Malformed device info")
    }
    values.set(tag, response.subarray(offset + 2, offset + 2 + length))
    offset += 2 + length
  }
  const version = values.get(versionTag)
  if (version?.length !== 3) {
    throw new Error("Malformed device info")
  }
  return {
    configurationLocked: values.get(configurationLockTag)?.readUInt8(0) === 1,
    firmwareVersion: [0, 1, 2]
      .map((index) => version.readUInt8(index))
      .join("."),
    otpSupported:
      (readCapabilityFlags(values.get(usbSupportedTag)) & otpCapabilityFlag) !==
      0,
    usbConfigurable: version.readUInt8(0) >= usbConfigurableMajor,
    usbEnabledFlags: readCapabilityFlags(values.get(usbEnabledTag)),
  }
}

/**
 * Build length-prefixed configuration enabling the OTP application over USB
 * (exported for tests)
 * @param usbEnabledFlags currently enabled USB applications
 * @returns WRITE_CONFIG payload
 */
export const buildEnableOtpConfiguration = (
  usbEnabledFlags: number
): Buffer => {
  // Reference TLV order (DeviceConfig.get_bytes): reboot first, then the
  // updated flags encoded on 2 bytes — rebooting re-enumerates the key with
  // the OTP interface present
  const flags = usbEnabledFlags | otpCapabilityFlag
  const body = Buffer.from([
    rebootTag,
    0,
    usbEnabledTag,
    2,
    (flags >> 8) & 0xff,
    flags & 0xff,
  ])
  return Buffer.concat([Buffer.from([body.length]), body])
}

/**
 * Read YubiKey device configuration over the FIDO interface
 * @returns device info
 */
export const readDeviceInfo = async (): Promise<DeviceInfo> => {
  try {
    return parseDeviceInfo(await transact(readConfigCommand, Buffer.from([0])))
  } catch (error) {
    throw asYubiKeyError(error)
  }
}

/**
 * Refine an OTP-interface-disabled error by probing the management
 * application over FIDO (present by construction whenever that code is
 * raised) — a model without the OTP application (Bio and Security Key
 * series) reports otpNotSupported instead, and a second connected key
 * surfaces as multipleDevices. When the probe fails, the original
 * error stands, so refinement can only sharpen reporting, never
 * degrade it.
 * @param error caught error
 * @returns refined or original error
 */
export const refineYubiKeyError = async (error: unknown): Promise<unknown> => {
  if (error instanceof YubiKeyError && error.code === "otpInterfaceDisabled") {
    try {
      const info = await readDeviceInfo()
      if (info.otpSupported === false) {
        return new YubiKeyError(
          "otpNotSupported",
          "YubiKey does not support OTP challenge-response (Bio and Security Key series)"
        )
      }
    } catch (probeError) {
      if (
        probeError instanceof YubiKeyError &&
        probeError.code === "multipleDevices"
      ) {
        return probeError
      }
    }
  }
  return error
}

/**
 * Enable the OTP application over USB, rebooting the YubiKey — the key
 * drops off the bus and re-enumerates with the OTP interface present
 */
export const enableOtp = async (): Promise<void> => {
  try {
    const info = parseDeviceInfo(
      await transact(readConfigCommand, Buffer.from([0]))
    )
    await transact(
      writeConfigCommand,
      buildEnableOtpConfiguration(info.usbEnabledFlags)
    )
  } catch (error) {
    throw asYubiKeyError(error)
  }
}
