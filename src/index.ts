import { getDataLength } from "blockcrypt"
import { program as cli, Argument as CommanderArgument } from "commander"
import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  nativeTheme,
  screen,
  session,
  WebFrameMain,
} from "electron"
import { URL } from "url"
import create from "./create"
import duplicate from "./duplicate"
import {
  defaultLocale,
  Locale,
  locales,
  setLocale as setLocaleI18n,
} from "./i18n"
import { disableModes, enableModes, setMenu, showHiddenSecrets } from "./menu"
import openExternalUrl from "./openExternalUrl"
import restore, { restoreReset } from "./restore"
import { generateMnemonic, validateMnemonic, wordlist } from "./utilities/bip39"
import { get as getConfig, set as setConfig } from "./utilities/config"
import generatePassphrase from "./utilities/passphrase"
import {
  getDefaultPrinter,
  getPrinters,
  getPrinterStatus,
  print,
} from "./utilities/print"
import save from "./utilities/save"
import { generateToken } from "./utilities/totp"
import {
  decode as zbarDecode,
  installed as zbarInstalled,
} from "./utilities/zbarimg"

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
      console.error(error.message)
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

export interface CustomDesktopCapturerSource {
  id: string
  label: string
  thumbnailDataUrl: string
}

export let locale: Locale = defaultLocale

const systemLocale = app
  .getPreferredSystemLanguages()[0]
  .split("-")[0] as Locale
if (locales.includes(systemLocale)) {
  locale = systemLocale
}

setLocaleI18n(locale)

