import { SpawnOptions, spawn } from "child_process"

// Runs a command to completion and returns its output — the way to
// call any command whose result the app needs (lp, lpstat, wl-copy…).
// Two cases use child_process directly and nothing else should:
// processes that must outlive the call, detached (the clipboard guard
// in src/utilities/spawnGuard.ts, the browser launcher in
// src/handlers/openExternalUrl.ts), and the CLI’s terminal-mode
// switches around a passphrase prompt, which must be synchronous
// (src/cli/utilities/readPassphrase.ts)
interface ExtendedSpawnOptions extends SpawnOptions {
  input?: Buffer | string
}

export interface SpawnError extends Error {
  exitCode: null | number
}

interface SpawnReturnValue {
  stdout: string
  stderr: string
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
      // “close” with a null exit code — this listener surfaces the
      // underlying error (ENOENT) instead of the generic rejection below
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
        const signalCode = spawned.signalCode
        // A child killed by a signal (for example the OOM killer during a
        // paranoid stretch) closes with a null exit code — success is
        // exactly exit code 0, so partial output is never mistaken for a
        // result
        if (exitCode !== 0) {
          const error = new Error(
            stderr !== ""
              ? stderr
              : signalCode !== null
                ? `Process terminated by ${signalCode}`
                : `Process exited with code ${exitCode}`
          ) as SpawnError
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
