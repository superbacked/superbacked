import { contextBridge, ipcRenderer } from "electron"
import { Data } from "../create"
import { Locale } from "../i18n"

export interface BlockApi {
  locale: () => Locale
  platform: string
  data: () => Data
  ready: () => void
  pdf: (callback: (buffer: Buffer) => void) => void
  jpg: (data: string) => void
}

let data: Data

ipcRenderer.on("data", (_event, _data: typeof data) => {
  data = _data
})

const blockApi: BlockApi = {
  locale: () => {
    return ipcRenderer.sendSync("app:getLocale")
  },
  platform: process.platform,
  data: () => {
    return data
  },
  ready: () => {
    ipcRenderer.send("ready")
  },
  pdf: (callback) => {
    ipcRenderer.on("pdf", (_event, buffer) => {
      callback(buffer)
    })
  },
  jpg: (data: string) => {
    ipcRenderer.send("jpg", data)
  },
}

contextBridge.exposeInMainWorld("blockApi", blockApi)
