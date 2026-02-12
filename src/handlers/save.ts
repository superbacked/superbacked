import { join } from "path"

import { writeFile } from "fs-extra"
import { t } from "i18next"

import chooseDirectory from "@/src/handlers/chooseDirectory"
import { Qr } from "@/src/handlers/create"

export type Format = "jpg" | "pdf"

export default async (
  qrs: Qr[],
  formats: Format[]
): Promise<{ success: boolean; directoryPath?: string }> => {
  const message =
    qrs.length > 1
      ? t("handlers.save.chooseWhereToSaveBlockset")
      : t("handlers.save.chooseWhereToSaveBlock")
  const saveDialogReturnValue = await chooseDirectory(message)
  if (saveDialogReturnValue.canceled !== true) {
    const selectedPath = saveDialogReturnValue.filePath
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
    return { success: true, directoryPath: selectedPath }
  }
  return { success: false }
}
