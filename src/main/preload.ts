import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron"

import { getDataLength } from "blockcrypt"

import create, { Result as CreateResult } from "@/src/create"
import duplicate, { Result as DuplicateResult } from "@/src/duplicate"
import { Locale } from "@/src/i18n"
import { GetDesktopCapturerSourcesResult } from "@/src/index"
import { disableModes, enableModes } from "@/src/menu"
import openExternalUrl from "@/src/openExternalUrl"
import restore, { restoreReset, Result as RestoreResult } from "@/src/restore"
import {
  generateMnemonic,
  validateMnemonic,
  wordlist,
} from "@/src/utilities/bip39"
import { ColorScheme } from "@/src/utilities/config"
import generatePassphrase from "@/src/utilities/passphrase"
import {
  getDefaultPrinter,
  getPrinters,
  getPrinterStatus,
  print,
  Printer,
  PrinterStatus,
} from "@/src/utilities/print"
import save from "@/src/utilities/save"
import { generateToken } from "@/src/utilities/totp"

export type InsertType = "mnemonic" | "passphrase"

export type State = "standby"

export interface Api {
  colorSchemeChange: (
    callback: (colorScheme: ColorScheme) => void
  ) => () => void
  colorScheme: () => ColorScheme
  localeChange: (callback: (locale: Locale) => void) => () => void
  locale: () => Locale
  getDesktopCapturerSources: () => Promise<GetDesktopCapturerSourcesResult>
  platform: NodeJS.Platform
  version: () => number
  openExternalUrl: typeof openExternalUrl
  enableModes: (...args: Parameters<typeof enableModes>) => void
  disableModes: (...args: Parameters<typeof disableModes>) => void
  toggleMaximize: () => void
  menuAbout: (callback: () => void) => () => void
  menuTriggeredRoute: (callback: (to: string) => void) => () => void
  menuInsert: (callback: (type: InsertType) => void) => () => void
  menuShowHiddenSecrets: (callback: (type: boolean) => void) => () => void
  menuGetShowHiddenSecretsState: () => boolean
  menuShowSelectionAsQrCode: (callback: () => void) => () => void
  enteredFullScreen: (callback: () => void) => () => void
  leftFullScreen: (callback: () => void) => () => void
  generateMnemonic: typeof generateMnemonic
  validateMnemonic: typeof validateMnemonic
  getDataLength: typeof getDataLength
  wordlist: () => typeof wordlist
  generatePassphrase: typeof generatePassphrase
  create: typeof create
  duplicate: typeof duplicate
  getDefaultPrinter: typeof getDefaultPrinter
  getPrinters: typeof getPrinters
  getPrinterStatus: typeof getPrinterStatus
  print: typeof print
  save: typeof save
  generateToken: typeof generateToken
  restore: typeof restore
  restoreReset: typeof restoreReset
}

