import { existsSync, statSync } from "fs"
import { dirname, resolve } from "path"

import { program as cli } from "commander"

import { errorText, touchYubiKeyText } from "@/src/cli/utilities/localeText"
import readPassphrase from "@/src/cli/utilities/readPassphrase"
import { red } from "@/src/cli/utilities/style"
import {
  createStandaloneArchive,
  restoreStandaloneArchive,
} from "@/src/handlers/standaloneArchive"
import {
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"
import zxcvbn, {
  minimumPassphraseStrength,
} from "@/src/shared/utilities/zxcvbn"
import { Slot, YubiKeyError } from "@/src/utilities/yubikey/otp"

// Command actions (the CLI surface is declared in index.ts). Both call the
// same handlers — and bundled argon2 binary — as the app, so archives are
// byte-identical to app-created ones and restore by drag and drop. The
// touch notice prints to stderr here, where the app broadcasts to windows.

const parseSlot = (options: {
  slot: "1" | "2"
  yubikey?: boolean
}): Slot | undefined => {
  return options.yubikey === true ? (options.slot === "1" ? 1 : 2) : undefined
}

const printTouchNotice = (): void => {
  console.error(touchYubiKeyText)
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
    const passphrase = await readPassphrase(true)
    if (passphrase === "") {
      throw new Error("Passphrase required")
    }
    // The memorized passphrase stays the knowledge factor even with
    // --yubikey (a leaked slot secret leaves its strength as the only
    // remaining wall — see the derived key security model), so the
    // strength gate applies regardless — priced at the profile the
    // archive will stretch under
    const paranoid = cli.opts().paranoid === true
    if (
      zxcvbn(
        passphrase,
        paranoid === true ? paranoidKdfProfile : standardKdfProfile
      ).strength < minimumPassphraseStrength
    ) {
      throw new Error("Passphrase too weak")
    }
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
    console.error(red(errorText(error, "Could not create standalone archive")))
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
      throw new Error("Passphrase required")
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
    console.error(red(errorText(error, "Could not restore standalone archive")))
    process.exit(1)
  }
}
