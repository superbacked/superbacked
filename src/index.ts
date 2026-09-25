import { BrowserWindow, WebFrameMain, app, ipcMain, session } from "electron"
import { URL } from "url"

import { Option as CommanderOption, program as cli } from "commander"

import {
  deriveBitcoinWalletAction,
  parseAddresses,
} from "@/src/cli/deriveBitcoinWallet"
import {
  derivePasswordAction,
  parseClear,
  parseLength,
} from "@/src/cli/derivePassword"
import { provisionYubikeyAction } from "@/src/cli/provisionYubikey"
import {
  createStandaloneArchiveAction,
  restoreStandaloneArchiveAction,
} from "@/src/cli/standaloneArchive"
import {
  Locale,
  defaultLocale,
  locales,
  setLocale as setLocaleI18n,
} from "@/src/i18n"
import { attachContextMenu, disableModes, setMenu } from "@/src/menu"
import { registerHandlers, registerSyncHandlers } from "@/src/registerHandlers"
import { defaultClipboardClearSeconds } from "@/src/shared/clipboardClearSeconds"
import { get as getConfig, set as setConfig } from "@/src/utilities/config"
import { sendEvent } from "@/src/utilities/ipc/sendEvent"
import { matchesUrlOrigin } from "@/src/utilities/matchesUrlOrigin"
import { isSuperbackedOs } from "@/src/utilities/superbackedOs"

declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string
declare const MAIN_WINDOW_WEBPACK_ENTRY: string

// Electron’s asar filesystem shim constructs fs.Stats (DEP0180), spilling
// deprecation warnings into command-line interface output — suppress them
// in packaged builds only, so development keeps surfacing them
if (app.isPackaged) {
  process.noDeprecation = true
}

// Superbacked OS is Wayland-only and every bundled app pins Wayland: the
// desktop entry sets ELECTRON_OZONE_PLATFORM_HINT, but a terminal launch
// inherits the session’s DISPLAY and Chromium would reach for Xwayland,
// whose clients share one flat trust domain — so the pin is applied from
// inside as well and holds on every launch path (elsewhere the platform
// stays Chromium’s choice, as X11-only desktops must keep working)
if (isSuperbackedOs()) {
  app.commandLine.appendSwitch("ozone-platform", "wayland")
}

app.setName("Superbacked")

cli.name("superbacked")
cli.version(app.getVersion(), "--version", "output version")

cli.helpOption("-h, --help", "display help")

// Root so the mode reads as app-wide, like the Settings toggle — creation
// and derivation stretch at the paranoid profile and restoration trials
// it (see src/shared/kdfProfiles.ts)
cli.option(
  "--paranoid",
  "harden key derivation (requires at least 1 GiB of memory and --paranoid to restore or derive again)"
)

cli
  .command("create-standalone-archive")
  .description("create standalone archive")
  .argument("<path...>", "one or more files or directories to encrypt")
  .requiredOption(
    "-o, --output <archive>",
    "archive path (.superbacked appended if absent)"
  )
  .option("-f, --force", "overwrite archive if it already exists")
  .addOption(
    new CommanderOption(
      "-s, --slot <slot>",
      "HMAC-SHA1 challenge-response slot"
    )
      .choices(["1", "2"])
      .default("2")
  )
  .option(
    "--yubikey",
    "protect archive with YubiKey (restoring requires a YubiKey provisioned with the same challenge-response secret)"
  )
  .action(createStandaloneArchiveAction)

cli
  .command("restore-standalone-archive")
  .description("restore standalone archive")
  .argument("<archive>", "archive path")
  .requiredOption(
    "-o, --output <directory>",
    "directory archive is extracted to"
  )
  .addOption(
    new CommanderOption(
      "-s, --slot <slot>",
      "HMAC-SHA1 challenge-response slot"
    )
      .choices(["1", "2"])
      .default("2")
  )
  .option("--yubikey", "restore archive protected with YubiKey")
  .action(restoreStandaloneArchiveAction)

cli
  .command("provision-yubikey")
  .description(
    "provision YubiKey slot with HMAC-SHA1 challenge-response credential"
  )
  .option("-g, --generate", "generate secret and print it to stdout")
  .addOption(
    new CommanderOption("-s, --slot <slot>", "slot to provision")
      .choices(["1", "2"])
      .default("2")
  )
  .option("--no-touch", "compute responses without touch (weaker)")
  .action(provisionYubikeyAction)

