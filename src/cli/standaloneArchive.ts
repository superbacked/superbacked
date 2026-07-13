import { existsSync, statSync } from "fs"
import { dirname, resolve } from "path"

import readPassphrase from "@/src/cli/readPassphrase"
import {
  createStandaloneArchive,
  restoreStandaloneArchive,
} from "@/src/handlers/standaloneArchive"
import zxcvbn from "@/src/shared/utilities/zxcvbn"

// Command actions (the CLI surface is declared in index.ts). Both call the
// same handlers — and bundled argon2 binary — as the app, so archives are
// byte-identical to app-created ones and restore by drag and drop.

// Matches the app’s standalone archive modal (CreateStandaloneArchiveModal):
// passphrases must score a zxcvbn strength of at least 50 (≈ 50 years to
// crack offline).
const minimumPassphraseStrength = 50

export const createStandaloneArchiveAction = async (
  paths: string[],
  options: { output: string; force?: boolean }
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
    if (zxcvbn(passphrase).strength < minimumPassphraseStrength) {
      throw new Error("Passphrase too weak")
    }
    const result = await createStandaloneArchive(
      filePaths,
      archivePath,
      passphrase
    )
    if (result.success === false) {
      throw new Error(result.error)
    }
    process.stdout.write(`${archivePath}\n`)
    process.exit(0)
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Could not create standalone archive"
    )
    process.exit(1)
  }
}

export const restoreStandaloneArchiveAction = async (
  archive: string,
  options: { output: string }
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
      passphrase
    )
    if (result.success === false) {
      throw new Error(result.error)
    }
    process.stdout.write(`${destination}\n`)
    process.exit(0)
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Could not restore standalone archive"
    )
    process.exit(1)
  }
}
