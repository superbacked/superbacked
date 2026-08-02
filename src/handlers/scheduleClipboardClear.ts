import { defaultClipboardClearSeconds } from "@/src/shared/utilities/clipboard"
import { clearText, readText, spawnClearGuard } from "@/src/utilities/clipboard"
import { get as getConfig } from "@/src/utilities/config"
import { timingSafeEqualStrings } from "@/src/utilities/crypto/primitives"

// Deferred conditional clear for app copies — the same contract as the
// command-line interface’s --clear flow (see src/cli/derivePassword.ts):
// after the configured seconds the clipboard is cleared only when it
// still holds the copied text, and a guard clears it should the app die
// first — the clipboard outlives the process on macOS (the pasteboard)
// and Wayland (the wl-copy daemon). Living in the main process, the
// timer survives navigation and window close. One clear is pending at a
// time: a newer copy supersedes the older timer (the older text is off
// the clipboard anyway), and the guard spans until no clear is pending.

let timer: NodeJS.Timeout | undefined
let releaseClearGuard: (() => void) | undefined

export default async (text: string): Promise<void> => {
  clearTimeout(timer)
  releaseClearGuard ??= spawnClearGuard()
  const seconds =
    getConfig("clipboardClearSeconds") ?? defaultClipboardClearSeconds
  timer = setTimeout(() => {
    void (async () => {
      // Leave the clipboard alone if the user copied something else
      // meanwhile
      if (timingSafeEqualStrings(await readText(), text) === true) {
        await clearText()
      }
      releaseClearGuard?.()
      releaseClearGuard = undefined
      timer = undefined
    })()
  }, seconds * 1000)
}