cli
  .command("derive-bitcoin-wallet")
  .description(
    "derive Bitcoin wallet from master passphrase and YubiKey, printing its extended public key"
  )
  .argument(
    "[label]",
    "memorized label (for example hotwallet), prompted when omitted"
  )
  .option(
    "--addresses <count>",
    "print first receive addresses",
    parseAddresses
  )
  .option(
    "--clear <seconds>",
    "seconds before revealed secret is cleared from clipboard",
    parseClear,
    defaultClipboardClearSeconds
  )
  .option(
    "--confirm-passphrase",
    "confirm master passphrase (recommended when creating wallets)"
  )
  .addOption(
    new CommanderOption(
      "--derivation-version <version>",
      "derivation scheme version"
    )
      .choices(["1"])
      .default("1")
  )
  .option(
    "-p, --print",
    "print revealed secret instead of copying it to clipboard"
  )
  .addOption(
    new CommanderOption(
      "--reveal <secret>",
      "copy mnemonic or extended private key to clipboard"
    ).choices(["mnemonic", "zprv"])
  )
  .addOption(
    new CommanderOption(
      "-s, --slot <slot>",
      "HMAC-SHA1 challenge-response slot"
    )
      .choices(["1", "2"])
      .default("2")
  )
  .addOption(
    new CommanderOption("--words <words>", "mnemonic length in words")
      .choices(["12", "24"])
      .default("24")
  )
  .action(deriveBitcoinWalletAction)

cli
  .command("derive-password")
  .description("derive password from master passphrase and YubiKey")
  .argument(
    "[label]",
    "memorized label (for example github or proton), prompted when omitted"
  )
  .option(
    "--clear <seconds>",
    "seconds before copied password is cleared from clipboard",
    parseClear,
    defaultClipboardClearSeconds
  )
  .option(
    "--confirm-passphrase",
    "confirm master passphrase (recommended when creating passwords)"
  )
  .addOption(
    new CommanderOption(
      "--derivation-version <version>",
      "derivation scheme version"
    )
      .choices(["1"])
      .default("1")
  )
  .option("-l, --length <length>", "password length", parseLength, 16)
  .option("-p, --print", "print password instead of copying it to clipboard")
  .addOption(
    new CommanderOption(
      "-s, --slot <slot>",
      "HMAC-SHA1 challenge-response slot"
    )
      .choices(["1", "2"])
      .default("2")
  )
  .action(derivePasswordAction)

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

let mainWindowId: null | number = null

export const createWindow = async (): Promise<BrowserWindow> => {
  return new Promise((resolve, reject) => {
    const savedGeometry = getConfig("windowGeometry")
    const windowWidth = 800
    const windowHeight = 600
    const mainWindow = new BrowserWindow({
      backgroundColor: "#0f0e19",
      width: savedGeometry?.width ?? windowWidth,
      height: savedGeometry?.height ?? windowHeight,
      x: savedGeometry?.x,
      y: savedGeometry?.y,
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
    attachContextMenu(mainWindow)
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
      const { width, height } = mainWindow.getContentBounds()
      const { x, y } = mainWindow.getBounds()
      setConfig("windowGeometry", { width, height, x, y })
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
      // Limit networking to trusted URLs — registered before any window loads
      // so every page (including the main window) goes through the filter.
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const allowed =
          // #if process.env.ENV === "development"
          matchesUrlOrigin(details.url, "http://localhost:3000") ||
          matchesUrlOrigin(details.url, "ws://localhost:3000") ||
          // #endif
          // #if process.env.ENV === "production"
          /^file:\/\//.test(details.url) ||
          // #endif
          /^devtools:\/\//.test(details.url)
        callback({ cancel: !allowed })
      })
      await createWindow()
    })

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit()
      }
    })

    ipcMain.on("newWindow", async () => {
      await createWindow()
    })

    registerSyncHandlers()
    registerHandlers()
  })

// Subcommands never open a window, but Electron still boots Chromium in
// the background, whose GPU process can spill errors into interactive
// prompts (for example a Wayland/Vulkan incompatibility complaint on
// Superbacked OS) — drop GPU work and non-fatal Chromium logging before
// any subcommand runs (parsing is synchronous, so the switches land
// before Chromium is ready)
cli.hook("preSubcommand", () => {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch("disable-gpu")
  // The GPU process starts even with the GPU disabled (it hosts the
  // display compositor) and enumerates hardware video codecs on the way
  // up — on hardware without a matching libva driver the VA-API probe
  // itself logs an error (vaInitialize failed). Subcommands decode no
  // media, so the probes are skipped outright
  app.commandLine.appendSwitch("disable-accelerated-video-decode")
  app.commandLine.appendSwitch("disable-accelerated-video-encode")
  // log-level only takes effect alongside enable-logging (whose stderr
  // value also keeps Chromium from considering log files)
  app.commandLine.appendSwitch("enable-logging", "stderr")
  app.commandLine.appendSwitch("log-level", "3")
  // Chromium catches SIGINT and SIGTERM and shuts down cleanly with exit
  // code 0, so an interrupted prompt reads as success to the shell —
  // pipefail sees nothing and bash continues the script, treating the
  // interrupt as handled. Exit with the shell convention for
  // death-by-signal (128 + signal number) instead; terminal echo is
  // restored by the prompt guard on any exit path (see
  // src/cli/utilities/readPassphrase.ts). Registration must wait for
  // ready: the last sigaction installed wins, Chromium's shutdown
  // detector installs its own during browser main loop startup, and
  // libuv installs the process-level handler only when the first
  // listener for a signal is added — registering here at parse time
  // would be silently overwritten moments later
  void app.whenReady().then(() => {
    process.on("SIGINT", () => process.exit(130))
    process.on("SIGTERM", () => process.exit(143))
  })
})

cli.parse()
