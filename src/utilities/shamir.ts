import { app } from "electron"
import { join } from "path"
import spawn from "./spawn"

const binDir = join(
  app.getAppPath(),
  "bin",
  process.platform,
  process.arch
).replace("app.asar", "app.asar.unpacked")

/**
 * Generate shares using Shamir Secret Sharing algorithm
 * @param secret secret
 * @param numberOfShares shares, defaults to `3`
 * @param threshold threshold, defaults to `2`
 * @returns shares
 */
export const generateShares = async (
  secret: string,
  numberOfShares = 3,
  threshold = 2
): Promise<Buffer[]> => {
  const { stdout } = await spawn(
    `${binDir}/secret-share-split`,
    ["--count", numberOfShares.toString(), "--threshold", threshold.toString()],
    { input: secret }
  )
  const hexShares = stdout.split(/\n/)
  const shares: Buffer[] = []
  for (const hexShare of hexShares) {
    shares.push(Buffer.from(hexShare, "hex"))
  }
  return shares
}

export const combineShares = async (shares: Buffer[]): Promise<string> => {
  const hexShares: string[] = []
  for (const share of shares) {
    hexShares.push(share.toString("hex"))
  }
  const { stdout } = await spawn(`${binDir}/secret-share-combine`, [], {
    input: hexShares.join("\n"),
  })
  return stdout
}
