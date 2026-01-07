import { getMainWindow } from "@/src/index"

export default function toggleMaximize(): void {
  const window = getMainWindow()
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  }
}
