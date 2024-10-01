import { app } from "electron"
import { join } from "path"
import spawn from "./spawn"

const binDir = join(
  app.getAppPath(),
  "bin",
  process.platform,
  process.arch
).replace("app.asar", "app.asar.unpacked")

export default async (passphrase: string, salt: string): Promise<Buffer> => {
  const { stdout } = await spawn(
    `${binDir}/argon2`,
    [salt, "-d", "-p", "2", "-k", "65536", "-r", "-t", "10"],
    { input: passphrase }
  )
  return Buffer.from(stdout, "hex")
}
