import { spawn } from "child_process"
import { app } from "electron"
import { join, resolve as resolvePath } from "path"

// Guards are a closed set of bundled scripts (bin/posix/guard), each
// with its command hardcoded — no shell is ever executed directly, so
// under the Superbacked OS AppArmor profile dash needs only its
// interpreter (mmap) grant, and no script can be turned into a
// run-anything gadget
type GuardName =
  | "clear-clipboard-darwin"
  | "clear-clipboard-wayland"
  | "restore-terminal-state"

const env = process.env.ENV ?? "development"
// Development runs from the package root (npm scripts and electron-forge
// both set it), so the anchor is the working directory rather than
// __dirname — which differs between the webpack bundle and tsx-run tests,
// and would break if this module moved
const guardDir =
  env === "development"
    ? resolvePath(process.cwd(), "bin", "posix", "guard")
    : join(app.getAppPath(), "bin", "posix", "guard").replace(
        "app.asar",
        "app.asar.unpacked"
      )

/**
 * Spawn a guard that runs a bundled script when this process dies — the
 * guard blocks on a pipe held by this process, so normal exit and death
 * by any signal alike close the pipe and trigger the script. Electron’s
 * main process does not reliably dispatch POSIX signals to JavaScript
 * handlers (Chromium installs its own), so in-process cleanup alone can
 * be skipped. Resolves once the guard is live: spawn failures (a missing
 * or denied script) arrive asynchronously on the error event, and
 * awaiting the spawn event turns them into rejections instead of
 * uncaught exceptions.
 * @param name guard script name
 * @param args positional arguments passed to the script
 * @returns release function, preventing the script from running
 */
export default (
  name: GuardName,
  args: readonly string[] = []
): Promise<() => void> => {
  return new Promise((resolve, reject) => {
    const guard = spawn(join(guardDir, name), args, {
      // Ctrl-C signals the whole foreground process group — the guard must
      // live in its own group and session or it dies alongside the very
      // process it guards
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    })
    // Stays attached past the spawn event — a post-spawn error must never
    // be an uncaught exception (rejecting a settled promise is a no-op)
    guard.on("error", reject)
    guard.once("spawn", () => {
      guard.unref()
      resolve(() => {
        guard.kill()
      })
    })
  })
}
