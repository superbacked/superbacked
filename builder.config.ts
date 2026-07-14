import { config as dotenvConfig } from "dotenv"
import { Configuration } from "electron-builder"

dotenvConfig({ path: ".env.production" })

const files = [
  ".webpack/main/**/*",
  ".webpack/block/**/*",
  ".webpack/renderer/**/*",
  // node-hid is a webpack external (native module) — ship it and its
  // runtime dependency unbundled
  "node_modules/node-hid/**/*",
  "node_modules/pkg-prebuilds/**/*",
  // See https://github.com/electron-userland/electron-builder/issues/7068
  {
    filter: ["LICENSE", "THIRD-PARTY-NOTICES", "package.json"],
    from: ".",
    to: ".",
  },
]

const config: Configuration = {
  appId: "com.superbacked.app",
  artifactName: "superbacked-${arch}-${version}.${ext}",
  asarUnpack: [
    "**/bin/**/*",
    "!**/node_modules/**/*",
    // Native modules cannot load from inside the asar archive — later
    // patterns override earlier ones, re-including node-hid
    "**/node_modules/node-hid/**/*",
    "**/node_modules/pkg-prebuilds/**/*",
  ],
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
