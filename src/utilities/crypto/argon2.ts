import { app } from "electron"
import { join, resolve } from "path"

import spawn from "@/src/utilities/spawn"

const env = process.env.ENV ?? "development"
// Development runs from the package root (npm scripts and electron-forge
// both set it), so the anchor is the working directory rather than
// __dirname — which differs between the webpack bundle and tsx-run tests,
// and would break if this module moved
const binDir =
  env === "development"
    ? resolve(process.cwd(), "bin", process.platform, process.arch)
    : join(app.getAppPath(), "bin", process.platform, process.arch).replace(
        "app.asar",
        "app.asar.unpacked"
      )

// Every key derivation uses Argon2d, maximizing offline brute-force
// resistance — a side-channel adversary on a derivation host is assumed
// capable of direct capture, which no variant survives (see
// docs/derived-key-technical-documentation.md)
export default async (passphrase: string, salt: string): Promise<Buffer> => {
  const { stdout } = await spawn(
    `${binDir}/argon2`,
    [salt, "-d", "-p", "2", "-k", "65536", "-r", "-t", "10"],
    { input: passphrase }
  )
  return Buffer.from(stdout, "hex")
}
