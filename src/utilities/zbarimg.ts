import spawn from "./spawn"

export const installed = async (): Promise<boolean> => {
  try {
    const { stdout } = await spawn(`which`, ["zbarimg"])
    if (stdout.match("zbarimg")) {
      return true
    }
    return false
  } catch (error) {
    return false
  }
}

export const decode = async (imageUrl: string): Promise<string> => {
  try {
    const { stdout } = await spawn(
      `zbarimg`,
      [
        "--nodisplay",
        "--quiet",
        "--raw",
        "--set",
        "disable",
        "--set",
        "qrcode.enable",
        "-",
      ],
      {
        input: Buffer.from(
          imageUrl.replace("data:image/jpeg;base64,", ""),
          "base64"
        ),
      }
    )
    return stdout
  } catch (error) {
    if (error.exitCode !== 4) {
      throw error
    } else {
      return null
    }
  }
}
