# Superbacked

## Protect what matters most

Whether you are planning for tomorrow or the unthinkable, Superbacked helps the right people recover what matters.

Superbacked runs on your computer, never connects to the internet and requires no account. Your secrets never leave your device unencrypted.

For high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

Learn more about Superbacked and download latest release at [superbacked.com](https://superbacked.com).

## License

Superbacked is released under the [MIT License](LICENSE).

The license covers the code only — the Superbacked name, logo and visual identity are not licensed (see [TRADEMARK.md](TRADEMARK.md)). Forks and redistributions must use their own branding.

## Contribution guide (macOS)

Before contributing and submitting [signed](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits) [PR](https://github.com/superbacked/superbacked/pulls), please create or join [discussion](https://github.com/superbacked/superbacked/discussions) to discuss changes.

**If you believe you have found security vulnerability, we encourage you to let us know immediately using email found on https://superbacked.com/contact.**

### Step 1: clone [repo](https://github.com/superbacked/superbacked)

> Heads-up: please use [SSH authentication](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account) and [sign](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits) commits using [GnuPG](https://gnupg.org/).

```console
$ git clone git@github.com:superbacked/superbacked.git
```

### Step 2: install [Homebrew](https://brew.sh/)

```console
$ /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

$ uname -m | grep arm64 && echo 'export PATH=$PATH:/opt/homebrew/bin' >> ~/.zshrc && source ~/.zshrc
```

### Step 3: install [Node.js](https://nodejs.org/en)

```console
$ brew install node@22

$ echo 'export PATH=$PATH:/opt/homebrew/opt/node@22/bin' >> ~/.zshrc && source ~/.zshrc
```

### Step 4: install [Visual Studio Code](https://code.visualstudio.com/)

> Heads-up: installing [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) and [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) extensions is recommended.

### Step 5: install dependencies

> Heads-up: using `--ignore-scripts` is recommended to prevent third-party `postinstall` scripts from executing arbitrary code on host.

```console
$ npm install --ignore-scripts
```

### Step 6: install Electron binary

> Heads-up: because `--ignore-scripts` was used in step 5, Electron’s `postinstall` script (which downloads and extracts the platform-specific binary to `node_modules/electron/dist/`) must be run manually. Without this step, `npm run code` fails with `Electron failed to install correctly`. Re-run this step whenever `node_modules/electron` is recreated (for example, after an Electron version bump).

```console
$ node node_modules/electron/install.js
```

### Step 7: run app in development mode

```console
$ npm run code
```

## Superbacked app build guide (macOS)

> Heads-up: building Superbacked app requires steps 1 to 6 of [contribution guide](#contribution-guide-macos). Notarization is a maintainer-only concern (see [builder.config.ts](builder.config.ts)) — following command disables it.

Purges `dist`, runs lint and tests, then builds macOS and Linux releases for arm64 and x64 (see [package.sh](package.sh)).

```console
$ SKIP_NOTARIZATION=true ./package.sh app
```

## Superbacked OS build guide (macOS)

> Heads-up: building Superbacked OS requires source image (see [source image guide](superbacked-os-guides/superbacked-os-source-image.md)) and app build in `dist` (see [app build guide](#superbacked-app-build-guide-macos)).

### Step 1: install dependencies

```console
$ brew install colima docker docker-buildx
```

### Step 2: create Colima profile

> Heads-up: [package.sh](package.sh) creates profile using same flags if this step is skipped — vz and Rosetta are required (bootstrap runs amd64 binaries in chroot) and only apply when profile is created.

```console
$ colima start \
  --cpu 4 \
  --disk 20 \
  --memory 8 \
  --profile superbacked \
  --vm-type vz \
  --vz-rosetta

$ colima stop --profile superbacked
```

### Step 3: cap build cache

> Heads-up: Docker keeps build cache of every image build until pruned, so cache grows unbounded — cap makes BuildKit delete least recently used cache once total exceeds budget (images, containers and volumes are not affected). Applies on next Colima start.

Edit `~/.colima/superbacked/colima.yaml` and replace `docker: {}` with following.

```yaml
docker:
  builder:
    gc:
      enabled: true
      defaultKeepStorage: 5GB
```

### Step 4: build Superbacked OS

> Heads-up: see `./package.sh --help` for build variants and cache options.

```console
$ ./package.sh os
```

## Reclaim Superbacked OS build disk space (macOS)

> Heads-up: `superbacked-build-cache` volume (apt archives and debug base layer, see [package.sh](package.sh)) is never touched — it is detached (hence “unused” to Docker) between builds, so never run `docker volume prune` or `docker system prune --volumes` on superbacked profile (use `./package.sh os --clear-cache <apt|base|all>` instead).

Removes images and build cache (both recreated by next build), then releases freed space to macOS (Colima disk is sparse file, so space is only released once freed blocks are trimmed).

```console
$ profile=superbacked

$ colima start --profile "${profile}"

$ docker --context "colima-${profile}" image prune --all --force

$ docker --context "colima-${profile}" builder prune --all --force

$ colima ssh --profile "${profile}" -- sudo fstrim --all --verbose

$ colima stop --profile "${profile}"
```

## Support this project

If Superbacked is useful to you, please [star repo](https://github.com/superbacked/superbacked) and [support project](https://sunknudsen.com/donate).
