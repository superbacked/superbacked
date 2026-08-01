import {
  BrowserWindow,
  Menu,
  MenuItemConstructorOptions,
  app,
  ipcMain,
  systemPreferences,
  webContents,
} from "electron"

import { t } from "i18next"

// Commented out with the language menu below — see src/i18n.ts.
// import { locales, resources } from "@/src/i18n"
// import { locale, setLocale } from "@/src/index"
import { sendEvent } from "@/src/utilities/ipc/sendEvent"

if (process.platform === "darwin") {
  systemPreferences.setUserDefault(
    "NSDisabledDictationMenuItem",
    "boolean",
    true
  )
  systemPreferences.setUserDefault(
    "NSDisabledCharacterPaletteMenuItem",
    "boolean",
    true
  )
}

type Mode = "insert" | "select"

const enabledModes: Set<Mode> = new Set()

export const setMenu = () => {
  const runningMacOS = process.platform === "darwin"
  const debuggingModeEnabled = app.isPackaged === false || app.inspect === true
  // The language menu is commented out while English is the only locale —
  // restore this block, the imports above and the menu item below to
  // re-enable it (see src/i18n.ts for the kept example language).
  // const chooseLanguageSubmenu: MenuItemConstructorOptions[] = []
  // for (const chooseLanguageSubmenuLocale of locales) {
  //   chooseLanguageSubmenu.push({
  //     label: resources[chooseLanguageSubmenuLocale].label,
  //     type: "checkbox",
  //     checked: chooseLanguageSubmenuLocale === locale ? true : false,
  //     async click() {
  //       await setLocale(chooseLanguageSubmenuLocale)
  //       setMenu()
  //     },
  //   })
  // }
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.getName(),
      submenu: [
        {
          label: `${t("menu.superbacked.about")} ${app.getName()}`,
          async click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              sendEvent(focusedWindow, "menuAbout")
            }
          },
        },
        { type: "separator" },
        // About, separator, Settings — the macOS app menu convention
        {
          label: t("menu.superbacked.settings"),
          accelerator: "CommandOrControl+,",
          async click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              sendEvent(focusedWindow, "menuSettings")
            }
          },
        },
        { type: "separator", visible: runningMacOS },
        {
          visible: runningMacOS,
          role: "hide",
          label: `${t("menu.superbacked.hide")} ${app.getName()}`,
        },
        { type: "separator" },
        {
          role: "quit",
          label: `${t("menu.superbacked.quit")} ${app.getName()}`,
        },
      ],
    },
    {
      label: t("menu.file.file"),
      submenu: [
        {
          label: t("menu.file.create"),
          accelerator: runningMacOS ? "Shift+Command+C" : "Shift+Ctrl+C",
          async click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              sendEvent(focusedWindow, "menuTriggeredRoute", "/")
            }
          },
        },
        {
          label: t("menu.file.duplicate"),
          accelerator: runningMacOS ? "Shift+Command+D" : "Shift+Ctrl+D",
          async click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              sendEvent(focusedWindow, "menuTriggeredRoute", "/duplicate")
            }
          },
        },
        {
          label: t("menu.file.restore"),
          accelerator: runningMacOS ? "Shift+Command+R" : "Shift+Ctrl+R",
          async click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              sendEvent(focusedWindow, "menuTriggeredRoute", "/restore")
            }
          },
        },
        { type: "separator" },
        {
          label: `${t("menu.file.newWindow")}`,
          accelerator: runningMacOS ? "Command+N" : "Ctrl+N",
          click() {
            ipcMain.emit("newWindow")
          },
        },
        { type: "separator" },
        {
          label: `${t("menu.file.closeWindow")}`,
          accelerator: runningMacOS ? "Command+W" : "Ctrl+W",
          click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.close()
            }
          },
        },
      ],
    },
    {
      label: t("menu.edit.edit"),
      // Roles route through the native responder chain (macOS
      // performSelector), so the shortcuts work wherever focus sits —
      // text fields, static selections, dialogs — where a custom click
      // through webContents.getFocusedWebContents() silently missed
      // during accelerator dispatch. Roles supply the platform-correct
      // accelerators; translated labels override the built-in ones.
      submenu: [
        {
          role: "undo",
          label: t("menu.edit.undo"),
        },
        {
          role: "redo",
          label: t("menu.edit.redo"),
        },
        { type: "separator" },
        {
          role: "cut",
          label: t("menu.edit.cut"),
        },
        {
          role: "copy",
          label: t("menu.edit.copy"),
        },
        {
          role: "paste",
          label: t("menu.edit.paste"),
        },
        {
          role: "selectAll",
          label: t("menu.edit.selectAll"),
        },
      ],
    },
    {
      label: t("menu.insert.insert"),
      submenu: [
        {
          enabled: enabledModes.has("insert"),
          label: t("menu.insert.bip39Mnemonic"),
          accelerator: runningMacOS ? "Shift+Command+M" : "Shift+Ctrl+M",
          click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              sendEvent(focusedWindow, "menuInsert", "mnemonic")
            }
          },
        },
        {
          enabled: enabledModes.has("insert"),
          label: t("menu.insert.bip39Passphrase"),
          accelerator: runningMacOS ? "Shift+Command+P" : "Shift+Ctrl+P",
          click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              sendEvent(focusedWindow, "menuInsert", "password")
            }
          },
        },
        {
          enabled: enabledModes.has("insert"),
          label: t("menu.insert.passphrase"),
          accelerator: runningMacOS ? "Shift+Command+E" : "Shift+Ctrl+E",
          click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              sendEvent(focusedWindow, "menuInsert", "passphrase")
            }
          },
        },
        {
          enabled: enabledModes.has("insert"),
          label: t("menu.insert.scanQrCode"),
          accelerator: runningMacOS ? "Shift+Command+S" : "Shift+Ctrl+S",
          click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              sendEvent(focusedWindow, "menuInsert", "scanQrCode")
            }
          },
        },
      ],
    },
    {
      label: t("menu.view.view"),
      submenu: [
        // {
        //   label: t("menu.view.chooseLanguage"),
        //   submenu: chooseLanguageSubmenu,
        // },
        // { type: "separator" },
        {
          enabled: enabledModes.has("select"),
          label: t("menu.view.showSelectionAsQrCode"),
          click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              sendEvent(focusedWindow, "menuShowSelectionAsQrCode")
            }
          },
        },
        {
          type: "separator",
          visible: debuggingModeEnabled,
        },
        {
          visible: debuggingModeEnabled,
          label: t("menu.view.reload"),
          accelerator: runningMacOS ? "Command+R" : "Ctrl+R",
          click() {
            webContents.getFocusedWebContents()?.reload()
          },
        },
        {
          visible: debuggingModeEnabled,
          label: t("menu.view.toggleDeveloperTools"),
          accelerator: runningMacOS ? "Alt+Command+I" : "Ctrl+Shift+I",
          click() {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.toggleDevTools()
            }
          },
        },
      ],
    },
  ]
  // See https://github.com/electron/electron/issues/39460
  const filteredTemplate = template.map((menu) => {
    if (menu.submenu instanceof Array) {
      return {
        ...menu,
        submenu: menu.submenu.filter((item) => {
          return item.submenu instanceof Array ? true : item.visible !== false
        }),
      }
    } else {
      return menu
    }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(filteredTemplate))
}

export const enableModes = (modes: Mode[]) => {
  let changed = false
  for (const mode of modes) {
    if (enabledModes.has(mode) === false) {
      enabledModes.add(mode)
      changed = true
    }
  }
  if (changed === true) {
    setMenu()
  }
}

export const disableModes = (modes: Mode[]) => {
  let changed = false
  for (const mode of modes) {
    if (enabledModes.has(mode) === true) {
      enabledModes.delete(mode)
      changed = true
    }
  }
  if (changed === true) {
    setMenu()
  }
}
