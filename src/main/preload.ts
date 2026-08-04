import { contextBridge, webUtils } from "electron"

import { IpcEvents, IpcHandlers, IpcSyncHandlers } from "@/src/registerHandlers"
import { createEventListener } from "@/src/shared/utilities/createEventListener"
import { invoke } from "@/src/utilities/ipc/invoke"
import { invokeSync } from "@/src/utilities/ipc/invokeSync"

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
    systemLocaleChange: createEventListener("systemLocaleChange"),
    menuAbout: createEventListener("menuAbout"),
    menuSettings: createEventListener("menuSettings"),
    menuTriggeredRoute: createEventListener("menuTriggeredRoute"),
    menuInsert: createEventListener("menuInsert"),
    menuShowSelectionAsQrCode: createEventListener("menuShowSelectionAsQrCode"),
    windowEnteredFullScreen: createEventListener("windowEnteredFullScreen"),
    windowLeftFullScreen: createEventListener("windowLeftFullScreen"),
    appLoading: createEventListener("appLoading"),
    yubikeyTouchRequired: createEventListener("yubikeyTouchRequired"),
  } satisfies IpcEvents,
  invoke: {
    getDesktopCapturerSources: invoke("getDesktopCapturerSources"),
    openExternalUrl: invoke("openExternalUrl"),
    openPath: invoke("openPath"),
    enableModes: invoke("enableModes"),
    disableModes: invoke("disableModes"),
    toggleMaximize: invoke("toggleMaximize"),
    generatePassphrase: invoke("generatePassphrase"),
    generatePassword: invoke("generatePassword"),
    computeBip32RootFingerprint: invoke("computeBip32RootFingerprint"),
    scheduleClipboardClear: invoke("scheduleClipboardClear"),
    create: invoke("create"),
    renderCarrierPdf: invoke("renderCarrierPdf"),
    duplicate: invoke("duplicate"),
    getDefaultPrinter: invoke("getDefaultPrinter"),
    getPrinters: invoke("getPrinters"),
    getPrinterStatus: invoke("getPrinterStatus"),
    getSupportedPaperSizes: invoke("getSupportedPaperSizes"),
    print: invoke("print"),
    save: invoke("save"),
    restore: invoke("restore"),
    restoreReset: invoke("restoreReset"),
    chooseDirectory: invoke("chooseDirectory"),
    createDetachedArchive: invoke("createDetachedArchive"),
    createStandaloneArchive: invoke("createStandaloneArchive"),
    restoreDetachedArchive: invoke("restoreDetachedArchive"),
    restoreStandaloneArchive: invoke("restoreStandaloneArchive"),
    verifyYubiKeyChallengeResponseSecret: invoke(
      "verifyYubiKeyChallengeResponseSecret"
    ),
  } satisfies IpcHandlers,
  invokeSync: {
    getLocale: invokeSync("getLocale"),
    getVersion: invokeSync("getVersion"),
    getConfig: invokeSync("getConfig"),
    setConfig: invokeSync("setConfig"),
    unsetConfig: invokeSync("unsetConfig"),
    generateMnemonic: invokeSync("generateMnemonic"),
    validateMnemonic: invokeSync("validateMnemonic"),
    getWordlist: invokeSync("getWordlist"),
    getPasswordCharacterClasses: invokeSync("getPasswordCharacterClasses"),
    getBlockUsage: invokeSync("getBlockUsage"),
    encodeBlockContent: invokeSync("encodeBlockContent"),
    generateMasterKey: invokeSync("generateMasterKey"),
    deriveDetachedArchiveFilename: invokeSync("deriveDetachedArchiveFilename"),
    generateToken: invokeSync("generateToken"),
  } satisfies IpcSyncHandlers,
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file)
  },
  platform: process.platform,
} satisfies Api

contextBridge.exposeInMainWorld("api", api)
