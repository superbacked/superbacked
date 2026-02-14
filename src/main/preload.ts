import { contextBridge, webUtils } from "electron"

import { IpcEvents, IpcHandlers, IpcSyncHandlers } from "@/src/registerHandlers"
import { createEventListener } from "@/src/shared/utilities/createEventListener"
import { invoke } from "@/src/utilities/invoke"
import { invokeSync } from "@/src/utilities/invokeSync"

/**
 * Main window API exposed to renderer process via contextBridge.
 * Available as `window.api` in renderer context.
 */
export interface Api {
  /** Subscribe to main process events. */
  events: IpcEvents
  /** Invoke asynchronous IPC handlers in main process. */
  invoke: IpcHandlers
  /** Invoke synchronous IPC handlers in main process. */
  invokeSync: IpcSyncHandlers
  /** Get File object absolute filesystem path. */
  getPathForFile: (file: File) => string
  /** Current platform (darwin or linux). */
  platform: NodeJS.Platform
}

const api: Api = {
  events: {
    systemColorSchemeChange: createEventListener("systemColorSchemeChange"),
    systemLocaleChange: createEventListener("systemLocaleChange"),
    menuAbout: createEventListener("menuAbout"),
    menuTriggeredRoute: createEventListener("menuTriggeredRoute"),
    menuInsert: createEventListener("menuInsert"),
    menuShowSelectionAsQrCode: createEventListener("menuShowSelectionAsQrCode"),
    windowEnteredFullScreen: createEventListener("windowEnteredFullScreen"),
    windowLeftFullScreen: createEventListener("windowLeftFullScreen"),
    appLoading: createEventListener("appLoading"),
  } satisfies IpcEvents,
  invoke: {
    getDesktopCapturerSources: invoke("getDesktopCapturerSources"),
    openExternalUrl: invoke("openExternalUrl"),
    openPath: invoke("openPath"),
    enableModes: invoke("enableModes"),
    disableModes: invoke("disableModes"),
    toggleMaximize: invoke("toggleMaximize"),
    generatePassphrase: invoke("generatePassphrase"),
    create: invoke("create"),
    duplicate: invoke("duplicate"),
    getDefaultPrinter: invoke("getDefaultPrinter"),
    getPrinters: invoke("getPrinters"),
    getPrinterStatus: invoke("getPrinterStatus"),
    print: invoke("print"),
    save: invoke("save"),
    restore: invoke("restore"),
    restoreReset: invoke("restoreReset"),
    chooseDirectory: invoke("chooseDirectory"),
    createDetachedArchive: invoke("createDetachedArchive"),
    createStandaloneArchive: invoke("createStandaloneArchive"),
    restoreDetachedArchive: invoke("restoreDetachedArchive"),
    restoreStandaloneArchive: invoke("restoreStandaloneArchive"),
  } satisfies IpcHandlers,
  invokeSync: {
    getColorScheme: invokeSync("getColorScheme"),
    getLocale: invokeSync("getLocale"),
    getVersion: invokeSync("getVersion"),
    getConfig: invokeSync("getConfig"),
    setConfig: invokeSync("setConfig"),
    unsetConfig: invokeSync("unsetConfig"),
    generateMnemonic: invokeSync("generateMnemonic"),
    validateMnemonic: invokeSync("validateMnemonic"),
    getWordlist: invokeSync("getWordlist"),
    getDataLength: invokeSync("getDataLength"),
    generateMasterKey: invokeSync("generateMasterKey"),
    deriveKey: invokeSync("deriveKey"),
    generateToken: invokeSync("generateToken"),
  } satisfies IpcSyncHandlers,
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file)
  },
  platform: process.platform,
} satisfies Api

contextBridge.exposeInMainWorld("api", api)
