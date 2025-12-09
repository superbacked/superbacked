import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  nativeTheme,
  session,
  WebFrameMain,
} from "electron"
import { URL } from "url"

import { getDataLength } from "blockcrypt"
import { program as cli, Argument as CommanderArgument } from "commander"

import create from "@/src/create"
import duplicate from "@/src/duplicate"
import {
  defaultLocale,
  Locale,
  locales,
  setLocale as setLocaleI18n,
} from "@/src/i18n"
import {
  disableModes,
  enableModes,
  setMenu,
  showHiddenSecrets,
} from "@/src/menu"
import openExternalUrl from "@/src/openExternalUrl"
import restore, { restoreReset } from "@/src/restore"
import {
  generateMnemonic,
  validateMnemonic,
  wordlist,
} from "@/src/utilities/bip39"
import { get as getConfig, set as setConfig } from "@/src/utilities/config"
import generatePassphrase from "@/src/utilities/passphrase"
import {
  getDefaultPrinter,
  getPrinters,
  getPrinterStatus,
  print,
} from "@/src/utilities/print"
import save from "@/src/utilities/save"
import { generateToken } from "@/src/utilities/totp"

declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string
declare const MAIN_WINDOW_WEBPACK_ENTRY: string

app.setName("Superbacked")

cli.name("superbacked")
cli.version(app.getVersion(), "--version", "output version")

cli.helpOption("-h, --help", "display help")

cli
  .command("config")
  .addArgument(new CommanderArgument("<key>", "key").choices(["colorScheme"]))
  .argument("<value>", "value")
  .action((key, value) => {
    try {
      setConfig(key, value)
      process.exit(0)
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "Could not run config"
      )
      process.exit(1)
    }
  })

// see https://www.electronjs.org/docs/latest/tutorial/security#13-disable-or-limit-navigation
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event) => {
    event.preventDefault()
  })
})

// see https://www.electronjs.org/docs/latest/tutorial/security#14-disable-or-limit-creation-of-new-windows
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: "deny" }
  })
})

export let locale: Locale = defaultLocale

const preferredSystemLanguages = app.getPreferredSystemLanguages()
const preferredLanguage = preferredSystemLanguages[0]
if (preferredLanguage) {
  const systemLocale = preferredLanguage.split("-")[0] as Locale
  if (locales.includes(systemLocale)) {
    locale = systemLocale
  }
}

await setLocaleI18n(locale)

export const setLocale = async (updatedLocale: Locale) => {
  locale = updatedLocale
  await setLocaleI18n(updatedLocale)
  const windows = BrowserWindow.getAllWindows()
  for (const window of windows) {
    window.webContents.send("app:localeChange", updatedLocale)
  }
}

export const shouldUseDarkColors = () => {
  const colorScheme = getConfig("colorScheme")
  return (
    (colorScheme && colorScheme === "dark") ?? nativeTheme.shouldUseDarkColors
  )
}

export const createWindow = async (): Promise<BrowserWindow> => {
  return new Promise((resolve, reject) => {
    const windowWidth = 800
    const windowHeight = 600
    const mainWindow = new BrowserWindow({
      backgroundColor: shouldUseDarkColors() === true ? "#1c1b24" : "#ffffff",
      width: windowWidth,
      height: windowHeight,
      minWidth: windowWidth,
      minHeight: windowHeight,
      show: false,
      titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
      useContentSize: true,
      webPreferences: {
        contextIsolation: true, // default, see https://www.electronjs.org/docs/latest/tutorial/security#3-enable-context-isolation
        nodeIntegration: false, // default, see https://www.electronjs.org/docs/latest/tutorial/security#3-enable-context-isolation
        nodeIntegrationInWorker: false, // default, see https://www.electronjs.org/docs/latest/tutorial/security#3-enable-context-isolation
        preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
        sandbox: true,
      },
    })
    mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY).catch((error) => {
      reject(error)
    })
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow.show()
      resolve(mainWindow)
    })
    mainWindow.on("enter-full-screen", () => {
      mainWindow.webContents.send("window:enteredFullScreen")
    })
    mainWindow.on("leave-full-screen", () => {
      mainWindow.webContents.send("window:leftFullScreen")
    })
    mainWindow.on("close", () => {
      disableModes(["insert", "select"])
    })
    if (app.inspect === true) {
      mainWindow.webContents.openDevTools()
    }
  })
}

