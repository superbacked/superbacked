import {
  BrowserWindow,
  WebFrameMain,
  app,
  ipcMain,
  nativeTheme,
  session,
} from "electron"
import { URL } from "url"

import { Argument as CommanderArgument, program as cli } from "commander"

import {
  Locale,
  defaultLocale,
  locales,
  setLocale as setLocaleI18n,
} from "@/src/i18n"
import { disableModes, setMenu } from "@/src/menu"
import { registerHandlers, registerSyncHandlers } from "@/src/registerHandlers"
import { get as getConfig, set as setConfig } from "@/src/utilities/config"
import { sendEvent } from "@/src/utilities/sendEvent"

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
    sendEvent(window, "systemLocaleChange", updatedLocale)
  }
}

export const shouldUseDarkColors = () => {
  const colorScheme = getConfig("colorScheme")
  return (
    (colorScheme && colorScheme === "dark") ?? nativeTheme.shouldUseDarkColors
  )
}

let mainWindowId: null | number = null

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
    mainWindowId = mainWindow.id
    mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY).catch((error) => {
      reject(error)
    })
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow.show()
      resolve(mainWindow)
    })
    mainWindow.on("enter-full-screen", () => {
      sendEvent(mainWindow, "windowEnteredFullScreen")
    })
    mainWindow.on("leave-full-screen", () => {
      sendEvent(mainWindow, "windowLeftFullScreen")
    })
    mainWindow.on("close", () => {
      disableModes(["insert", "select"])
    })
    if (app.inspect === true) {
      mainWindow.webContents.openDevTools()
    }
  })
}

export const getMainWindow = (): null | BrowserWindow => {
  if (mainWindowId === null) {
    return null
  }
  return BrowserWindow.fromId(mainWindowId)
}

// see https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages
export const validateSender = (frame: WebFrameMain) => {
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

    ipcMain.on("newWindow", async () => {
      await createWindow()
    })

    nativeTheme.on("updated", () => {
      if (!getConfig("colorScheme")) {
        const colorScheme =
          nativeTheme.shouldUseDarkColors === true ? "dark" : "light"
        const windows = BrowserWindow.getAllWindows()
        for (const window of windows) {
          sendEvent(window, "systemColorSchemeChange", colorScheme)
        }
      }
    })

    registerSyncHandlers()
    registerHandlers()
  })

cli.parse()
