import { BrowserWindow, ipcMain } from "electron"

import { Secret as BlockcryptSecret, encrypt } from "blockcrypt"

import { PdfToJpegResult } from "@/src/shared/utilities/pdfToJpeg"
import argon2 from "@/src/utilities/argon2"
import { concatenatePassphrases, hash, shortHash } from "@/src/utilities/crypto"
import { generateShares } from "@/src/utilities/shamir"

declare const BLOCK_WINDOW_PRELOAD_WEBPACK_ENTRY: string
declare const BLOCK_WINDOW_WEBPACK_ENTRY: string

export interface Secret {
  message: string
  passphrases: string[]
}

export interface ShamirBlockcryptSecret {
  [index: number]: BlockcryptSecret[]
}

export interface Metadata {
  label?: string
  challenge?: string
}

export interface Payload {
  salt: string
  iv: string
  headers: string
  data: string
  metadata: Metadata
}

export interface Qr {
  payload: Payload
  hash: string
  shortHash: string
  label?: string
  jpg: string
  pdf: string
  copies: number
}

export interface Data {
  payloadText: string
  shortHash: string
  label?: string
}

export type Result =
  | { error: string; success: false }
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

export const compute = async (
  payload: Payload,
  label?: string
): Promise<Qr> => {
  const payloadText = JSON.stringify(payload, null, 2)
  const payloadHash = hash(payloadText)
  const payloadShortHash = shortHash(payloadText)
  const data: Data = {
    payloadText: payloadText,
    shortHash: payloadShortHash,
    label: label,
  }
  const windowWidth = 384
  const windowHeight = 576
  const blockWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
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

export default async function create(
  secrets: Secret[],
  dataLength: number,
  label: string | undefined,
  shamir: true,
  numberOfShares: number,
  threshold: number
): Promise<Result>
export default async function create(
  secrets: Secret[],
  dataLength: number,
  label?: string,
  shamir?: false
): Promise<Result>
export default async function create(
  secrets: Secret[],
  dataLength: number,
  label?: string,
  shamir?: boolean,
  numberOfShares?: number,
  threshold?: number
): Promise<Result> {
  try {
    if (
      shamir === true &&
      (typeof numberOfShares !== "number" ||
        typeof threshold !== "number" ||
        threshold > numberOfShares)
    ) {
      throw new Error("Invalid number of shares or threshold")
    }
    const qrs = []
    if (shamir === true) {
      const shamirBlockcryptSecrets: ShamirBlockcryptSecret = {}
      for (const secret of secrets) {
        const shares = await generateShares(
          secret.message,
          numberOfShares,
          threshold
        )
        for (const [index, share] of shares.entries()) {
          const blockcryptSecret = {
            message: Buffer.concat([Buffer.from("shamir:"), share]),
            passphrase: concatenatePassphrases(secret.passphrases),
          }
          if (shamirBlockcryptSecrets[index]) {
            shamirBlockcryptSecrets[index].push(blockcryptSecret)
          } else {
            shamirBlockcryptSecrets[index] = [blockcryptSecret]
          }
        }
      }
      for (const shamirBlockcryptSecret of Object.values(
        shamirBlockcryptSecrets
      )) {
        const block = await encrypt(
          shamirBlockcryptSecret,
          argon2,
          48,
          dataLength
        )
        const payload: Payload = {
          salt: block.salt.toString("base64"),
          iv: block.iv.toString("base64"),
          headers: block.headers.toString("base64"),
          data: block.data.toString("base64"),
          metadata: {
            label: label,
          },
        }
        const qr = await compute(payload, label)
        qrs.push(qr)
      }
    } else {
      const blockcryptSecrets: BlockcryptSecret[] = []
      for (const secret of secrets) {
        blockcryptSecrets.push({
          message: secret.message,
          passphrase: concatenatePassphrases(secret.passphrases),
        })
      }
      const block = await encrypt(blockcryptSecrets, argon2, 48, dataLength)
      const payload: Payload = {
        salt: block.salt.toString("base64"),
        iv: block.iv.toString("base64"),
        headers: block.headers.toString("base64"),
        data: block.data.toString("base64"),
        metadata: {
          label: label,
        },
      }
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
    }
  }
}
