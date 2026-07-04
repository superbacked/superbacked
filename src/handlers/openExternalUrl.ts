import { shell } from "electron"

export default async (url: string) => {
  const baseUri = process.env.SUPERBACKED_WEBSITE_BASE_URI as string
  try {
    if (new URL(url).origin === new URL(baseUri).origin) {
      await shell.openExternal(url)
    }
  } catch {
    // Ignore invalid URLs
  }
}
