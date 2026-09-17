import { app, clipboard } from "electron"

import spawn, { SpawnError } from "@/src/utilities/spawn"
import spawnGuard from "@/src/utilities/spawnGuard"

// The clipboard goes through the operating system’s own utility wherever
// the platform ships or requires one: pbcopy and pbpaste on macOS, and
// wl-clipboard on Wayland — which lets only a focused surface set the
// selection, silently ignoring writes from windowless processes such as
// the command-line interface, so wl-copy is required there — it briefly
// maps an invisible surface to acquire the selection (blinking a dock icon
// on GNOME, whose compositor implements no data-control protocol) and
// forks a daemon that keeps owning it. Only X11 uses Electron’s
// clipboard: the platform preinstalls no utility and Electron suffices,
// as the selection lives and dies with the process. Text is fed to the
// utilities through stdin — secrets must never appear in argv, which is
// visible in process listings.

const usesWayland = (): boolean =>
  process.platform === "linux" &&
  typeof process.env.WAYLAND_DISPLAY === "string" &&
  process.env.WAYLAND_DISPLAY !== ""

/**
 * Copy text to clipboard, failing loudly when copying is impossible —
 * reporting a copy that never happened would be worse than an error
 * @param text text to copy
 */
export const copyText = async (text: string): Promise<void> => {
  if (usesWayland() === true) {
    try {
      // wl-copy forks a daemon that serves the selection and inherits any
      // stdio pipes — leaving stdout and stderr piped would defer the
      // close event (and this await) until the daemon itself exits
      await spawn("wl-copy", [], {
        input: text,
        stdio: ["pipe", "ignore", "ignore"],
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          "wl-clipboard is required to copy on Wayland — install it or use --print"
        )
      }
      throw error
    }
  } else if (process.platform === "darwin") {
    await spawn("pbcopy", [], { input: text })
  } else {
    // The clipboard module requires the ready event on Linux — and the
    // process must stay alive while the text is on the clipboard, as X11
    // drops a selection when its owner exits
    await app.whenReady()
    clipboard.writeText(text)
  }
}

/**
 * Read clipboard text
 * @returns clipboard text, empty when the clipboard is empty or unreadable
 */
export const readText = async (): Promise<string> => {
  if (usesWayland() === true) {
    try {
      // --no-newline strips the newline wl-paste otherwise appends
      const { stdout } = await spawn("wl-paste", ["--no-newline"])
      return stdout
    } catch (error) {
      // Empty clipboard (wl-paste exits non-zero) — nothing to compare.
      // A wl-paste that could not run at all carries no exit code and
      // must surface: reading “empty” where reading is impossible would
      // silently defeat the conditional clear
      if ((error as SpawnError).exitCode === undefined) {
        throw error
      }
      return ""
    }
  } else if (process.platform === "darwin") {
    try {
      const { stdout } = await spawn("pbpaste")
      return stdout
    } catch (error) {
      // Unreadable pasteboard — nothing to compare; same spawn-failure
      // distinction as the wl-paste branch
      if ((error as SpawnError).exitCode === undefined) {
        throw error
      }
      return ""
    }
  } else {
    return clipboard.readText()
  }
}

/**
 * Clear clipboard
 */
export const clearText = async (): Promise<void> => {
  if (usesWayland() === true) {
    await spawn("wl-copy", ["--clear"], { stdio: "ignore" })
  } else if (process.platform === "darwin") {
    // An empty pasteboard and a cleared one paste identically
    await spawn("pbcopy", [], { input: "" })
  } else {
    clipboard.clear()
  }
}

/**
 * Guard against dying before a scheduled clipboard clear — where the
 * clipboard outlives the process (the pasteboard on macOS, the wl-copy
 * daemon on Wayland), copied text would otherwise survive Ctrl-C. X11
 * drops a selection with its owner, needing no guard. The guard blocks
 * on a pipe held by this process: normal exit and death by any signal
 * alike close the pipe, unblocking the guard, which clears the clipboard.
 * The happy path clears conditionally itself and releases the guard
 * before it can fire.
 * @returns release function
 */
export const spawnClearGuard = async (): Promise<() => void> => {
  if (usesWayland() === true) {
    return spawnGuard("clear-clipboard-wayland")
  }
  if (process.platform === "darwin") {
    return spawnGuard("clear-clipboard-darwin")
  }
  return () => undefined
}
