import { shell } from "electron"
import { stat } from "fs/promises"

export default async (path: string) => {
  const stats = await stat(path)
  if (stats.isFile()) {
    shell.showItemInFolder(path)
  } else {
    await shell.openPath(path)
  }
}
