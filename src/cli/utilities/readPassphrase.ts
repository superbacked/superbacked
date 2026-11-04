import { execFileSync } from "child_process"
import { once } from "events"
import { openSync } from "fs"
import { ReadStream } from "tty"

import { timingSafeEqualStrings } from "@/src/utilities/crypto/primitives"
import sleep from "@/src/utilities/sleep"
import spawnGuard from "@/src/utilities/spawnGuard"

const stripTrailingNewline = (value: string): string => {
  if (value.endsWith("\r\n")) {
    return value.slice(0, -2)
  }
  if (value.endsWith("\n")) {
    return value.slice(0, -1)
  }
  return value
}

// Accumulates chunks until the first newline and returns the line without
// its terminator — the terminal stays in canonical mode, so the kernel
// buffers until Enter (or EOF via Ctrl-D) and handles line editing
const scanLine = async (chunks: AsyncIterable<string>): Promise<string> => {
  let value = ""
  for await (const data of chunks) {
    value += data
    const newlineIndex = value.indexOf("\n")
    if (newlineIndex !== -1) {
      value = value.slice(0, newlineIndex)
      break
    }
  }
  if (value.endsWith("\r")) {
    value = value.slice(0, -1)
  }
  return value
}

// Reads one line from stdin — destroyOnReturn keeps stdin usable for a later
// prompt. All prompts share this reader: mixing readline with direct stdin
// reads leaves the stream unreadable for whichever consumer comes second.
const readLine = async (): Promise<string> => {
  const { stdin } = process
  stdin.setEncoding("utf8")
  const value = await scanLine(stdin.iterator({ destroyOnReturn: false }))
  stdin.pause()
  return value
}

// Opens the controlling terminal for prompting while stdin is piped (the
// sudo and ssh behavior) — throws when there is none (fully
// non-interactive), letting callers fall back to requiring arguments.
// A tty.ReadStream (not fs.createReadStream) is required: fs streams read
// character devices through blocking threadpool reads, and a read-ahead
// left blocked on /dev/tty wedges a worker, hanging the threadpool join
// when the process exits.
const openTty = (): ReadStream => new ReadStream(openSync("/dev/tty", "r"))

/**
 * Prompt for a line with echo left on (for non-secret input such as labels).
 * The prompt writes to stderr so stdout carries only the command output.
 * When stdin is piped (carrying the passphrase), reads from the controlling
 * terminal instead — rejects when there is none.
 * @param query prompt text
 * @returns line
 */
export const promptVisible = async (query: string): Promise<string> => {
  if (process.stdin.isTTY === true) {
    process.stderr.write(query)
    return readLine()
  }
  const tty = openTty()
  process.stderr.write(query)
  try {
    tty.setEncoding("utf8")
    // Dedicated file descriptor, destroyed after one line — piped stdin
    // stays untouched for the passphrase
    return await scanLine(tty)
  } finally {
    tty.destroy()
  }
}

/**
 * Wait until enter is pressed on the terminal or timeout elapses, whichever
 * comes first. Falls back to the timeout alone when no terminal is available
 * (fully non-interactive).
 * @param milliseconds timeout in milliseconds
 * @returns whether enter was pressed
 */
export const waitForEnter = async (milliseconds: number): Promise<boolean> => {
  let stream: ReadStream | typeof process.stdin
  let release: () => void
  if (process.stdin.isTTY === true) {
    stream = process.stdin
    release = () => process.stdin.pause()
  } else {
    try {
      const tty = openTty()
      stream = tty
      release = () => tty.destroy()
    } catch {
      await sleep(milliseconds)
      return false
    }
  }
  try {
    // Canonical mode delivers data on enter — the aborted wait (timeout)
    // removes the listener itself
    await once(stream, "data", { signal: AbortSignal.timeout(milliseconds) })
    return true
  } catch {
    return false
  } finally {
    release()
  }
}

// Reads a line from the terminal with echo disabled but canonical mode kept —
// the exact termios shape of `read -s`, sudo and ssh. Terminals recognize the
// shape (iTerm2 shows its key icon and can auto-enable Secure Keyboard Entry)
// and the kernel does the line editing (backspace, Ctrl-U, Ctrl-W) invisibly,
// so the prompt can never be corrupted. Node exposes no echo-only toggle
// (setRawMode also disables canonical mode, which terminals treat as a
// full-screen app, not a password prompt), hence stty.
export const promptHidden = async (query: string): Promise<string> => {
  const { stderr } = process
  // Prompts write to stderr so stdout carries only the command’s output —
  // interactively both reach the same terminal, but piped stdout stays clean
  stderr.write(query)
  const savedState = execFileSync("stty", ["-g"], {
    stdio: ["inherit", "pipe", "inherit"],
  })
    .toString()
    .trim()
  const restore = () => {
    execFileSync("stty", [savedState], {
      stdio: ["inherit", "ignore", "inherit"],
    })
  }
  // Canonical mode turns Ctrl-C back into a real SIGINT, and a signal can
  // kill the process without running any cleanup, leaving the shell with
  // echo off — the guard restores the saved terminal state whenever this
  // process dies. Restoring twice is harmless, so the happy path also
  // restores directly.
  const releaseGuard = await spawnGuard("restore-terminal-state", [savedState])
  execFileSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "inherit"] })
  try {
    return await readLine()
  } finally {
    restore()
    releaseGuard()
    stderr.write("\n")
  }
}

/**
 * Read a passphrase without echoing it. When stdin is piped or redirected, the
 * whole of stdin is used as the passphrase (one trailing newline is stripped,
 * matching `echo`). When stdin is an interactive terminal, prompts with the
 * input hidden; with `confirm`, prompts twice and requires a match — a typo
 * would otherwise lock a backup forever.
 * @param confirm whether to prompt twice and require a match (interactive only)
 * @returns passphrase
 */
export default async function readPassphrase(confirm = false): Promise<string> {
  if (process.stdin.isTTY !== true) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    return stripTrailingNewline(Buffer.concat(chunks).toString("utf8"))
  }
  const passphrase = await promptHidden("Passphrase: ")
  if (confirm === true) {
    const confirmation = await promptHidden("Confirm passphrase: ")
    if (timingSafeEqualStrings(passphrase, confirmation) === false) {
      throw new Error("Passphrases do not match")
    }
  }
  return passphrase
}
