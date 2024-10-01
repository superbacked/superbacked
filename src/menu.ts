import {
  app,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  systemPreferences,
} from "electron"
import { t } from "i18next"
import { locale, setLocale } from "./index"
import { locales, resources } from "./i18n"

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

export const enableModes = (modes: Mode[]) => {
  for (const mode of modes) {
    enabledModes.add(mode)
  }
  setMenu()
}

export const disableModes = (modes: Mode[]) => {
  for (const mode of modes) {
    enabledModes.delete(mode)
  }
  setMenu()
}

export let showHiddenSecrets = false

export const setMenu = () => {
  const runningMacOS = process.platform === "darwin"
  const debuggingModeEnabled = app.isPackaged === false || app.inspect === true
  const chooseLanguageSubmenu: MenuItemConstructorOptions[] = []
  for (const chooseLanguageSubmenuLocale of locales) {
    chooseLanguageSubmenu.push({
      label: resources[chooseLanguageSubmenuLocale].label,
      type: "checkbox",
      checked: chooseLanguageSubmenuLocale === locale ? true : false,
      async click() {
        setLocale(chooseLanguageSubmenuLocale)
        setMenu()
      },
    })
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.getName(),
      submenu: [
        {
          label: `${t("menu.superbacked.about")} ${app.getName()}`,
          async click(menuItem, browserWindow) {
            browserWindow.webContents.send("menu:about")
          },
        },
        { type: "separator", visible: runningMacOS },
        {
          visible: runningMacOS,
          label: `${t("menu.superbacked.hide")} ${app.getName()}`,
          role: "hide",
        },
        { type: "separator" },
        {
          label: `${t("menu.superbacked.quit")} ${app.getName()}`,
          role: "quit",
        },
      ],
    },
    {
      label: t("menu.file.file"),
      submenu: [
        {
          label: t("menu.file.create"),
          accelerator: runningMacOS ? "Shift+Command+C" : "Shift+Ctrl+C",
          async click(menuItem, browserWindow) {
            browserWindow.webContents.send("menu:triggeredRoute", "/")
          },
        },
        {
          label: t("menu.file.duplicate"),
          accelerator: runningMacOS ? "Shift+Command+D" : "Shift+Ctrl+D",
          async click(menuItem, browserWindow) {
            browserWindow.webContents.send("menu:triggeredRoute", "/duplicate")
          },
        },
        {
          label: t("menu.file.restore"),
          accelerator: runningMacOS ? "Shift+Command+R" : "Shift+Ctrl+R",
          async click(menuItem, browserWindow) {
            browserWindow.webContents.send("menu:triggeredRoute", "/restore")
          },
        },
        { type: "separator" },
        {
          label: `${t("menu.file.newWindow")}`,
          accelerator: runningMacOS ? "Command+N" : "Ctrl+N",
          click() {
            ipcMain.emit("app:newWindow")
          },
        },
        { type: "separator" },
        {
          label: `${t("menu.file.closeWindow")}`,
          accelerator: runningMacOS ? "Command+W" : "Ctrl+W",
          click(menuItem, browserWindow) {
            browserWindow.close()
          },
        },
      ],
    },
    {
      label: t("menu.edit.edit"),
      submenu: [
        {
          label: `${t("menu.edit.undo")}`,
          accelerator: runningMacOS ? "Command+Z" : "Ctrl+Z",
          click(menuItem, browserWindow) {
            browserWindow.webContents.undo()
          },
        },
        {
          label: `${t("menu.edit.redo")}`,
          accelerator: runningMacOS ? "Shift+Command+Z" : "Shift+Ctrl+Z",
          click(menuItem, browserWindow) {
            browserWindow.webContents.redo()
          },
        },
        { type: "separator" },
        {
          label: `${t("menu.edit.cut")}`,
          accelerator: runningMacOS ? "Command+X" : "Ctrl+X",
          click(menuItem, browserWindow) {
            browserWindow.webContents.cut()
          },
        },
        {
          label: `${t("menu.edit.copy")}`,
          accelerator: runningMacOS ? "Command+C" : "Ctrl+C",
          click(menuItem, browserWindow) {
            browserWindow.webContents.copy()
          },
        },
        {
          label: `${t("menu.edit.paste")}`,
          accelerator: runningMacOS ? "Command+V" : "Ctrl+V",
          click(menuItem, browserWindow) {
            browserWindow.webContents.paste()
          },
        },
        {
          label: `${t("menu.edit.selectAll")}`,
          accelerator: runningMacOS ? "Command+A" : "Ctrl+A",
          click(menuItem, browserWindow) {
            browserWindow.webContents.selectAll()
          },
        },
      ],
    },
    {
      label: t("menu.insert.insert"),
      submenu: [
        {
          enabled: enabledModes.has("insert"),
          label: t("menu.insert.mnemonic"),
          accelerator: runningMacOS ? "Shift+Command+M" : "Shift+Ctrl+M",
          click(menuItem, browserWindow) {
            browserWindow.webContents.send("menu:insert", "mnemonic")
          },
        },
        {
          enabled: enabledModes.has("insert"),
          label: t("menu.insert.passphrase"),
          accelerator: runningMacOS ? "Shift+Command+P" : "Shift+Ctrl+P",
          click(menuItem, browserWindow) {
            browserWindow.webContents.send("menu:insert", "passphrase")
          },
        },
        {
          enabled: enabledModes.has("insert"),
          label: t("menu.insert.scanQrCode"),
          accelerator: runningMacOS ? "Shift+Command+S" : "Shift+Ctrl+S",
          click(menuItem, browserWindow) {
            browserWindow.webContents.send("menu:insert", "scanQrCode")
          },
        },
      ],
    },
    {
      label: t("menu.view.view"),
      submenu: [
        {
          label: t("menu.view.chooseLanguage"),
          submenu: chooseLanguageSubmenu,
        },
        { type: "separator" },
        {
          type: "checkbox",
          checked: showHiddenSecrets,
          label: t("menu.view.showHiddenSecrets"),
          click(menuItem, browserWindow) {
            showHiddenSecrets = menuItem.checked
            browserWindow.webContents.send(
              "menu:showHiddenSecrets",
              showHiddenSecrets
            )
            setMenu()
          },
        },
        { type: "separator" },
        {
          enabled: enabledModes.has("select"),
          label: t("menu.view.showSelectionAsQrCode"),
          click(menuItem, browserWindow) {
            browserWindow.webContents.send("menu:showSelectionAsQrCode")
          },
        },
        {
          type: "separator",
          visible: debuggingModeEnabled,
        },
        {
          visible: debuggingModeEnabled,
          label: t("menu.view.reload"),
          role: "reload",
        },
        {
          visible: debuggingModeEnabled,
          label: t("menu.view.toggleDeveloperTools"),
          role: "toggleDevTools",
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
