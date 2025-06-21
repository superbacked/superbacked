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

module.exports = {
  appId: `com.superbacked`,
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
    hardenedRuntime: true, // default, see https://www.electron.build/configuration/mac.html and https://developer.apple.com/documentation/security/hardened_runtime
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