const api: Api = {
  colorSchemeChange: (callback) => {
    const listener = (_event: IpcRendererEvent, colorScheme: ColorScheme) => {
      callback(colorScheme)
    }
    ipcRenderer.on("theme:colorSchemeChanged", listener)
    return () => {
      ipcRenderer.removeListener("theme:colorSchemeChanged", listener)
    }
  },
  colorScheme: () => {
    return ipcRenderer.sendSync("theme:getColorScheme")
  },
  localeChange: (callback) => {
    const listener = (_event: IpcRendererEvent, locale: Locale) => {
      callback(locale)
    }
    ipcRenderer.on("app:localeChange", listener)
    return () => {
      ipcRenderer.removeListener("app:localeChange", listener)
    }
  },
  locale: () => {
    return ipcRenderer.sendSync("app:getLocale")
  },
  getDesktopCapturerSources: async () => {
    const result: GetDesktopCapturerSourcesResult = await ipcRenderer.invoke(
      "desktopCapturer:getDesktopCapturerSources"
    )
    return result
  },
  platform: process.platform,
  version: () => {
    return ipcRenderer.sendSync("app:getVersion")
  },
  openExternalUrl: (...args) => {
    return ipcRenderer.invoke("app:openExternalUrl", ...args)
  },
  enableModes: (...args) => {
    return ipcRenderer.invoke("menu:enableModes", ...args)
  },
  disableModes: (...args) => {
    return ipcRenderer.invoke("menu:disableModes", ...args)
  },
  toggleMaximize: () => {
    return ipcRenderer.invoke("window:toggleMaximize")
  },
  menuAbout: (callback) => {
    const listener = () => {
      callback()
    }
    ipcRenderer.on("menu:about", listener)
    return () => {
      ipcRenderer.removeListener("menu:about", listener)
    }
  },
  menuTriggeredRoute: (callback) => {
    const listener = (_event: IpcRendererEvent, to: string) => {
      callback(to)
    }
    ipcRenderer.on("menu:triggeredRoute", listener)
    return () => {
      ipcRenderer.removeListener("menu:triggeredRoute", listener)
    }
  },
  menuInsert: (callback) => {
    const listener = (_event: IpcRendererEvent, type: InsertType) => {
      callback(type)
    }
    ipcRenderer.on("menu:insert", listener)
    return () => {
      ipcRenderer.removeListener("menu:insert", listener)
    }
  },
  menuShowHiddenSecrets: (callback) => {
    const listener = (_event: IpcRendererEvent, state: boolean) => {
      callback(state)
    }
    ipcRenderer.on("menu:showHiddenSecrets", listener)
    return () => {
      ipcRenderer.removeListener("menu:showHiddenSecrets", listener)
    }
  },
  menuGetShowHiddenSecretsState: () => {
    return ipcRenderer.sendSync("app:getShowHiddenSecretsState")
  },
  menuShowSelectionAsQrCode: (callback) => {
    const listener = () => {
      callback()
    }
    ipcRenderer.on("menu:showSelectionAsQrCode", listener)
    return () => {
      ipcRenderer.removeListener("menu:showSelectionAsQrCode", listener)
    }
  },
  enteredFullScreen: (callback) => {
    const listener = () => {
      callback()
    }
    ipcRenderer.on("window:enteredFullScreen", listener)
    return () => {
      ipcRenderer.removeListener("window:enteredFullScreen", listener)
    }
  },
  leftFullScreen: (callback) => {
    const listener = () => {
      callback()
    }
    ipcRenderer.on("window:leftFullScreen", listener)
    return () => {
      ipcRenderer.removeListener("window:leftFullScreen", listener)
    }
  },
  generateMnemonic: (...args) => {
    return ipcRenderer.sendSync("bip39:generateMnemonic", ...args)
  },
  validateMnemonic: (...args) => {
    return ipcRenderer.sendSync("bip39:validateMnemonic", ...args)
  },
  getDataLength: (...args) => {
    return ipcRenderer.sendSync("blockcrypt:getDataLength", ...args)
  },
  wordlist: () => {
    return ipcRenderer.sendSync("bip39:wordlist")
  },
  generatePassphrase: async (...args) => {
    const passphrase = await ipcRenderer.invoke("generatePassphrase", ...args)
    return passphrase
  },
  // @ts-expect-error Required so function overloads are preserved
  create: async (...args) => {
    const result: CreateResult = await ipcRenderer.invoke("create", ...args)
    return result
  },
  duplicate: async (...args) => {
    const result: DuplicateResult = await ipcRenderer.invoke(
      "duplicate",
      ...args
    )
    return result
  },
  getDefaultPrinter: async (...args) => {
    const printer: Printer = await ipcRenderer.invoke(
      "print:getDefaultPrinter",
      ...args
    )
    return printer
  },
  getPrinters: async (...args) => {
    const printers: Printer[] = await ipcRenderer.invoke(
      "print:getPrinters",
      ...args
    )
    return printers
  },
  getPrinterStatus: async (...args) => {
    const status: PrinterStatus = await ipcRenderer.invoke(
      "print:getPrinterStatus",
      ...args
    )
    return status
  },
  print: async (...args) => {
    const stdout: string = await ipcRenderer.invoke("print:print", ...args)
    return stdout
  },
  save: async (...args) => {
    const result: boolean = await ipcRenderer.invoke("save", ...args)
    return result
  },
  generateToken: (...args) => {
    return ipcRenderer.sendSync("totp:generateToken", ...args)
  },
  restore: async (...args) => {
    const result: RestoreResult = await ipcRenderer.invoke("restore", ...args)
    return result
  },
  restoreReset: async (...args) => {
    await ipcRenderer.invoke("restoreReset", ...args)
  },
}

contextBridge.exposeInMainWorld("api", api)
