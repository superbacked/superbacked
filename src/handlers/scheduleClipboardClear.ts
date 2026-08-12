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
// A guard that cannot spawn rejects here, propagating over IPC before
// anything is copied — see src/main/utilities/clipboard.ts.

let timer: NodeJS.Timeout | undefined
let clearGuard: Promise<() => void> | undefined

export default async (text: string): Promise<void> => {
  clearTimeout(timer)
  // The promise (not its release function) is what is cached — two
  // copies in quick succession must share one guard, or the loser’s
  // guard would lurk unreleased and clear the clipboard at app death
  // long after the pending clear completed
  clearGuard ??= spawnClearGuard()
  let releaseClearGuard: () => void
  try {
    releaseClearGuard = await clearGuard
  } catch (error) {
    // Leave the next copy free to retry rather than caching the rejection
    clearGuard = undefined
    throw error
  }
  const seconds =
    getConfig("clipboardClearSeconds") ?? defaultClipboardClearSeconds
  timer = setTimeout(() => {
    void (async () => {
      try {
        // Leave the clipboard alone if the user copied something else
        // meanwhile
        if (timingSafeEqualStrings(await readText(), text) === true) {
          await clearText()
        }
        releaseClearGuard()
        clearGuard = undefined
      } catch (error) {
        // A clear that could not run leaves the guard armed — clearing
        // at app death is the remaining backstop — and logs: no caller
        // is left to reject to
        console.error(error)
      } finally {
        timer = undefined
      }
    })()
  }, seconds * 1000)
}
