import { spawn } from "child_process"
import { shell } from "electron"

import allowedExternalUrls from "@/src/shared/allowedExternalUrls"
import { isSuperbackedOs } from "@/src/utilities/superbackedOs"

// On Superbacked OS the browser is reached through the confined launcher,
// run directly rather than via shell.openExternal — that path (xdg-open,
// gio) makes Chromium request a desktop activation token the launcher’s
// scrubbed environment can never present, leaving the busy cursor
// pending until it times out. Detached with an empty environment, as
// the launcher builds its own; child_process rather than the spawn
// utility because the process outlives the call (see spawn.ts)
const superbackedBrowserLauncher = "/usr/local/bin/superbacked-browser"

export default async (url: string) => {
  if (!allowedExternalUrls.includes(url)) {
    throw new Error("External URL is not allowed")
  }
  if (isSuperbackedOs()) {
    const launcher = spawn(superbackedBrowserLauncher, [url], {
      detached: true,
      env: {},
      stdio: "ignore",
    })
    launcher.unref()
    return
  }
  await shell.openExternal(url)
}
