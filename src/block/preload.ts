import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron"

import { Data } from "@/src/create"
import { Locale } from "@/src/i18n"

export interface BlockApi {
  locale: () => Locale
  platform: string
  dataChange: (callback: (data: Data) => void) => () => void
  ready: () => void
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
}

contextBridge.exposeInMainWorld("blockApi", blockApi)
