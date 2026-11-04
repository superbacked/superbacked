import { BrowserWindow } from "electron"

import { sendEvent } from "@/src/utilities/ipc/sendEvent"

// The touch prompt targets every window — the deriving flow lives in
// whichever window invoked the handler, and the event carries no data
export default (): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    sendEvent(window, "yubikeyTouchRequired")
  }
}
