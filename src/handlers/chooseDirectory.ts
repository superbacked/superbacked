import { dialog } from "electron"

import { getMainWindow } from "@/src/index"

export type ChooseDirectoryResult =
  | { canceled: true; filePath: null }
  | { canceled: false; filePath: string }

export default async (message: string): Promise<ChooseDirectoryResult> => {
  const window = getMainWindow()
  if (!window) {
    throw new Error("Could not get main window")
  }
  const openDialogReturnValue = await dialog.showOpenDialog(window, {
    message: message,
    properties: ["createDirectory", "openDirectory"],
    title: message,
  })
  if (openDialogReturnValue.canceled === true) {
    return {
      canceled: true,
      filePath: null,
    }
  }
  const selectedPath = openDialogReturnValue.filePaths[0]
  if (!selectedPath) {
    throw new Error("Could not get selected path")
  }
  return {
    canceled: false,
    filePath: selectedPath,
  }
}
