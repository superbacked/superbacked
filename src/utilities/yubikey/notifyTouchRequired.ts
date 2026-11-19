import { BrowserWindow } from "electron"

import { getSenderWindow } from "@/src/utilities/ipc/handleContext"
import { sendEvent } from "@/src/utilities/ipc/sendEvent"

// The touch prompt targets the window whose IPC call is waiting on the
// key — another window may be mid-flow with its own confirmation open, and
// a stray prompt there would be wrong at best and, where a flow awaits a
// modal, a wedge. The sender comes from the handle context (see
// src/utilities/ipc/handleContext.ts); outside one, every window is told,
// as nothing narrower is known
export default (): void => {
  const window = getSenderWindow()
  if (window !== null) {
    sendEvent(window, "yubikeyTouchRequired")
    return
  }
  for (const each of BrowserWindow.getAllWindows()) {
    sendEvent(each, "yubikeyTouchRequired")
  }
}
