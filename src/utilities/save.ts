import { BrowserWindow, dialog } from "electron"
import { join } from "path"

import { writeFile } from "fs-extra"

import { Qr } from "@/src/create"

export type Format = "jpg" | "pdf"

export default async (qrs: Qr[], formats: Format[]): Promise<boolean> => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    // This should never happen, but tracking edge case (required by TypeScript type check)
    throw new Error("Could not get focussed window")
  }
  const openDialogReturnValue = await dialog.showOpenDialog(window, {
    buttonLabel: "Save",
    properties: ["createDirectory", "openDirectory"],
  })
  if (openDialogReturnValue.canceled !== true) {
    const selectedPath = openDialogReturnValue.filePaths[0]
    if (!selectedPath) {
      // This should never happen, but tracking edge case (required by TypeScript type check)
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
