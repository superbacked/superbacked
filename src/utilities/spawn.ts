import { SpawnOptions, spawn } from "child_process"

interface ExtendedSpawnOptions extends SpawnOptions {
  input?: Buffer | string
}

interface SpawnError extends Error {
  exitCode: number
}

interface SpawnReturnValue {
  stdout: string
  stderr: string
}

/**
 * Spawn a guard that runs a command when this process dies — the guard
 * blocks on a pipe held by this process, so normal exit and death by any
 * signal alike close the pipe and trigger the command. Electron’s main
 * process does not reliably dispatch POSIX signals to JavaScript handlers
 * (Chromium installs its own), so in-process cleanup alone can be skipped.
 * @param command shell command (positional arguments available as $1…)
 * @param args positional arguments
 * @returns release function, preventing the command from running
 */
export const spawnGuard = (
  command: string,
  args: readonly string[] = []
): (() => void) => {
  const guard = spawn(
    "sh",
    ["-c", `read -r _ || true; exec ${command}`, "sh", ...args],
    {
      // Ctrl-C signals the whole foreground process group — the guard must
      // live in its own group and session or it dies alongside the very
      // process it guards
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    }
  )
  guard.unref()
  return () => {
    guard.kill()
  }
}

const stripFinalNewline = (input: string) => {
  if (input[input.length - 1] === "\n") {
    input = input.slice(0, -1)
  }
  if (input[input.length - 1] === "\r") {
    input = input.slice(0, -1)
  }
  return input
}

export default async (
  command: string,
  args: readonly string[] = [],
  opts: ExtendedSpawnOptions = {}
): Promise<SpawnReturnValue> => {
  return new Promise((resolve, reject) => {
    const { input, ...otherOptions } = opts
    try {
      const spawned = spawn(command, args, otherOptions)
      // Failing to spawn (for example a missing binary) emits “error”, then
      // “close” with a null exit code — without this listener the null code
      // reads as success with empty output
      spawned.on("error", reject)
      let stdout = ""
      let stderr = ""
      if (spawned.stdout) {
        spawned.stdout.on("data", (data) => {
          stdout += data.toString()
        })
      }
      if (spawned.stderr) {
        spawned.stderr.on("data", (data) => {
          stderr += data.toString()
        })
      }
      spawned.on("close", () => {
        const exitCode = spawned.exitCode
        if (exitCode && exitCode !== 0) {
          const error = new Error(stderr) as SpawnError
          error.exitCode = exitCode
          reject(error)
        } else {
          resolve({
            stdout: stripFinalNewline(stdout),
            stderr: stripFinalNewline(stderr),
          })
        }
      })
      if (spawned.stdin) {
        spawned.stdin.end(input)
      }
    } catch (error) {
      reject(error)
    }
  })
}
