import { BrowserWindow, ipcMain } from "electron"

import { ErrorCorrection } from "qr"

import {
  v2ParanoidKdfProfile,
  v2StandardKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"
import { PdfToJpegResult } from "@/src/shared/utilities/pdfToJpeg"
import {
  blockSize,
  computeBlockKdfKey,
  deriveBlockKey,
  deriveBlocksetKey,
  encodeBlockMessage,
  qrCodeEcc,
} from "@/src/utilities/core/block"
import {
  Secret as BlockSecret,
  encrypt,
} from "@/src/utilities/crypto/fixedSizeEncryption"
import {
  generateSalt,
  hash,
  shortHash,
} from "@/src/utilities/crypto/primitives"
import { generateShares } from "@/src/utilities/crypto/shamir"
import broadcastYubiKeyTouchRequired from "@/src/utilities/yubikey/broadcastTouchRequired"
import {
  Slot,
  YubiKeyError,
  YubiKeyErrorCode,
} from "@/src/utilities/yubikey/otp"

declare const BLOCK_WINDOW_PRELOAD_WEBPACK_ENTRY: string
declare const BLOCK_WINDOW_WEBPACK_ENTRY: string

export interface Secret {
  message: string
  passphrase: string
  // Optional YubiKey slot binding the passphrase and the YubiKey response
  // into a derived key (see computeBlockKdfKey in src/utilities/core/block.ts) —
  // standard blocks only, never blocksets
  slot?: Slot
}

// Internal to the Shamir path — a share-carrying secret whose message is the
// raw share bytes, unlike the string messages of the renderer-facing Secret
interface ShareSecret {
  message: Buffer
  passphrase: string
}

interface ShamirBlockSecret {
  [index: number]: ShareSecret[]
}

export interface Metadata {
  label?: string
}

export interface Payload {
  salt: string
  data: string
  metadata: Metadata
}

// Legacy payloads (legacy fixed-size encryption) carry iv and headers as
// well — their presence is how restoration tells the formats apart. Kept
// separate from Payload so legacy support can be removed cleanly.
export interface LegacyPayload {
  salt: string
  iv: string
  headers: string
  data: string
  metadata: Metadata
}

export interface Qr {
  // Scanned payloads flow back through duplication, so a Qr may carry either
  // format
  payload: Payload | LegacyPayload
  hash: string
  shortHash: string
  label?: string
  jpg: string
  pdf: string
  copies: number
}

export interface Data {
  payloadText: string
  ecc: ErrorCorrection
  shortHash: string
  label?: string
  /** When set, render the print layout (block + trim marks) scaled by this factor. */
  printScale?: number
  /** When set, pad the print page to this media size (inches) and center the block. */
  printMedia?: { width: number; height: number }
}

export type Result =
  | {
      error: string
      success: false
      // Present when the failure belongs to the YubiKey step — the code
      // routes error display (see src/shared/utilities/yubikeyErrorMessage.ts)
      yubikeyErrorCode?: YubiKeyErrorCode
    }
  | { qrs: Qr[]; success: true }

const readyIpcMessage = async (blockWindow: BrowserWindow): Promise<void> => {
  return new Promise((resolve) => {
    const listener = (event: Electron.IpcMainEvent) => {
      if (event.sender === blockWindow.webContents) {
        ipcMain.removeListener("ready", listener)
        resolve()
      }
    }
    ipcMain.on("ready", listener)
  })
}

const jpegIpcMessage = async (
  blockWindow: BrowserWindow
): Promise<PdfToJpegResult> => {
  return new Promise((resolve) => {
    const listener = (event: Electron.IpcMainEvent, jpeg: PdfToJpegResult) => {
      if (event.sender === blockWindow.webContents) {
        ipcMain.removeListener("jpeg", listener)
        resolve(jpeg)
      }
    }
    ipcMain.on("jpeg", listener)
  })
}

const blockWindowSize = { width: 384, height: 576 } // 4x6in at 96dpi

// Render block data to a PDF in an offscreen window. The window is returned
// open so the caller can also derive a JPEG from it; the caller must close it.
const renderToPdf = async (
  data: Data,
  size: { width: number; height: number }
): Promise<{ blockWindow: BrowserWindow; pdfBuffer: Buffer }> => {
  const blockWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    darkTheme: false,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true, // default, see https://www.electronjs.org/docs/latest/tutorial/security#3-enable-context-isolation
      nodeIntegration: false, // default, see https://www.electronjs.org/docs/latest/tutorial/security#3-enable-context-isolation
      nodeIntegrationInWorker: false, // default, see https://www.electronjs.org/docs/latest/tutorial/security#3-enable-context-isolation
      offscreen: true,
      preload: BLOCK_WINDOW_PRELOAD_WEBPACK_ENTRY,
      sandbox: true,
    },
    show: false,
  })
  await blockWindow.loadURL(BLOCK_WINDOW_WEBPACK_ENTRY)
  blockWindow.webContents.send("dataChange", data)
  await readyIpcMessage(blockWindow)
  const pdfBuffer = await blockWindow.webContents.printToPDF({
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
  })
  return { blockWindow, pdfBuffer }
}

