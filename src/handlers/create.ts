import { BrowserWindow, ipcMain } from "electron"

import { ErrorCorrection } from "qr"

import {
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/kdfProfiles"
import { PdfToJpegResult } from "@/src/shared/utilities/pdfToJpeg"
import {
  Metadata,
  Payload,
  Secret,
  encryptBlock,
  qrCodeEcc,
} from "@/src/utilities/core/block"
import { encryptBlockset } from "@/src/utilities/core/blockset"
import { LegacyPayload } from "@/src/utilities/core/legacy/block"
import { hash, shortHash } from "@/src/utilities/crypto/primitives"
import broadcastYubiKeyTouchRequired from "@/src/utilities/yubikey/broadcastTouchRequired"
import { refineYubiKeyError } from "@/src/utilities/yubikey/management"
import { YubiKeyError, YubiKeyErrorCode } from "@/src/utilities/yubikey/otp"

// LegacyPayload is re-exported so renderer and consumer imports stay off
// the legacy modules — and dies with them when legacy support is removed
export type { LegacyPayload, Metadata, Payload, Secret }

declare const BLOCK_WINDOW_PRELOAD_WEBPACK_ENTRY: string
declare const BLOCK_WINDOW_WEBPACK_ENTRY: string

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
    const profile = paranoid === true ? paranoidKdfProfile : standardKdfProfile
    const payloads =
      shamir === true
        ? await encryptBlockset(
            secrets,
            numberOfShares as number,
            threshold as number,
            profile,
            label,
            broadcastYubiKeyTouchRequired
          )
        : [
            await encryptBlock(
              secrets,
              false,
              profile,
              label,
              broadcastYubiKeyTouchRequired
            ),
          ]
    const qrs = []
    for (const payload of payloads) {
      qrs.push(await compute(payload, label))
    }
    return {
      qrs: qrs,
      success: true,
    }
  } catch (caughtError) {
    const error = await refineYubiKeyError(caughtError)
    return {
      error: error instanceof Error ? error.message : "Could not create block",
      success: false,
      yubikeyErrorCode: error instanceof YubiKeyError ? error.code : undefined,
    }
  }
}
