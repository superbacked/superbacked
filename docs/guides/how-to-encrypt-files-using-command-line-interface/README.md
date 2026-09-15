<!--
Title: How to encrypt files using command-line interface
Description: Learn how to encrypt files and folders as standalone archives using the Superbacked command-line interface
Publication date: 2026-07-22T12:00:00.000Z
Pinned:
-->

# How to encrypt files using command-line interface

## Overview

Superbacked can encrypt files and folders as standalone archives — portable `.superbacked` files encrypted using AES-256-GCM with a key derived from a passphrase using Argon2d. Archives created using the command-line interface are byte-identical to app-created ones, so they can also be restored by drag and drop in the app.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

## Setup guide

The command-line interface is built into the app — download latest release from [superbacked.com/download](https://superbacked.com/download) and optionally [verify integrity of release](https://superbacked.com/guides/how-to-verify-integrity-of-release).

### macOS

Drag Superbacked to Applications (opening the downloaded disk image) and add a persistent alias to the app binary (running the following commands once).

```console
$ echo 'alias superbacked="/Applications/Superbacked.app/Contents/MacOS/Superbacked"' >> "$HOME/.zshrc"

$ source "$HOME/.zshrc"
```

### Ubuntu Desktop

Install the deb (see [how to run Superbacked on Ubuntu Desktop](https://superbacked.com/guides/how-to-run-superbacked-on-ubuntu-desktop)) — the `superbacked` command is then available in terminal.

### Other Linux systems

> Heads-up: replace `x64` with `arm64` in the following command if applicable — and, when reading this guide on GitHub, the version placeholder with the [latest release](https://github.com/superbacked/superbacked/releases/latest) semver.

Install the AppImage as `superbacked` in `~/.local/bin` (opening a new terminal if `~/.local/bin` did not exist).

```console
$ install -m 755 "$HOME/Downloads/superbacked-x64-${latestRelease}.AppImage" "$HOME/.local/bin/superbacked"
```

When planning to use a YubiKey, allow YubiKey access by running following command and unplugging and plugging YubiKey back in.

```console
$ sudo tee /etc/udev/rules.d/70-superbacked-yubikey.rules << 'EOF'
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1050", TAG+="uaccess"
EOF
```

### Superbacked OS

The `superbacked` command is preinstalled.

## Usage guide

### Step 1: create standalone archive

> Heads-up: a forgotten passphrase — and the standalone archive content it encrypts — is unrecoverable.

Encrypt one or more files and/or folders (the `.superbacked` extension is appended automatically and the command refuses weak passphrases).

```console
$ superbacked create-standalone-archive ~/Documents/passport.pdf ~/Documents/wallet --output backup
Passphrase:
Confirm passphrase:
/Users/sun/backup.superbacked
```

The archive path is printed on success. Use `--force` to overwrite an existing archive.

Use `--yubikey` to require a provisioned YubiKey as a second factor (see [how to derive passwords](https://superbacked.com/guides/how-to-derive-passwords-using-command-line-interface) for provisioning) — the archive can then only be restored by enabling YubiKey mode again (`--yubikey`, or the app’s “Protected with YubiKey” switch) while holding a YubiKey provisioned with the same secret.

The root `--paranoid` flag hardens key derivation (requiring at least 1 GiB of memory) — a paranoid archive can only be restored with `--paranoid` (or the app’s “Enable paranoid mode” setting), and without it reports a wrong passphrase.

### Step 2: restore standalone archive

Restore the standalone archive to an existing directory.

```console
$ mkdir restored

$ superbacked restore-standalone-archive backup.superbacked --output restored
Passphrase:
/Users/sun/restored
```

The destination path is printed on success. Standalone archives can also be restored by dragging and dropping them in the app — for archives created with `--yubikey`, enable the “Protected with YubiKey” switch and hold the YubiKey.
