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

> Heads-up: on most YubiKeys, slot 1 ships programmed with the factory Yubico OTP credential and overwriting it is permanent — which is why Superbacked defaults to slot 2, leaving the factory credential intact. Use `--slot 1` only if overwriting it is deliberate.

> Heads-up: on macOS, opening the YubiKey may require granting the terminal Input Monitoring permission (System Settings → Privacy & Security → Input Monitoring). On Linux, reading `/dev/hidraw*` requires Yubico udev rules or root.

Deriving passwords with a YubiKey uses HMAC-SHA1 challenge-response, so the YubiKey needs to be provisioned once with a challenge-response credential — the same operation Yubico Authenticator calls “Program a challenge-response credential”. The following command generates a secret, provisions slot 2 and displays the secret so it can be backed up (a replacement YubiKey provisioned with the same secret is equivalent).

```console
$ superbacked provision-yubikey --generate
Do you wish to continue (yes or no)? yes
YubiKey detected (firmware 5.4.3)
The generated secret will be displayed only once and cannot be recovered from the YubiKey.
Please be ready to back it up using a Superbacked block or blockset secured with a passphrase that does not depend on this YubiKey.
Do you wish to continue (yes or no)? yes
Touch YubiKey…
Slot 2 provisioned for HMAC-SHA1 challenge-response
Secret: 8d66618b105e51cbf0412f8a29368e71d4bb27b5
```

By default, computing a response requires touching the YubiKey — every password derivation asks for physical presence.

### Step 3: derive password

> Heads-up: no fingerprint or checksum of the master passphrase is ever displayed or stored, so a mistyped passphrase silently derives a different password. Use `--confirm` when creating a password — the master passphrase is prompted twice and must match, catching typos before they become the password.

> Heads-up: on Linux, copying to the clipboard under Wayland requires wl-clipboard (`sudo apt install wl-clipboard`) — preinstalled on Superbacked OS. On GNOME, a dock icon may blink when the password is copied or cleared — wl-copy briefly opens an invisible window to acquire the clipboard, as GNOME offers windowless processes no other way to set it.

Derive a password from the master passphrase and a memorized label (the command refuses weak master passphrases, like everywhere else in Superbacked).

```console
$ superbacked derive-password
Label: github
Passphrase:
Touch YubiKey…
Derived with scheme v1
Password copied to clipboard, clearing in 10 seconds…
```

The password is copied to the clipboard by default, keeping it out of terminal scrollback — pressing enter clears the clipboard immediately. Every derivation states the scheme version (and Paranoid mode, when enabled) — derivation is stateless, so these are part of what must be remembered to re-derive the same password.

Use `--print` to print the password to stdout instead, `--length` to set the password length (default `16`) and `--no-yubikey` to derive without a YubiKey (single factor, weaker). The root `--paranoid` flag hardens key derivation (requiring at least 1 GiB of memory) — a password derived with it can only be re-derived with it.

To replace a password (for example following a leak), change the label (for example `github2`) — the same label always derives the same password.
