import { IpcRendererEvent, contextBridge, ipcRenderer } from "electron"

import { Data } from "@/src/handlers/create"
import { Locale } from "@/src/i18n"
import { createEventListener } from "@/src/shared/utilities/createEventListener"
import { PdfToJpegResult } from "@/src/shared/utilities/pdfToJpeg"
import { invokeSync } from "@/src/utilities/invokeSync"

/**
 * Block window API exposed to renderer process via contextBridge.
 * Available as `window.blockApi` in renderer context.
 */
export interface BlockApi {
  /** Subscribe to block window events. */
  events: {
    /** Subscribe to data change events. */
    dataChange: (callback: (data: Data) => void) => () => void
    /** Subscribe to PDF to JPEG conversion requests. */
    pdfToJpeg: (
      callback: (pdfBuffer: ArrayBuffer) => Promise<PdfToJpegResult>
    ) => () => void
  }
  /** Invoke synchronous IPC handlers in main process. */
  invokeSync: {
    /** Get current locale. */
    getLocale: () => Locale
  }
  /** Signal block window is ready. */
  ready: () => void
  /** Current platform (darwin or linux). */
  platform: NodeJS.Platform
}

const blockApi: BlockApi = {
  events: {
    dataChange: createEventListener("dataChange"),
    pdfToJpeg: (callback) => {
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
  },
  invokeSync: {
    getLocale: invokeSync("getLocale"),
  },
  ready: () => {
    ipcRenderer.send("ready")
  },
  platform: process.platform,
}

contextBridge.exposeInMainWorld("blockApi", blockApi)
