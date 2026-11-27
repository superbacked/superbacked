import { rename } from "fs/promises"
import { basename, dirname, extname, join } from "path"

import { config as dotenvConfig } from "dotenv"
import { Arch, Configuration } from "electron-builder"

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
  // electron-builder expands ${arch} to the packaging convention of
  // each target (amd64 for the x64 deb, x86_64 for the x64 AppImage) —
  // release assets and the Superbacked OS build (which installs
  // superbacked-x64-<version>.deb) expect the same arch names on every
  // platform, so artifacts are renamed to the builder arch once written
  // (a no-op where the names already agree, such as arm64).
  artifactBuildCompleted: async (event) => {
    if (event.arch === null) {
      return
    }
    const extension = extname(event.file)
    const file = `superbacked-${Arch[event.arch]}-${event.packager.appInfo.version}${extension}`
    if (basename(event.file) === file) {
      return
    }
    const path = join(dirname(event.file), file)
    await rename(event.file, path)
    event.file = path
  },
  artifactName: "superbacked-${arch}-${version}.${ext}",
  asarUnpack: [
    "**/bin/**/*",
    "!**/node_modules/**/*",
    // Native modules cannot load from inside the asar archive — later
    // patterns override earlier ones, re-including node-hid
    "**/node_modules/node-hid/**/*",
    "**/node_modules/pkg-prebuilds/**/*",
  ],
  // Fuses harden the packaged binary against the machine it runs on;
  // development runs unpackaged, where they do not apply.
  // See https://www.electronjs.org/docs/latest/tutorial/fuses and
  // https://www.electronjs.org/docs/latest/tutorial/security#19-check-which-fuses-you-can-change
  //
  // The three Node fuses close the code-execution paths into the main
  // process — the process that holds the secrets — open to anything
  // able to launch the binary or set its environment: the inspector
  // flags (and SIGUSR1) open a debugging socket, NODE_OPTIONS injects
  // modules at startup and ELECTRON_RUN_AS_NODE turns the binary into a
  // plain Node runtime. Nothing in src uses process.fork, which the
  // runAsNode fuse would break.
  //
  // The asar integrity pair seals app.asar after install: the first
  // validates it at load against a hash electron-builder embeds in the
  // signed binary (the code signature seals the file on disk but the
  // kernel only verifies executable pages, so a swapped asar would
  // still launch), the second stops an unvalidated app directory from
  // shadowing it — each is bypassable without the other. Effective on
  // macOS; inert on Linux, where root-owned /opt/Superbacked and the
  // AppArmor profile’s read-only grant cover the deb. asarUnpack files
  // sit outside the check: the bundled argon2 and secret-share helpers
  // and the guard scripts could be swapped by the same write access, and
  // the code signature does not stop that at runtime on macOS either —
  // verifying their digests before spawn is the open follow-up. A
  // mismatch is fatal at startup, so a signed macOS build must launch
  // before release.
  //
  // The file protocol fuse gives file:// pages read access to the whole
  // filesystem. The packaged renderer loads from its own scheme instead
  // (see src/utilities/rendererProtocol.ts), so nothing needs the grant
  // and a compromised page cannot read files even if the handler were to
  // regress.
  electronFuses: {
    enableEmbeddedAsarIntegrityValidation: true,
    enableNodeCliInspectArguments: false,
    enableNodeOptionsEnvironmentVariable: false,
    grantFileProtocolExtraPrivileges: false,
    onlyLoadAppFromAsar: true,
    runAsNode: false,
  },
  files: files,
  // node-hid ships Node-API prebuilds for every target and loads them
  // at runtime using pkg-prebuilds — a convention @electron/rebuild
  // does not recognize, so it falls back to node-gyp which cannot
  // cross-compile Linux targets from macOS
  npmRebuild: false,
  productName: "Superbacked",
  deb: {
    // electron-builder’s default list predates Chromium dropping the X
    // screensaver and XTest libraries and libuuid — the shipped binary
    // references none of them (a dlopen name would show up as well),
    // and libxss1 is absent from Ubuntu Desktop’s live session, which
    // made an offline install impossible. gbm and ALSA are linked by
    // Chromium itself, present on every desktop. The default
    // recommendation, libappindicator3-1, left Ubuntu’s archive with
    // 22.04 — an empty list keeps apt from ever reaching for it.
    depends: [
      "libasound2",
      "libatspi2.0-0",
      "libgbm1",
      "libgtk-3-0",
      "libnotify4",
      "libnss3",
      "libsecret-1-0",
      "xdg-utils",
    ],
    // Stock Ubuntu only uaccess-tags the FIDO interface of a YubiKey
    // (systemd’s fido_id); challenge-response runs over the OTP hidraw
    // interface, and libu2f-udev has been an empty transitional
    // package since 22.04 — so the deb ships its own vendor-wide rule
    // (fpm src=dest mapping, added alongside the app payload). udevd
    // picks up new rules automatically; they apply on next replug.
    fpm: [
      "build/70-superbacked-yubikey.rules=/usr/lib/udev/rules.d/70-superbacked-yubikey.rules",
    ],
    recommends: [],
  },
  dmg: {
    title: "${productName}",
  },
  linux: {
    category: "Utility",
    // The long text under the deb’s synopsis and the desktop entry’s
    // Comment line, both of which electron-builder fills from this one
    // key — the package.json tagline is the synopsis below, and the two
    // must differ or package managers show the tagline twice
    description:
      "Some secrets are too important to lose and too sensitive to share.",
    desktop: {
      // Dock/launcher feedback on GNOME — the icon shows a starting
      // state until the first window maps (Chromium completes the
      // Wayland startup sequence; verified on Superbacked OS, whose
      // shadow entry carries the same key).
      entry: {
        StartupNotify: "true",
      },
    },
    // bin/posix ships everywhere: pure POSIX sh scripts (the guards —
    // see src/utilities/spawnGuard.ts), platform- and arch-independent
    files: [
      { from: "./bin/linux", to: "./bin/linux" },
      { from: "./bin/posix", to: "./bin/posix" },
    ],
    // Debian’s Description field opens with a mandatory one-line
    // synopsis; without this key electron-builder leaves that line
    // empty. The long text below it is the package description from
    // package.json, so App Center shows the tagline twice until a
    // distinct longer text is given through `description` here
    synopsis: "Protect what matters most.",
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
      { from: "./bin/posix", to: "./bin/posix" },
    ],
    hardenedRuntime: true,
    // Create “App Manager” API key using https://appstoreconnect.apple.com/access/integrations/api and run `xcrun notarytool store-credentials superbacked-notarytool` to create credentials
    notarize: process.env.SKIP_NOTARIZATION !== "true",
    target: "dmg",
  },
}

export default config
