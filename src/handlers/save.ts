import { BrowserWindow, dialog } from "electron"
import { join } from "path"

import { writeFile } from "fs-extra"
import { t } from "i18next"

import { Qr } from "@/src/handlers/create"

export type Format = "jpg" | "pdf"

export default async (qrs: Qr[], formats: Format[]): Promise<boolean> => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    throw new Error("Could not get focussed window")
  }
  const message = t("utilities.save.chooseWhereToSaveBlock", {
    count: qrs.length,
  })
  const openDialogReturnValue = await dialog.showOpenDialog(window, {
    message: message,
    properties: ["createDirectory", "openDirectory"],
    title: message,
  })
  if (openDialogReturnValue.canceled !== true) {
    const selectedPath = openDialogReturnValue.filePaths[0]
    if (!selectedPath) {
      throw new Error("Could not get selected path")
    }
    for (const qr of qrs) {
      if (formats.includes("jpg")) {
        const jpgFile = join(selectedPath, `${qr.shortHash}.jpg`)
        await writeFile(jpgFile, qr.jpg, "base64")
      }
      if (formats.includes("pdf")) {
        const pdfFile = join(selectedPath, `${qr.shortHash}.pdf`)
        await writeFile(pdfFile, qr.pdf, "base64")
      }
    }
    return true
  }
  return false
}
