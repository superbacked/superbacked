import { getMainWindow } from "@/src/index"
import { getSenderWindow } from "@/src/utilities/ipc/handleContext"

// Seeds the renderer’s view of keyboard focus (see
// src/main/utilities/windowFocus.ts), which then follows the window’s
// focus and blur events
export default function isWindowFocused(): boolean {
  const window = getSenderWindow() ?? getMainWindow()
  return window !== null && window.isDestroyed() === false && window.isFocused()
}
