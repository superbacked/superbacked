import { app } from "electron"
import { join, resolve } from "path"

import spawn from "@/src/utilities/spawn"

const env = process.env.ENV ?? "development"
const binDir =
  env === "development"
    ? resolve(__dirname, "../../bin", process.platform, process.arch)
    : join(app.getAppPath(), "bin", process.platform, process.arch).replace(
        "app.asar",
        "app.asar.unpacked"
      )

// Blocks use Argon2d (blockcrypt compatibility); password derivation uses
// Argon2id — cost parameters are shared
export default async (
  passphrase: string,
  salt: string,
  mode: "d" | "id" = "d"
): Promise<Buffer> => {
  const { stdout } = await spawn(
    `${binDir}/argon2`,
    [salt, `-${mode}`, "-p", "2", "-k", "65536", "-r", "-t", "10"],
    { input: passphrase }
  )
  return Buffer.from(stdout, "hex")
}
