import * as totp from "@sunknudsen/totp"

export const generateToken = (
  ...args: Parameters<typeof totp.generateToken>
) => {
  return totp.generateToken(...args)
}
