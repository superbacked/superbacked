import { shell } from "electron"

export default (url: string) => {
  if (url.startsWith(process.env.SUPERBACKED_WEBSITE_BASE_URI)) {
    shell.openExternal(url)
  }
}
