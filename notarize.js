import { join } from "path"

import { notarize } from "@electron/notarize"

export default async function (context) {
  if (context.packager.platform.name !== "mac") {
    return
  }

  const appId = context.packager.config.appId

  const appPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  // eslint-disable-next-line no-console
  console.log(`Notarizing ${appId} found at ${appPath}…`)

  // Create “App Manager” API key using https://appstoreconnect.apple.com/access/integrations/api and run `xcrun notarytool store-credentials superbacked-notarytool` to create credentials
  await notarize({
    appPath: appPath,
    keychainProfile: "superbacked-notarytool",
    tool: "notarytool",
  })

  // eslint-disable-next-line no-console
  console.log(`Notarized ${appId} found at ${appPath}`)
}
