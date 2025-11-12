import type { Configuration } from "electron-builder"

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
  appId: "com.superbacked",
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
    notarize: false,
    entitlements: "build/entitlements.mac.plist",
    files: [
      {
        from: "./bin/darwin/${arch}",
        to: "./bin/darwin/${arch}",
      },
    ],
    hardenedRuntime: true,
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
  afterSign: process.env.STAGING !== "true" ? "notarize.js" : undefined,
}

export default config
