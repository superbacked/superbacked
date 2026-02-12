import { config as dotenvConfig } from "dotenv"
import { Configuration } from "electron-builder"

dotenvConfig({ path: ".env.production" })

const files = [
  ".webpack/main/**/*",
  ".webpack/block/**/*",
  ".webpack/renderer/**/*",
  // See https://github.com/electron-userland/electron-builder/issues/7068
  {
    filter: ["LICENSE", "package.json"],
    from: ".",
    to: ".",
  },
]

const config: Configuration = {
  appId: "com.superbacked.app",
  artifactName: "superbacked-${arch}-${version}.${ext}",
  asarUnpack: ["**/bin/**/*", "!**/node_modules/**/*"],
  files: files,
  productName: "Superbacked",
  dmg: {
    title: "${productName}",
  },
  linux: {
    files: [{ from: "./bin/linux", to: "./bin/linux" }],
    target: "AppImage",
  },
  mac: {
    entitlements: "build/entitlements.mac.plist",
    files: [
      {
        from: "./bin/darwin/${arch}",
        to: "./bin/darwin/${arch}",
      },
    ],
    hardenedRuntime: true,
    // Create “App Manager” API key using https://appstoreconnect.apple.com/access/integrations/api and run `xcrun notarytool store-credentials superbacked-notarytool` to create credentials
    notarize: process.env.SKIP_NOTARIZATION !== "true",
    target: "dmg",
  },
}

export default config
