import { spawn, SpawnOptions } from "child_process"

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
      let stdout = ""
      let stderr = ""
      spawned.stdout.on("data", (data) => {
        stdout += data.toString()
      })
      spawned.stderr.on("data", (data) => {
        stderr += data.toString()
      })
      spawned.on("close", () => {
        const exitCode = spawned.exitCode
        if (exitCode !== 0) {
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
      if (typeof input !== "undefined") {
        spawned.stdin.end(input)
      }
    } catch (error) {
      reject(error)
    }
  })
}
