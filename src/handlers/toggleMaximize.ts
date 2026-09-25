import { getMainWindow } from "@/src/index"
import { getSenderWindow } from "@/src/utilities/ipc/handleContext"

export default function toggleMaximize(): void {
  const window = getSenderWindow() ?? getMainWindow()
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  }
}
