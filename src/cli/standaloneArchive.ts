import { existsSync, statSync } from "fs"
import { dirname, resolve } from "path"

import { program as cli } from "commander"

import { CancelledError } from "@/src/cli/utilities/confirmYes"
import { errorText, localeText } from "@/src/cli/utilities/localeText"
import { gatePassphrase } from "@/src/cli/utilities/passphraseGate"
import readPassphrase from "@/src/cli/utilities/readPassphrase"
import { red } from "@/src/cli/utilities/style"
import {
  createStandaloneArchive,
  restoreStandaloneArchive,
} from "@/src/handlers/standaloneArchive"
import { Slot, YubiKeyError } from "@/src/utilities/yubikey/otp"

// Command actions (the CLI surface is declared in index.ts). Both call the
// same handlers — and bundled argon2 binary — as the app, so archives are
// byte-identical to app-created ones and restore by drag and drop. The
// touch notice prints to stderr here, where the app notifies its window.

const parseSlot = (options: {
  slot: "1" | "2"
  yubikey?: boolean
}): Slot | undefined => {
  return options.yubikey === true ? (options.slot === "1" ? 1 : 2) : undefined
}

const printTouchNotice = (): void => {
  console.error(localeText("common.touchYubiKey"))
}

// YubiKey failures travel through handler results as codes — rethrown as
// YubiKeyError so errorText resolves them like directly-thrown ones
const resultError = (result: {
  error: string
  yubikeyErrorCode?: YubiKeyError["code"]
}): Error => {
  if (result.yubikeyErrorCode === undefined) {
    return new Error(result.error)
  }
  return new YubiKeyError(result.yubikeyErrorCode, result.error)
}

export const createStandaloneArchiveAction = async (
  paths: string[],
  options: {
    allowWeakPassphrase?: boolean
    force?: boolean
    output: string
    slot: "1" | "2"
    yubikey?: boolean
  }
): Promise<void> => {
  try {
    const filePaths = paths.map((path) => resolve(path))
    for (const filePath of filePaths) {
      if (existsSync(filePath) === false) {
        throw new Error(`No such file or directory: ${filePath}`)
      }
    }
    const output = resolve(options.output)
    const destination = dirname(output)
    if (existsSync(destination) === false) {
      throw new Error(`No such directory: ${destination}`)
    }
    if (statSync(destination).isDirectory() === false) {
      throw new Error(`Not a directory: ${destination}`)
    }
    const archivePath = output.endsWith(".superbacked")
      ? output
      : `${output}.superbacked`
    if (existsSync(archivePath) === true && options.force !== true) {
      throw new Error(`Archive already exists: ${archivePath}`)
    }
    // Confirmation is mandatory when creating — a typo locks the
    // archive forever
    const passphrase = await readPassphrase(true)
    if (passphrase === "") {
      throw new Error(localeText("common.passphraseRequired"))
    }
    // The memorized passphrase stays the knowledge factor even with
    // --yubikey (a leaked slot secret leaves its strength as the only
    // remaining wall — see the derived key security model), so the
    // strength gate and its override apply regardless — priced at the
    // profile the archive will stretch under
    const paranoid = cli.opts().paranoid === true
    await gatePassphrase(passphrase, {
      allowWeak: options.allowWeakPassphrase === true,
      paranoid: paranoid,
      subject: "Passphrase",
    })
    const result = await createStandaloneArchive(
      filePaths,
      archivePath,
      passphrase,
      paranoid,
      parseSlot(options),
      printTouchNotice
    )
    if (result.success === false) {
      throw resultError(result)
    }
    process.stdout.write(`${archivePath}\n`)
    process.exit(0)
  } catch (error) {
    if (error instanceof CancelledError) {
      console.error(error.message)
    } else {
      console.error(
        red(
          errorText(
            error,
            localeText("components.fileManager.couldNotCreateStandaloneArchive")
          )
        )
      )
    }
    process.exit(1)
  }
}

export const restoreStandaloneArchiveAction = async (
  archive: string,
  options: { output: string; slot: "1" | "2"; yubikey?: boolean }
): Promise<void> => {
  try {
    const archivePath = resolve(archive)
    if (existsSync(archivePath) === false) {
      throw new Error(`No such file: ${archivePath}`)
    }
    if (statSync(archivePath).isFile() === false) {
      throw new Error(`Not a file: ${archivePath}`)
    }
    const destination = resolve(options.output)
    if (existsSync(destination) === false) {
      throw new Error(`No such directory: ${destination}`)
    }
    if (statSync(destination).isDirectory() === false) {
      throw new Error(`Not a directory: ${destination}`)
    }
    const passphrase = await readPassphrase(false)
    if (passphrase === "") {
      throw new Error(localeText("common.passphraseRequired"))
    }
    const result = await restoreStandaloneArchive(
      archivePath,
      destination,
      passphrase,
      cli.opts().paranoid === true,
      parseSlot(options),
      printTouchNotice
    )
    if (result.success === false) {
      throw resultError(result)
    }
    process.stdout.write(`${destination}\n`)
    process.exit(0)
  } catch (error) {
    console.error(
      red(
        errorText(
          error,
          localeText("components.fileManager.couldNotRestoreStandaloneArchive")
        )
      )
    )
    process.exit(1)
  }
}