export const setLocale = (updatedLocale: Locale) => {
  locale = updatedLocale
  setLocaleI18n(updatedLocale)
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
  return new Promise((resolve) => {
    const windowWidth = 800
    const windowHeight = 600
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const x = Math.floor((width - windowWidth) / 2)
    const y = Math.floor((height - windowHeight) / 2)
    const mainWindow = new BrowserWindow({
      backgroundColor: shouldUseDarkColors() === true ? "#1c1b24" : "#ffffff",
      width: windowWidth,
      height: windowHeight,
      minWidth: windowWidth,
      minHeight: windowHeight,
      titleBarStyle: "hidden",
      webPreferences: {
        contextIsolation: true, // default, see https://www.electronjs.org/docs/latest/tutorial/security#3-enable-context-isolation
        nodeIntegration: false, // default, see https://www.electronjs.org/docs/latest/tutorial/security#3-enable-context-isolation
        nodeIntegrationInWorker: false, // default, see https://www.electronjs.org/docs/latest/tutorial/security#3-enable-context-isolation
        preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
        sandbox: true,
      },
      show: false,
      x: x,
      y: y,
    })
    mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)
    mainWindow.once("ready-to-show", () => {
      resolve(mainWindow)
      mainWindow.show()
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

// Run Electron app
cli
  // See https://www.electronjs.org/docs/latest/tutorial/debugging-main-process
  .option("--inspect", "enable debugging")
  .option("--no-sandbox", "disable sandbox")
  .action((options: DefaultOptions) => {
    app.inspect = options.inspect ? true : false

    setMenu()

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })

    app.on("ready", () => {
      // Disable DNS-over-HTTPS (disables extraneous bootstrap requests that trigger Little Snitch warnings)
      app.configureHostResolver({
        secureDnsMode: "off",
      })
      createWindow()
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
      if (validateSender(event.senderFrame) !== true) {
        return
      }
      event.returnValue = shouldUseDarkColors() === true ? "dark" : "light"
    })

    ipcMain.on("app:getLocale", (event) => {
      if (validateSender(event.senderFrame) !== true) {
        return
      }
      event.returnValue = locale
    })

    ipcMain.handle("desktopCapturer:getSources", async (event) => {
      if (validateSender(event.senderFrame) !== true) {
        return
      }
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
      return customDesktopCapturerSources
    })

    ipcMain.on("app:getVersion", (event) => {
      if (validateSender(event.senderFrame) !== true) {
        return
      }
      event.returnValue = app.getVersion()
    })

    ipcMain.on("app:newWindow", () => {
      // validateSender not required given message is emitted from menu
      createWindow()
    })

    ipcMain.handle(
      "app:openExternalUrl",
      (event, ...args: Parameters<typeof openExternalUrl>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        openExternalUrl(...args)
      }
    )

    ipcMain.handle(
      "menu:enableModes",
      (event, ...args: Parameters<typeof enableModes>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        enableModes(...args)
      }
    )

    ipcMain.handle(
      "menu:disableModes",
      (event, ...args: Parameters<typeof disableModes>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        disableModes(...args)
      }
    )

    ipcMain.on("app:getShowHiddenSecretsState", (event) => {
      if (validateSender(event.senderFrame) !== true) {
        return
      }
      event.returnValue = showHiddenSecrets
    })

    ipcMain.on(
      "bip39:generateMnemonic",
      (event, ...args: Parameters<typeof generateMnemonic>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        event.returnValue = generateMnemonic(...args)
      }
    )

    ipcMain.on(
      "bip39:validateMnemonic",
      (event, ...args: Parameters<typeof validateMnemonic>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        event.returnValue = validateMnemonic(...args)
      }
    )

    ipcMain.on("bip39:wordlist", (event) => {
      if (validateSender(event.senderFrame) !== true) {
        return
      }
      event.returnValue = wordlist
    })

    ipcMain.on(
      "blockcrypt:getDataLength",
      (event, ...args: Parameters<typeof getDataLength>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        event.returnValue = getDataLength(...args)
      }
    )

    ipcMain.handle(
      "generatePassphrase",
      async (event, ...args: Parameters<typeof generatePassphrase>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        return generatePassphrase(...args)
      }
    )

    ipcMain.handle(
      "zbarimg:decode",
      async (event, ...args: Parameters<typeof zbarDecode>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        return zbarDecode(...args)
      }
    )

    ipcMain.handle("zbarimg:installed", async (event) => {
      if (validateSender(event.senderFrame) !== true) {
        return
      }
      return zbarInstalled()
    })

    ipcMain.handle(
      "create",
      async (event, ...args: Parameters<typeof create>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        return create(...args)
      }
    )

    ipcMain.handle(
      "duplicate",
      async (event, ...args: Parameters<typeof duplicate>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        return duplicate(...args)
      }
    )

    ipcMain.handle(
      "print:getDefaultPrinter",
      async (event, ...args: Parameters<typeof getDefaultPrinter>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        return getDefaultPrinter(...args)
      }
    )

    ipcMain.handle(
      "print:getPrinters",
      async (event, ...args: Parameters<typeof getPrinters>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        return getPrinters(...args)
      }
    )

    ipcMain.handle(
      "print:getPrinterStatus",
      async (event, ...args: Parameters<typeof getPrinterStatus>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        return getPrinterStatus(...args)
      }
    )

    ipcMain.handle(
      "print:print",
      async (event, ...args: Parameters<typeof print>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        return print(...args)
      }
    )

    ipcMain.handle("save", async (event, ...args: Parameters<typeof save>) => {
      if (validateSender(event.senderFrame) !== true) {
        return
      }
      return save(...args)
    })

    ipcMain.on(
      "totp:generateToken",
      (event, ...args: Parameters<typeof generateToken>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        event.returnValue = generateToken(...args)
      }
    )

    ipcMain.handle(
      "restore",
      async (event, ...args: Parameters<typeof restore>) => {
        if (validateSender(event.senderFrame) !== true) {
          return
        }
        return restore(...args)
      }
    )

    ipcMain.handle("restoreReset", (event) => {
      if (validateSender(event.senderFrame) !== true) {
        return
      }
      return restoreReset()
    })

    ipcMain.handle("window:toggleMaximize", (event) => {
      if (validateSender(event.senderFrame) !== true) {
        return
      }
      const window = BrowserWindow.getFocusedWindow()
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    })
  })

cli.parse()
