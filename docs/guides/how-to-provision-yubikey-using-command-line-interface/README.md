<!--
Title: How to provision YubiKey using command-line interface
Description: Learn how to provision a YubiKey with a challenge-response secret using the command-line interface
Keywords: macos, linux, cli, yubikey
Publication date: 2026-09-17T12:00:00.000Z
Category: Command-line interface
Pinned: 1
-->

# How to provision YubiKey using command-line interface

## Overview

This guide walks through provisioning a YubiKey with an HMAC-SHA1 challenge-response secret using the command-line interface — the secret derived passwords, derived Bitcoin wallets and YubiKey-protected blocks and standalone archives rely on. The secret is generated once and can be backed up or provisioned to as many YubiKeys as needed, so a lost or broken YubiKey can be replaced.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk — especially when provisioning YubiKey hardware, the only moment the secret exists in plaintext on a computer.

## Setup guide

The `superbacked` command is available in terminal on [Ubuntu Desktop](../how-to-install-superbacked-on-ubuntu-desktop/README.md) and [Superbacked OS](../how-to-run-superbacked-os-on-desktop-or-laptop/README.md), and after the optional terminal step of the [macOS](../how-to-install-superbacked-on-macos/README.md) and [Tails](../how-to-run-superbacked-on-tails/README.md) guides.

## Usage guide

### Step 1: provision YubiKey

> Heads-up: on most YubiKeys, slot 1 ships programmed with the factory Yubico OTP credential and overwriting it is permanent — which is why Superbacked defaults to slot 2, leaving the factory credential intact. Use `--slot 1` only if overwriting it is deliberate.

> Heads-up: on macOS, opening the YubiKey may require granting the terminal Input Monitoring permission (System Settings → Privacy & Security → Input Monitoring).

> Heads-up: if the YubiKey’s OTP interface is disabled, the command offers to enable it and waits for the YubiKey to restart. If the slot is already programmed, the command asks before overwriting it — overwriting permanently destroys the current secret.

Superbacked uses HMAC-SHA1 challenge-response, so the YubiKey needs to be provisioned once with a challenge-response secret — the same operation Yubico Authenticator calls “Program a challenge-response credential”. The following command generates a secret, provisions slot 2, verifies the slot answers correctly and displays the secret so it can be backed up (on Superbacked OS, the first confirmation is skipped).

```console
$ superbacked provision-yubikey --generate
Provisioning a YubiKey exposes a long-lived secret to computer.
When provisioning YubiKey hardware, use Superbacked OS.
Do you wish to continue (yes or no)? yes
YubiKey detected
The generated secret is displayed once and cannot be read back from the YubiKey.
Use a blockset or block that is not YubiKey-protected to back up the secret or provision another YubiKey with the same secret — without either, everything relying on this secret is unrecoverable if the YubiKey is lost or broken.
Do you wish to continue (yes or no)? yes
Touch YubiKey…
Slot 2 provisioned for HMAC-SHA1 challenge-response
Secret: 8d66618b105e51cbf0412f8a29368e71d4bb27b5
```

By default, computing a response requires touching the YubiKey — every derivation asks for physical presence.

Use `--no-touch` to provision a slot that answers without touch (weaker).

### Step 2: back up secret

> Heads-up: the secret is displayed only once and cannot be read back from the YubiKey — without a backup of the secret or a second YubiKey provisioned with it, every derived password, derived Bitcoin wallet and YubiKey-protected block or standalone archive is unrecoverable.

Back up the secret in a blockset or block that is not YubiKey-protected — restoring the backup must never depend on the YubiKey it replaces. When restored, Superbacked recognizes it as a YubiKey challenge-response secret and reports whether the connected YubiKey is provisioned with it.

### Step 3 (optional): provision second YubiKey

Provision a second YubiKey with the same secret so either one derives the same passwords and wallets — the secret is prompted twice (hidden) and must match. It can also be piped to the command instead of typed.

```console
$ superbacked provision-yubikey
Provisioning a YubiKey exposes a long-lived secret to computer.
When provisioning YubiKey hardware, use Superbacked OS.
Do you wish to continue (yes or no)? yes
YubiKey detected
Secret (40-character hex):
Confirm secret:
Touch YubiKey…
Slot 2 provisioned for HMAC-SHA1 challenge-response
```