export const compute = async (
  payload: Payload | LegacyPayload,
  label?: string
): Promise<Qr> => {
  const payloadText = JSON.stringify(payload, null, 2)
  const payloadHash = hash(payloadText)
  const payloadShortHash = shortHash(payloadText)
  const data: Data = {
    payloadText: payloadText,
    ecc: qrCodeEcc,
    shortHash: payloadShortHash,
    label: label,
  }
  const { blockWindow, pdfBuffer } = await renderToPdf(data, blockWindowSize)
  const pdf = pdfBuffer.toString("base64")
  blockWindow.webContents.send("pdfToJpeg", pdfBuffer)
  const jpeg = await jpegIpcMessage(blockWindow)
  blockWindow.close()
  return {
    payload: payload,
    hash: payloadHash,
    shortHash: payloadShortHash,
    label: label,
    jpg: jpeg.dataUrl.replace("data:image/jpeg;base64,", ""),
    pdf: pdf,
    copies: 1,
  }
}

// Render a print-only PDF (4x6 block + trim marks) on demand — generated only
// when the user prints, not for every block and not when only saving. The
// caller supplies the scale (1 = true size; > 1 compensates driver shrink).
export const renderCarrierPdf = async (
  payload: Payload | LegacyPayload,
  label: string | undefined,
  mediaSize: { width: number; height: number },
  scale = 1
): Promise<string> => {
  const payloadText = JSON.stringify(payload, null, 2)
  const data: Data = {
    payloadText: payloadText,
    ecc: qrCodeEcc,
    shortHash: shortHash(payloadText),
    label: label,
    printScale: scale,
    printMedia: mediaSize,
  }
  // The page is the sheet; the block is centered on it with a white margin.
  const size = {
    width: Math.round(mediaSize.width * 96), // px at 96dpi
    height: Math.round(mediaSize.height * 96),
  }
  const { blockWindow, pdfBuffer } = await renderToPdf(data, size)
  blockWindow.close()
  return pdfBuffer.toString("base64")
}

// Derives one key per secret from its passphrase and the block’s salt
// (computeBlockKdfKey — sequentially, so each YubiKey-protected secret
// costs its own challenge-response round-trip and touch — then the backup
// type’s HKDF domain key so restoration classifies messages by which key
// authenticates), then encrypts all secrets into a single fixed-size
// block. Exported for the pipeline tests — the create handler wraps it
// with QR rendering, which requires a live window
export const encryptBlock = async (
  secrets: (Secret | ShareSecret)[],
  blockset: boolean,
  paranoid: boolean,
  label?: string
): Promise<Payload> => {
  const salt = generateSalt()
  const saltBase64 = salt.toString("base64")
  const blockSecrets: BlockSecret[] = []
  for (const secret of secrets) {
    const slot = "slot" in secret ? secret.slot : undefined
    const kdfKey = await computeBlockKdfKey(
      secret.passphrase,
      salt,
      paranoid === true ? v2ParanoidKdfProfile : v2StandardKdfProfile,
      slot === undefined
        ? undefined
        : { onTouchRequired: broadcastYubiKeyTouchRequired, slot: slot }
    )
    blockSecrets.push({
      key: blockset ? deriveBlocksetKey(kdfKey) : deriveBlockKey(kdfKey),
      message: encodeBlockMessage(secret.message),
    })
  }
  return {
    salt: saltBase64,
    data: encrypt(blockSecrets, blockSize).toString("base64"),
    metadata: {
      label: label,
    },
  }
}

// Validation shared by the handler and the pipeline tests — the handler
// itself renders blocks in a live window, so the guards live where tests
// can reach them
export const validateCreate = (
  secrets: Secret[],
  shamir?: boolean,
  numberOfShares?: number,
  threshold?: number
): void => {
  if (
    shamir === true &&
    (typeof numberOfShares !== "number" ||
      typeof threshold !== "number" ||
      threshold > numberOfShares)
  ) {
    throw new Error("Invalid number of shares or threshold")
  }
  // YubiKey protection is offered for standard blocks only — the app
  // never sends a slot for blocksets
  if (shamir === true && secrets.some((secret) => secret.slot !== undefined)) {
    throw new Error("YubiKey protection is not supported for blocksets")
  }
}

export default async function create(
  secrets: Secret[],
  label: string | undefined,
  paranoid: boolean,
  shamir: true,
  numberOfShares: number,
  threshold: number
): Promise<Result>
export default async function create(
  secrets: Secret[],
  label?: string,
  paranoid?: boolean,
  shamir?: false
): Promise<Result>
export default async function create(
  secrets: Secret[],
  label?: string,
  paranoid = false,
  shamir?: boolean,
  numberOfShares?: number,
  threshold?: number
): Promise<Result> {
  try {
    validateCreate(secrets, shamir, numberOfShares, threshold)
    const qrs = []
    if (shamir === true) {
      const shamirBlockSecrets: ShamirBlockSecret = {}
      for (const secret of secrets) {
        const shares = await generateShares(
          secret.message,
          numberOfShares,
          threshold
        )
        for (const [index, share] of shares.entries()) {
          const shareSecret: ShareSecret = {
            message: share,
            passphrase: secret.passphrase,
          }
          if (shamirBlockSecrets[index]) {
            shamirBlockSecrets[index].push(shareSecret)
          } else {
            shamirBlockSecrets[index] = [shareSecret]
          }
        }
      }
      for (const shamirBlockSecret of Object.values(shamirBlockSecrets)) {
        const payload = await encryptBlock(
          shamirBlockSecret,
          true,
          paranoid,
          label
        )
        const qr = await compute(payload, label)
        qrs.push(qr)
      }
    } else {
      const payload = await encryptBlock(secrets, false, paranoid, label)
      const qr = await compute(payload, label)
      qrs.push(qr)
    }
    return {
      qrs: qrs,
      success: true,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not create block",
      success: false,
      yubikeyErrorCode: error instanceof YubiKeyError ? error.code : undefined,
    }
  }
}
