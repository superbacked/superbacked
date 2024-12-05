# Superbacked

## Do not loose your secrets

Superbacked is a secret management platform used to back up and pass on sensitive data from one generation to the next.

## Disclaimer

**Do not** use Superbacked on computer that isn’t [air-gapped](https://superbacked.com/faq/air-gapped) and [exclusively used](https://superbacked.com/faq/hardware) for secret management unless secret is already present on computer.

Superbacked, Inc., along with its employees, operators, and shareholders, and the contributors and maintainers of its source code, cannot be held liable for lost or stolen secrets. **USE AT YOUR OWN RISK.**

## End-user license agreement

Building Superbacked from source code or using official release is allowed for personal use only.

Unauthorized distribution or usage of this software (including its source code) is strictly prohibited.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS, COPYRIGHT HOLDERS OR OPERATORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Copyright (c) Superbacked, Inc. — All rights reserved

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
$ sudo apt install --yes libfuse2 zbar-tools
```

### Step 3: right-click `.AppImage` file and select “Run as a program”

> Heads-up: Ubuntu Desktop 24.04.1 LTS has AppArmor enabled by default so running `.AppImage` file using terminal with `--no-sandbox` flag might be necessary.

## Contribution guide (macOS)

Before contributing and submitting a [signed](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits) [PR](https://github.com/superbacked/superbacked/pulls), please create or join [discussion](https://github.com/superbacked/superbacked/discussions) to discuss changes.

**If you believe you have found a security vulnerability, we encourage you to let us know immediately using email found on https://superbacked.com/contact.**

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
$ brew install node@20

$ echo 'export PATH=$PATH:/opt/homebrew/opt/node@20/bin' >> ~/.zshrc && source ~/.zshrc
```

### Step 4: install [Visual Studio Code](https://code.visualstudio.com/)

### Step 5: install dependencies

```console
$ npm install
```

### Step 6: run app in development mode

```console
$ npm run code
```

## How to verify integrity of release

### Step 1: download [release](https://github.com/superbacked/superbacked/releases)’s `SHA256SUMS` and `SHA256SUMS.asc` to same folder as app (`superbacked-std-universal-1.6.0.dmg` in example below)

```console
$ ls
SHA256SUMS
SHA256SUMS.asc
superbacked-std-universal-1.6.0.dmg
```

### Step 2 (optional): verify integrity of `SHA256SUMS` using [GnuPG](https://gnupg.org/)

> Heads-up: integrity of Sun’s PGP public key can be confirmed using fingerprint published on https://sunknudsen.com/contact, https://github.com/sunknudsen/pgp-public-key, https://twitter.com/sunknudsen and https://www.youtube.com/sunknudsen/about.

> Heads-up: “1 signature not checked due to a missing key” warning can be ignored as it refers to Sun’s [legacy](https://github.com/sunknudsen/pgp-public-key/tree/master/legacy) PGP public key.

```console
$ curl https://sunknudsen.com/sunknudsen.asc | gpg --import
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100  2070  100  2070    0     0   6044      0 --:--:-- --:--:-- --:--:--  6160
gpg: key 0x8C9CA674C47CA060: 1 signature not checked due to a missing key
gpg: key 0x8C9CA674C47CA060: public key "Sun Knudsen <hello@sunknudsen.com>" imported
gpg: Total number processed: 1
gpg:               imported: 1
gpg: no ultimately trusted keys found

$ gpg --verify SHA256SUMS.asc
gpg: assuming signed data in 'SHA256SUMS'
gpg: Signature made Sat Oct 12 11:09:30 2024 EDT
gpg:                using EDDSA key 9C7887E1B5FCBCE2DFED0E1C02C43AD072D57783
gpg: Good signature from "Sun Knudsen <hello@sunknudsen.com>" [unknown]
gpg: WARNING: This key is not certified with a trusted signature!
gpg:          There is no indication that the signature belongs to the owner.
Primary key fingerprint: E786 274B C92B 47C2 3C1C  F44B 8C9C A674 C47C A060
     Subkey fingerprint: 9C78 87E1 B5FC BCE2 DFED  0E1C 02C4 3AD0 72D5 7783
```

Good signature from "Sun Knudsen <hello@sunknudsen.com>"

👍

Primary key fingerprint: E786 274B C92B 47C2 3C1C F44B 8C9C A674 C47C A060

👍

### Step 3: verify integrity of release

```console
$ shasum --algorithm 256 --check --ignore-missing SHA256SUMS
./superbacked-std-universal-1.6.0.dmg: OK
```

OK

👍

## Support this project

Superbacked was created by [Sun Knudsen](https://sunknudsen.com/), a privacy and security researcher and [YouTuber](https://www.youtube.com/sunknudsen), and is now maintained by [Sun Knudsen](https://sunknudsen.com/) and [Christoffer Carlsson](https://christoffercarlsson.se/).

This project would have never been possible without the support of generous patrons (thank you).

If you love Superbacked, please star the [repo](https://github.com/superbacked/superbacked) and consider [supporting](https://sunknudsen.com/donate) the project.
