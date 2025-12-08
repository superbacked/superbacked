import { Configuration } from "electron-builder"

const platform = process.platform
const arch = process.arch

const appPath =
  platform === "darwin"
    ? `./out/Superbacked-${platform}-${arch}/Superbacked.app/Contents/Resources/app`
    : `./out/Superbacked-${platform}-${arch}/resources/app`

const files = [
  {
    from: appPath,
    to: ".",
  },
  { from: "./wordlists", to: "./wordlists" },
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
  asarUnpack: ["**/bin/**/*", "**/wordlists/**/*", "!**/node_modules/**/*"],
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
    notarize: process.env.SKIP_NOTORIZATION !== "true",
    target: "dmg",
  },
}

export default config
