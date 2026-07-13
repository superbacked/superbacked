import { execFileSync, spawn } from "child_process"

const stripTrailingNewline = (value: string): string => {
  if (value.endsWith("\r\n")) {
    return value.slice(0, -2)
  }
  if (value.endsWith("\n")) {
    return value.slice(0, -1)
  }
  return value
}

// Reads a line from the terminal with echo disabled but canonical mode kept —
// the exact termios shape of `read -s`, sudo and ssh. Terminals recognize the
// shape (iTerm2 shows its key icon and can auto-enable Secure Keyboard Entry)
// and the kernel does the line editing (backspace, Ctrl-U, Ctrl-W) invisibly,
// so the prompt can never be corrupted. Node exposes no echo-only toggle
// (setRawMode also disables canonical mode, which terminals treat as a
// full-screen app, not a password prompt), hence stty.
const promptHidden = async (query: string): Promise<string> => {
  const { stdin, stdout } = process
  stdout.write(query)
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
  // Canonical mode turns Ctrl-C back into a real SIGINT — and Electron’s
  // main process does not reliably dispatch POSIX signals to JavaScript
  // handlers (Chromium installs its own), so a signal can kill the process
  // without running any cleanup, leaving the shell with echo off. The guard
  // child blocks on a pipe held by this process: normal exit and death by
  // any signal alike close the pipe, unblocking the guard, which restores
  // the saved terminal state. Restoring twice is harmless, so the happy
  // path also restores directly.
  const guard = spawn(
    "sh",
    ["-c", 'read -r _ || true; exec stty "$1" < /dev/tty', "sh", savedState],
    { stdio: ["pipe", "ignore", "ignore"] }
  )
  guard.unref()
  execFileSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "inherit"] })
  stdin.setEncoding("utf8")
  let value = ""
  try {
    // The kernel buffers until Enter (or EOF via Ctrl-D), so chunks arrive
    // as complete lines. destroyOnReturn keeps stdin usable for a second
    // prompt (the confirmation).
    for await (const data of stdin.iterator({ destroyOnReturn: false })) {
      value += data as string
      const newlineIndex = value.indexOf("\n")
      if (newlineIndex !== -1) {
        value = value.slice(0, newlineIndex)
        break
      }
    }
  } finally {
    restore()
    guard.kill()
    stdin.pause()
    stdout.write("\n")
  }
  if (value.endsWith("\r")) {
    value = value.slice(0, -1)
  }
  return value
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
    if (passphrase !== confirmation) {
      throw new Error("Passphrases do not match")
    }
  }
  return passphrase
}
