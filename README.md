# Superbacked

## Protect what matters most

Whether you are planning for tomorrow or the unthinkable, Superbacked helps the right people recover what matters.

Superbacked runs on your computer, never connects to the internet and requires no account. Your secrets never leave your device unencrypted.

For high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

Learn more about Superbacked and download latest release at [superbacked.com](https://superbacked.com).

## End-user license agreement

Building Superbacked from source code or using official release is allowed for personal use only.

Unauthorized distribution or usage of this software (including its source code) is strictly prohibited.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS, COPYRIGHT HOLDERS OR OPERATORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Copyright (c) Superbacked, Inc. — All rights reserved

# <<<<<<< HEAD

## Usage guide (macOS)

### Step 1: download (and, optionally, [verify](#how-to-verify-integrity-of-release)) [latest release](https://github.com/superbacked/superbacked/releases/latest), double-click `.dmg` file and drag “Superbacked” app to “Applications” folder

### Step 2: open “Applications” folder and double-click “Superbacked” app

## Usage guide (Tails)

### Step 1: download (and, optionally, [verify](#how-to-verify-integrity-of-release)) [latest release](https://github.com/superbacked/superbacked/releases/latest)

### Step 2: right-click `.AppImage` file and select “Run”

## Usage guide (Ubuntu)

### Step 1: download (and, optionally, [verify](#how-to-verify-integrity-of-release)) [latest release](https://github.com/superbacked/superbacked/releases/latest)

### Step 2: install dependencies

```console
$ sudo apt install --yes libfuse2 zlib1g-dev
```

### Step 3: right-click `.AppImage` file and select “Run as a program”

> Heads-up: Ubuntu Desktop 24.04.4 LTS has AppArmor enabled by default so running `.AppImage` file using terminal with `--no-sandbox` flag might be necessary.

> > > > > > > 2380cc4 (Updated Superbacked OS to 24.04.4)

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

> Heads-up: because `--ignore-scripts` was used in Step 5, Electron’s `postinstall` script (which downloads and extracts the platform-specific binary to `node_modules/electron/dist/`) must be run manually. Without this step, `npm run code` fails with `Electron failed to install correctly`. Re-run this step whenever `node_modules/electron` is recreated (for example, after an Electron version bump).

```console
$ node node_modules/electron/install.js
```

### Step 7: run app in development mode

```console
$ npm run code
```

## Support this project

If Superbacked is useful to you, please [star repo](https://github.com/superbacked/superbacked) and [support project](https://sunknudsen.com/donate).
