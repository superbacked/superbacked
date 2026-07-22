<!--
Title: How to derive passwords using command-line interface
Description: Learn how to derive strong deterministic passwords from a master passphrase and YubiKey using the Superbacked command-line interface
Publication date: 2026-07-22T12:00:00.000Z
Pinned:
-->

# How to derive passwords using command-line interface

## Overview

Superbacked can derive strong deterministic passwords from a master passphrase, a memorized label (for example `github` or `proton`) and, optionally, a YubiKey. The same inputs always derive the same password, so passwords do not need to be stored or synced — and, when a YubiKey is used, guessing the master passphrase requires the YubiKey hardware.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk — especially when provisioning YubiKey hardware.

## Guide

### Step 1: access command-line interface

The command-line interface is built into the app.

On macOS, add a persistent alias to the app binary (running the following commands once).

```console
$ echo 'alias superbacked="/Applications/Superbacked.app/Contents/MacOS/Superbacked"' >> "$HOME/.zshrc"

$ source "$HOME/.zshrc"
```

On Linux, install the AppImage as `superbacked` in `~/.local/bin` (adjusting the path and version to match the downloaded AppImage and opening a new terminal if `~/.local/bin` did not exist).

```console
$ install -m 755 "$HOME/Downloads/superbacked-x64-${latestRelease}.AppImage" "$HOME/.local/bin/superbacked"
```

On Superbacked OS, the `superbacked` command is preinstalled.

### Step 2 (optional): provision YubiKey

> Heads-up: on most YubiKeys, slot 1 ships programmed with the factory Yubico OTP credential and overwriting it is permanent. Use `--slot 2` to preserve the factory credential (and derive passwords using `--slot 2`).

> Heads-up: on macOS, opening the YubiKey may require granting the terminal Input Monitoring permission (System Settings → Privacy & Security → Input Monitoring). On Linux, reading `/dev/hidraw*` requires Yubico udev rules or root.

Deriving passwords with a YubiKey uses HMAC-SHA1 challenge-response, so the YubiKey needs to be provisioned once with a challenge-response secret. The following command generates a secret, provisions slot 1 and displays the secret so it can be backed up.

```console
$ superbacked provision-yubikey --generate
Do you wish to continue (yes or no)? yes
YubiKey detected (firmware 5.4.3)
Slot 1 is currently programmed and overwriting it is permanent — a factory Yubico OTP credential cannot be restored.
Do you wish to overwrite slot 1 (yes or no)? yes
The generated secret will be displayed only once and cannot be recovered from the YubiKey.
Please be ready to back it up using a Superbacked block or blockset secured with a passphrase that does not depend on this YubiKey.
Do you wish to continue (yes or no)? yes
Touch YubiKey…
Slot 1 provisioned for HMAC-SHA1 challenge-response
Secret: 8d66618b105e51cbf0412f8a29368e71d4bb27b5
```

By default, computing a response requires touching the YubiKey — every password derivation asks for physical presence.

### Step 3: derive password

> Heads-up: no fingerprint or checksum of the master passphrase is ever displayed or stored, so a mistyped passphrase silently derives a different password. Use `--confirm` when creating a password — the master passphrase is prompted twice and must match, catching typos before they become the password.

```console
$ superbacked derive-password
Label: github
Passphrase:
Touch YubiKey…
Password copied to clipboard, clearing in 10 seconds…
```

The password is copied to the clipboard by default, keeping it out of terminal scrollback — pressing enter clears the clipboard immediately.

Use `--print` to print the password to stdout instead, `--length` to set the password length (default `16`) and `--no-yubikey` to derive without a YubiKey (single factor, weaker).

To replace a password (for example following a leak), change the label (for example `github2`) — the same label always derives the same password.
