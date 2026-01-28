import { app } from "electron"

import { getDataLength } from "blockcrypt"

import { deriveKey, generateMasterKey } from "@/src/handlers/archiveCore"
import chooseDirectory from "@/src/handlers/chooseDirectory"
import create from "@/src/handlers/create"
import {
  createDetachedArchive,
  restoreDetachedArchive,
} from "@/src/handlers/detachedArchive"
import duplicate from "@/src/handlers/duplicate"
import generatePassphrase from "@/src/handlers/generatePassphrase"
import getDesktopCapturerSources from "@/src/handlers/getDesktopCapturerSources"
import openExternalUrl from "@/src/handlers/openExternalUrl"
import openPath from "@/src/handlers/openPath"
import {
  getDefaultPrinter,
  getPrinterStatus,
  getPrinters,
  print,
} from "@/src/handlers/print"
import restore, { restoreReset } from "@/src/handlers/restore"
import save from "@/src/handlers/save"
import {
  createStandaloneArchive,
  restoreStandaloneArchive,
} from "@/src/handlers/standaloneArchive"
import toggleMaximize from "@/src/handlers/toggleMaximize"
import { Locale } from "@/src/i18n"
import { locale, shouldUseDarkColors } from "@/src/index"
import { disableModes, enableModes } from "@/src/menu"
import { TranslationKey } from "@/src/shared/types/i18n"
import {
  generateMnemonic,
  validateMnemonic,
  wordlist,
} from "@/src/utilities/bip39"
import { ColorScheme } from "@/src/utilities/config"
import { handle } from "@/src/utilities/handle"
import { handleSync } from "@/src/utilities/handleSync"
import { generateToken } from "@/src/utilities/totp"

type InsertType = "mnemonic" | "passphrase" | "scanQrCode"

// Helper type for event listener registration
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventListener<TCallback extends (...args: any[]) => void> = (
  callback: TCallback
) => () => void

// Main → Renderer event signatures
export interface IpcEvents {
  systemColorSchemeChange: EventListener<(colorScheme: ColorScheme) => void>
  systemLocaleChange: EventListener<(locale: Locale) => void>
  menuAbout: EventListener<() => void>
  menuTriggeredRoute: EventListener<(to: string) => void>
  menuInsert: EventListener<(type: InsertType) => void>
  menuShowSelectionAsQrCode: EventListener<() => void>
  windowEnteredFullScreen: EventListener<() => void>
  windowLeftFullScreen: EventListener<() => void>
  appLoading: EventListener<(visible: boolean, dialog?: TranslationKey) => void>
}

// Async handler map
const asyncHandlers = {
  getDesktopCapturerSources,
  openExternalUrl,
  openPath,
  enableModes,
  disableModes,
  toggleMaximize,
  generatePassphrase,
  create,
  duplicate,
  getDefaultPrinter,
  getPrinters,
  getPrinterStatus,
  print,
  save,
  restore,
  restoreReset,
  chooseDirectory,
  createDetachedArchive,
  restoreDetachedArchive,
  createStandaloneArchive,
  restoreStandaloneArchive,
} as const

// Derive interface from handler map
export type IpcHandlers = typeof asyncHandlers

export const registerHandlers = () => {
  // Register all handlers
  ;(
    Object.entries(asyncHandlers) as [
      keyof IpcHandlers,
      IpcHandlers[keyof IpcHandlers],
    ][]
  ).forEach(([name, handler]) => {
    handle(name, async (_event, ...args: never[]) => {
      // @ts-expect-error - TypeScript can’t type ...args when handlers have different signatures
      return handler(...args)
    })
  })
}

// Sync handler map
const syncHandlers = {
  getColorScheme: () => (shouldUseDarkColors() === true ? "dark" : "light"),
  getLocale: () => locale,
  getVersion: () => app.getVersion(),
  generateMnemonic,
  validateMnemonic,
  getWordlist: () => wordlist,
  getDataLength,
  generateMasterKey,
  deriveKey,
  generateToken,
} as const

// Derive interface from sync handler map
export type IpcSyncHandlers = typeof syncHandlers

export const registerSyncHandlers = () => {
  // Register all sync handlers
  ;(
    Object.entries(syncHandlers) as [
      keyof IpcSyncHandlers,
      IpcSyncHandlers[keyof IpcSyncHandlers],
    ][]
  ).forEach(([name, handler]) => {
    handleSync(name, (...args: never[]) => {
      // @ts-expect-error - TypeScript can’t type ...args when handlers have different signatures
      return handler(...args)
    })
  })
}
