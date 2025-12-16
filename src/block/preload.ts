import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron"

import { Data } from "@/src/create"
import { Locale } from "@/src/i18n"
import { PdfToJpegResult } from "@/src/shared/utilities/pdfToJpeg"

export interface BlockApi {
  locale: () => Locale
  platform: string
  dataChange: (callback: (data: Data) => void) => () => void
  ready: () => void
  pdfToJpeg: (
    callback: (pdfBuffer: ArrayBuffer) => Promise<PdfToJpegResult>
  ) => () => void
}

const blockApi: BlockApi = {
  locale: () => {
    return ipcRenderer.sendSync("app:getLocale")
  },
  platform: process.platform,
  dataChange: (callback) => {
    const listener = (_event: IpcRendererEvent, data: Data) => {
      callback(data)
    }
    ipcRenderer.on("dataChange", listener)
    return () => {
      ipcRenderer.removeListener("dataChange", listener)
    }
  },
  ready: () => {
    ipcRenderer.send("ready")
  },
  pdfToJpeg: (
    callback: (pdfBuffer: ArrayBuffer) => Promise<PdfToJpegResult>
  ) => {
    const listener = async (
      _event: IpcRendererEvent,
      pdfBuffer: ArrayBuffer
    ) => {
      const jpeg = await callback(pdfBuffer)
      ipcRenderer.send("jpeg", jpeg)
    }
    ipcRenderer.on("pdfToJpeg", listener)
    return () => {
      ipcRenderer.removeListener("pdfToJpeg", listener)
    }
  },
}

contextBridge.exposeInMainWorld("blockApi", blockApi)
