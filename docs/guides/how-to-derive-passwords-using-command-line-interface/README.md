<!--
Title: How to derive passwords using command-line interface
Description: Learn how to derive strong passwords from a master passphrase and YubiKey using the command-line interface
Keywords: macos, linux, cli, yubikey, password
Publication date: 2026-07-22T12:00:00.000Z
Category: Command-line interface
Pinned:
-->

# How to derive passwords using command-line interface

## Overview

This guide walks through deriving strong passwords from a memorized label (for example `github` or `proton`), a master passphrase and a YubiKey using the command-line interface — the same password every time, so there is no vault to store, sync or lose.

> Heads-up: a YubiKey provisioned with a challenge-response secret is required — see [how to provision YubiKey using command-line interface](../how-to-provision-yubikey-using-command-line-interface/README.md), which also covers backing up the secret.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

## Setup guide

The `superbacked` command is available in terminal on [Ubuntu Desktop](../how-to-install-superbacked-on-ubuntu-desktop/README.md) and [Superbacked OS](../how-to-run-superbacked-os-on-desktop-or-laptop/README.md), and after the optional terminal step of the [macOS](../how-to-install-superbacked-on-macos/README.md) and [Tails](../how-to-run-superbacked-on-tails/README.md) guides.

## Usage guide

> Heads-up: the master passphrase is never verified, so a mistyped passphrase silently derives a different password. Use `--confirm-passphrase` when deriving a password for the first time — the master passphrase is then prompted twice.

> Heads-up: on macOS, opening the YubiKey may require granting the terminal Input Monitoring permission (System Settings → Privacy & Security → Input Monitoring).

> Heads-up: on Linux, copying to the clipboard under Wayland requires wl-clipboard (`sudo apt install wl-clipboard`) — preinstalled on Superbacked OS. On GNOME, a dock icon may blink when the password is copied or cleared — cosmetic and expected.

Derive a password from the master passphrase and a memorized label (the command refuses weak master passphrases, like everywhere else in Superbacked).

```console
$ superbacked derive-password
Label: github
Passphrase:
Touch YubiKey…
Derived using scheme v1
Password copied to clipboard, clearing in 10 seconds…
```

The password is copied to the clipboard by default, keeping it out of terminal scrollback — pressing enter clears the clipboard immediately. Every derivation states the scheme version (and Paranoid mode, when enabled) — derivation is stateless, so these are part of what must be remembered to re-derive the same password.

Use the root `--paranoid` flag to harden key derivation (10× standard cost, requiring at least 1 GiB of memory) — a password derived with it can only be re-derived with it.

Use `--print` to print the password to stdout instead and `--length` to set the password length (default `16`).

To replace a password (for example following a leak), change the label (for example `github2`) — the same label always derives the same password.
