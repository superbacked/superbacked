import { shell } from "electron"

export default async (url: string) => {
  if (url.startsWith(process.env.SUPERBACKED_WEBSITE_BASE_URI as string)) {
    await shell.openExternal(url)
  }
}
