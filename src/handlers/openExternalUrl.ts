import { shell } from "electron"

import allowedExternalUrls from "@/src/shared/allowedExternalUrls"

export default async (url: string) => {
  if (!allowedExternalUrls.includes(url)) {
    throw new Error("External URL is not allowed")
  }
  await shell.openExternal(url)
}
