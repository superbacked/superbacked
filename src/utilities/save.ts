import { BrowserWindow, dialog } from "electron"
import { writeFile } from "fs-extra"
import { join } from "path"
import { Qr } from "../create"

export type Format = "jpg" | "pdf"

export default async (qrs: Qr[], formats?: Format[]): Promise<boolean> => {
  const window = BrowserWindow.getFocusedWindow()
  const openDialogReturnValue = await dialog.showOpenDialog(window, {
    buttonLabel: "Save",
    properties: ["createDirectory", "openDirectory"],
  })
  if (openDialogReturnValue.canceled !== true) {
    for (const qr of qrs) {
      if (formats.includes("jpg")) {
        const jpgFile = join(
          openDialogReturnValue.filePaths[0],
          `${qr.shortHash}.jpg`
        )
        await writeFile(jpgFile, qr.jpg, "base64")
      }
      if (formats.includes("pdf")) {
        const pdfFile = join(
          openDialogReturnValue.filePaths[0],
          `${qr.shortHash}.pdf`
        )
        await writeFile(pdfFile, qr.pdf, "base64")
      }
    }
    return true
  }
  return false
}
