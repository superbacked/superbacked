import { Configuration } from "electron-builder"

const files = [
  {
    from: "./out/Superbacked-darwin-arm64/Superbacked.app/Contents/Resources/app",
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
  productName: "Superbacked",
  dmg: {
    title: "${productName}",
  },
  pkg: {
    license: "LICENSE",
  },
  linux: {
    files: [{ from: "./bin/linux", to: "./bin/linux" }],
    target: {
      arch: ["arm64", "x64"],
      target: "AppImage",
    },
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
    notarize: process.env.STAGING !== "true",
    target: [
      {
        arch: "arm64",
        target: "dmg",
      },
      {
        arch: "x64",
        target: "dmg",
      },
    ],
  },
  files: files,
  asarUnpack: ["**/bin/**/*", "**/wordlists/**/*", "!**/node_modules/**/*"],
}

export default config