// see https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages
const validateSender = (frame: WebFrameMain) => {
  const frameHost = new URL(frame.url).host
  const mainHost = new URL(MAIN_WINDOW_WEBPACK_ENTRY).host
  if (frameHost === mainHost) {
    return true
  }
  return false
}

interface DefaultOptions {
  inspect: number
}

export interface CustomDesktopCapturerSource {
  id: string
  label: string
  thumbnailDataUrl: string
}

export type GetDesktopCapturerSourcesResult =
  | {
      customDesktopCapturerSources: CustomDesktopCapturerSource[]
      success: true
    }
  | { error: string; success: false }

// Run Electron app
cli
  // See https://www.electronjs.org/docs/latest/tutorial/debugging-main-process
  .option("--inspect", "enable debugging")
  .option("--no-sandbox", "disable sandbox")
  .action((options: DefaultOptions) => {
    app.inspect = options.inspect ? true : false

    setMenu()

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow()
      }
    })

    app.on("ready", async () => {
      // Disable DNS-over-HTTPS (disables extraneous bootstrap requests that trigger Little Snitch warnings)
      app.configureHostResolver({
        secureDnsMode: "off",
      })
      await createWindow()
      // Limit networking to trusted URLs
      session.defaultSession.webRequest.onBeforeSendHeaders(
        (details, callback) => {
          if (
            details.url.match(/^devtools:\/\//) === undefined &&
            // #if process.env.ENV === "development"
            details.url.match(/^(http|ws):\/\/localhost:3000/) === undefined &&
            // #endif
            // #if process.env.ENV === "production"
            details.url.match(/^file:\/\//) === undefined &&
            // #endif
            details.url.match(/^https:\/\/superbacked\.com/) === undefined
          ) {
            callback({ cancel: true })
          } else {
            callback({ cancel: false })
          }
        }
      )
    })

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit()
      }
    })

    nativeTheme.on("updated", () => {
      if (!getConfig("colorScheme")) {
        const colorScheme =
          nativeTheme.shouldUseDarkColors === true ? "dark" : "light"
        const windows = BrowserWindow.getAllWindows()
        for (const window of windows) {
          window.webContents.send("theme:colorSchemeChanged", colorScheme)
        }
      }
    })

    ipcMain.on("theme:getColorScheme", (event) => {
      if (event.senderFrame && validateSender(event.senderFrame) !== true) {
        throw new Error("Wrong sender")
      }
      event.returnValue = shouldUseDarkColors() === true ? "dark" : "light"
    })

    ipcMain.on("app:getLocale", (event) => {
      if (event.senderFrame && validateSender(event.senderFrame) !== true) {
        throw new Error("Wrong sender")
      }
      event.returnValue = locale
    })

    ipcMain.handle(
      "desktopCapturer:getDesktopCapturerSources",
      async (event): Promise<GetDesktopCapturerSourcesResult> => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        try {
          const sources = await desktopCapturer.getSources({
            types: ["window"],
          })
          const customDesktopCapturerSources: CustomDesktopCapturerSource[] = []
          for (const source of sources) {
            customDesktopCapturerSources.push({
              id: source.id,
              label: source.name,
              thumbnailDataUrl: source.thumbnail.toDataURL(),
            })
          }
          return {
            customDesktopCapturerSources: customDesktopCapturerSources,
            success: true,
          }
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : "Could not get desktop capturer sources",
            success: false,
          }
        }
      }
    )

    ipcMain.on("app:getVersion", (event) => {
      if (event.senderFrame && validateSender(event.senderFrame) !== true) {
        throw new Error("Wrong sender")
      }
      event.returnValue = app.getVersion()
    })

    ipcMain.on("app:newWindow", async () => {
      // Validating sender is not required given message is emitted from menu
      await createWindow()
    })

    ipcMain.handle(
      "app:openExternalUrl",
      async (event, ...args: Parameters<typeof openExternalUrl>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        await openExternalUrl(...args)
      }
    )

    ipcMain.handle(
      "menu:enableModes",
      (event, ...args: Parameters<typeof enableModes>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        enableModes(...args)
      }
    )

    ipcMain.handle(
      "menu:disableModes",
      (event, ...args: Parameters<typeof disableModes>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        disableModes(...args)
      }
    )

    ipcMain.on("app:getShowHiddenSecretsState", (event) => {
      if (event.senderFrame && validateSender(event.senderFrame) !== true) {
        throw new Error("Wrong sender")
      }
      event.returnValue = showHiddenSecrets
    })

    ipcMain.on(
      "bip39:generateMnemonic",
      (event, ...args: Parameters<typeof generateMnemonic>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        event.returnValue = generateMnemonic(...args)
      }
    )

    ipcMain.on(
      "bip39:validateMnemonic",
      (event, ...args: Parameters<typeof validateMnemonic>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        event.returnValue = validateMnemonic(...args)
      }
    )

    ipcMain.on("bip39:wordlist", (event) => {
      if (event.senderFrame && validateSender(event.senderFrame) !== true) {
        throw new Error("Wrong sender")
      }
      event.returnValue = wordlist
    })

    ipcMain.on(
      "blockcrypt:getDataLength",
      (event, ...args: Parameters<typeof getDataLength>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        event.returnValue = getDataLength(...args)
      }
    )

    ipcMain.handle(
      "generatePassphrase",
      async (event, ...args: Parameters<typeof generatePassphrase>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        return generatePassphrase(...args)
      }
    )

    ipcMain.handle(
      "create",
      async (event, ...args: Parameters<typeof create>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        return create(...args)
      }
    )

    ipcMain.handle(
      "duplicate",
      async (event, ...args: Parameters<typeof duplicate>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        return duplicate(...args)
      }
    )

    ipcMain.handle(
      "print:getDefaultPrinter",
      async (event, ...args: Parameters<typeof getDefaultPrinter>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        return getDefaultPrinter(...args)
      }
    )

    ipcMain.handle(
      "print:getPrinters",
      async (event, ...args: Parameters<typeof getPrinters>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        return getPrinters(...args)
      }
    )

    ipcMain.handle(
      "print:getPrinterStatus",
      async (event, ...args: Parameters<typeof getPrinterStatus>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        return getPrinterStatus(...args)
      }
    )

    ipcMain.handle(
      "print:print",
      async (event, ...args: Parameters<typeof print>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        return print(...args)
      }
    )

    ipcMain.handle("save", async (event, ...args: Parameters<typeof save>) => {
      if (event.senderFrame && validateSender(event.senderFrame) !== true) {
        throw new Error("Wrong sender")
      }
      return save(...args)
    })

    ipcMain.on(
      "totp:generateToken",
      (event, ...args: Parameters<typeof generateToken>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        event.returnValue = generateToken(...args)
      }
    )

    ipcMain.handle(
      "restore",
      async (event, ...args: Parameters<typeof restore>) => {
        if (event.senderFrame && validateSender(event.senderFrame) !== true) {
          throw new Error("Wrong sender")
        }
        return restore(...args)
      }
    )

    ipcMain.handle("restoreReset", (event) => {
      if (event.senderFrame && validateSender(event.senderFrame) !== true) {
        throw new Error("Wrong sender")
      }
      return restoreReset()
    })

    ipcMain.handle("window:toggleMaximize", (event) => {
      if (event.senderFrame && validateSender(event.senderFrame) !== true) {
        throw new Error("Wrong sender")
      }
      const window = BrowserWindow.getFocusedWindow()
      if (window) {
        if (window.isMaximized()) {
          window.unmaximize()
        } else {
          window.maximize()
        }
      }
    })
  })

cli.parse()
