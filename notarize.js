const { join } = require("path")
const electronNotarize = require("@electron/notarize")

module.exports = async function (context) {
  if (context.packager.platform.name !== "mac") {
    return
  }

  const appId = context.packager.config.appId

  const appPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  console.log(`Notarizing ${appId} found at ${appPath}…`)

  // Create “App Manager” API key using https://appstoreconnect.apple.com/access/integrations/api and run `xcrun notarytool store-credentials superbacked-notarytool` to create credentials
  await electronNotarize.notarize({
    appPath: appPath,
    keychainProfile: "superbacked-notarytool",
    tool: "notarytool",
  })

  console.log(`Notarized ${appId} found at ${appPath}`)
}
