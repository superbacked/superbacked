import { app } from "electron"

import { deriveKey, generateMasterKey } from "@/src/handlers/archive"
import chooseDirectory from "@/src/handlers/chooseDirectory"
import create, { renderCarrierPdf } from "@/src/handlers/create"
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
  getSupportedPaperSizes,
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
import { locale } from "@/src/index"
import { disableModes, enableModes } from "@/src/menu"
import { TranslationKey } from "@/src/shared/types/i18n"
import {
  get as getConfig,
  set as setConfig,
  unset as unsetConfig,
} from "@/src/utilities/config"
import { getBlockUsage } from "@/src/utilities/core/block"
import {
  generateMnemonic,
  validateMnemonic,
  wordlist,
} from "@/src/utilities/crypto/bip39"
import { generateToken } from "@/src/utilities/crypto/totp"
import { handle } from "@/src/utilities/ipc/handle"
import { handleSync } from "@/src/utilities/ipc/handleSync"
import broadcastYubiKeyTouchRequired from "@/src/utilities/yubikey/broadcastTouchRequired"
import { Slot } from "@/src/utilities/yubikey/otp"

type InsertType = "mnemonic" | "passphrase" | "scanQrCode"

// Helper type for event listener registration
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventListener<TCallback extends (...args: any[]) => void> = (
  callback: TCallback
) => () => void

// Main → Renderer event signatures
export interface IpcEvents {
  systemLocaleChange: EventListener<(locale: Locale) => void>
  menuAbout: EventListener<() => void>
  menuTriggeredRoute: EventListener<(to: string) => void>
  menuInsert: EventListener<(type: InsertType) => void>
  menuShowSelectionAsQrCode: EventListener<() => void>
  windowEnteredFullScreen: EventListener<() => void>
  windowLeftFullScreen: EventListener<() => void>
  appLoading: EventListener<(visible: boolean, dialog?: TranslationKey) => void>
  yubikeyTouchRequired: EventListener<() => void>
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
  renderCarrierPdf,
  duplicate,
  getDefaultPrinter,
  getPrinters,
  getPrinterStatus,
  getSupportedPaperSizes,
  print,
  save,
  restore,
  restoreReset,
  chooseDirectory,
  createDetachedArchive,
  restoreDetachedArchive,
  // Wrapped so the renderer-facing surface stays serializable — the touch
  // notice is injected here (windows), while the command-line interface
  // calls the handlers directly with its own (stderr)
  createStandaloneArchive: (
    filePaths: string[],
    archivePath: string,
    passphrase: string,
    slot?: Slot
  ) =>
    createStandaloneArchive(
      filePaths,
      archivePath,
      passphrase,
      slot,
      broadcastYubiKeyTouchRequired
    ),
  restoreStandaloneArchive: (
    filePath: string,
    outputDir: string,
    passphrase: string,
    slot?: Slot
  ) =>
    restoreStandaloneArchive(
      filePath,
      outputDir,
      passphrase,
      slot,
      broadcastYubiKeyTouchRequired
    ),
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
  getLocale: () => locale,
  getVersion: () => app.getVersion(),
  getConfig,
  setConfig,
  unsetConfig,
  generateMnemonic,
  validateMnemonic,
  getWordlist: () => wordlist,
  getBlockUsage,
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
      // @ts-expect-error - TypeScript can't properly type handler union
      return handler(...args)
    })
  })
}
