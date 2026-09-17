<!--
Title: How to encrypt files using command-line interface
Description: Learn how to encrypt files and folders as standalone archives using the command-line interface
Keywords: macos, linux, cli, yubikey, archive
Publication date: 2026-07-22T12:00:00.000Z
Category: Command-line interface
Pinned:
-->

# How to encrypt files using command-line interface

## Overview

This guide walks through encrypting files and folders as standalone archives using the command-line interface — portable `.superbacked` files protected using a passphrase and, optionally, a YubiKey. Archives created using the command-line interface are byte-identical to app-created ones, so they can also be restored by drag and drop in the app.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

## Setup guide

The `superbacked` command is available in terminal on [Ubuntu Desktop](../how-to-install-superbacked-on-ubuntu-desktop/README.md) and [Superbacked OS](../how-to-run-superbacked-os-on-desktop-or-laptop/README.md), and after the optional terminal step of the [macOS](../how-to-install-superbacked-on-macos/README.md) and [Tails](../how-to-run-superbacked-on-tails/README.md) guides.

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

The archive path is printed on success.

Use the root `--paranoid` flag to harden key derivation (10× standard cost, requiring at least 1 GiB of memory) — a paranoid archive can only be restored with `--paranoid` (or the app’s “Enable paranoid mode” setting), and without it reports a wrong passphrase.

Use `--yubikey` to protect the archive with YubiKey (see [how to provision YubiKey using command-line interface](../how-to-provision-yubikey-using-command-line-interface/README.md)) — restoring then requires `--yubikey`, or the app’s “Protected with YubiKey” switch, and a connected YubiKey provisioned with the same challenge-response secret.

Use `--force` to overwrite an existing archive.

### Step 2: restore standalone archive

Restore the standalone archive to an existing directory.

```console
$ mkdir restored

$ superbacked restore-standalone-archive backup.superbacked --output restored
Passphrase:
/Users/sun/restored
```

The destination path is printed on success. Standalone archives can also be restored by dragging and dropping them in the app — for archives created with `--yubikey`, enable the “Protected with YubiKey” switch with a YubiKey provisioned with the same challenge-response secret connected.
