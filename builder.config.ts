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
  // pkg-prebuilds loads build/Release ahead of prebuilds, so a
  // leftover host-built binary would shadow the target prebuild
  "!node_modules/node-hid/build{,/**/*}",
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
  // node-hid ships Node-API prebuilds for every target and loads them
  // at runtime using pkg-prebuilds — a convention @electron/rebuild
  // does not recognize, so it falls back to node-gyp which cannot
  // cross-compile Linux targets from macOS
  npmRebuild: false,
  productName: "Superbacked",
  deb: {
    // Stock Ubuntu only uaccess-tags the FIDO interface of a YubiKey
    // (systemd’s fido_id); challenge-response runs over the OTP hidraw
    // interface, and libu2f-udev has been an empty transitional
    // package since 22.04 — so the deb ships its own vendor-wide rule
    // (fpm src=dest mapping, added alongside the app payload). udevd
    // picks up new rules automatically; they apply on next replug.
    fpm: [
      "build/70-superbacked-yubikey.rules=/usr/lib/udev/rules.d/70-superbacked-yubikey.rules",
    ],
  },
  dmg: {
    title: "${productName}",
  },
  linux: {
    category: "Utility",
    files: [{ from: "./bin/linux", to: "./bin/linux" }],
    // deb is what Superbacked OS and Ubuntu Desktop install — the app
    // runs straight from /opt/Superbacked, giving AppArmor a stable
    // attachment path (no FUSE mount or AppRun shell indirection), and
    // the package ships the desktop entry, hicolor icons and
    // /usr/bin/superbacked symlink the AppImage needed hand-placing.
    // AppImage stays for Tails, where nothing is installed.
    target: ["AppImage", "deb"],
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
