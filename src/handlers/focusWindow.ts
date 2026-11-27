import { BrowserWindow } from "electron"

import { getMainWindow } from "@/src/index"
import { getSenderWindow } from "@/src/utilities/ipc/handleContext"
import spawn from "@/src/utilities/spawn"
import { isSuperbackedOs } from "@/src/utilities/superbackedOs"

// A drop hands the window files, not keyboard focus — the source window
// (a file manager) keeps it, so a field the renderer focuses afterwards
// shows a caret while keystrokes land in the file manager (see
// superbacked/superbacked#42). Asking the compositor works on X11 (the
// request carries a fresh server timestamp) and is refused on Wayland,
// where Electron runs in every Wayland session since Electron 38 — the
// reasons, verified against Mutter, are in the header of the Superbacked
// OS activation extension (superbacked-os-bootstrap-assets/
// gnome-shell-extensions/activation@superbacked.com/extension.js),
// which grants focus from the compositor side when asked over the
// session bus. Elsewhere on native Wayland the user clicks the window.
// Nothing awaits the outcome: the renderer follows the window’s focus
// through its own event (see src/main/utilities/windowFocus.ts) and
// holds a prompt’s autofocus until focus has actually arrived

// gdbus inherits the app’s AppArmor profile, which is the credential
// the extension checks on the caller. The timeout bounds the wait
// should the extension be absent or mid-reload
const requestActivationFromShell = async (): Promise<void> => {
  try {
    await spawn(
      "gdbus",
      [
        "call",
        "--dest",
        "org.gnome.Shell",
        "--method",
        "com.superbacked.Activation.Activate",
        "--object-path",
        "/com/superbacked/Activation",
        "--session",
        "--timeout",
        "1",
      ],
      { stdio: ["ignore", "ignore", "ignore"] }
    )
  } catch {
    // Extension absent or refusing — nothing else to try
  }
}

export default async function focusWindow(): Promise<void> {
  const window: null | BrowserWindow = getSenderWindow() ?? getMainWindow()
  if (window === null || window.isDestroyed() || window.isFocused()) {
    return
  }
  if (isSuperbackedOs()) {
    await requestActivationFromShell()
    return
  }
  window.focus()
}
