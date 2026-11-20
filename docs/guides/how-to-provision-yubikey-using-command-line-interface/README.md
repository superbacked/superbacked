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

This guide walks through provisioning a YubiKey with a challenge-response secret using the command-line interface — the secret that YubiKey-protected blocks and standalone archives rely on, as do derived passwords and Bitcoin wallets. That secret is generated once and can be backed up or provisioned to as many YubiKeys as needed, so a lost or broken YubiKey can be replaced. The app offers the same workflow under File → Provision YubiKey, which can hand the generated secret straight to a block backup.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

## Setup guide

The `superbacked` command is available in terminal on [Ubuntu Desktop](../how-to-install-superbacked-on-ubuntu-desktop/README.md) and [Superbacked OS](../how-to-run-superbacked-os-on-desktop-or-laptop/README.md), and after the optional terminal step of the [macOS](../how-to-install-superbacked-on-macos/README.md) and [Tails](../how-to-run-superbacked-on-tails/README.md) guides.

## Usage guide

### Step 1: provision YubiKey

> Heads-up: only YubiKeys with the OTP application can be provisioned — the Bio and Security Key series do not support challenge-response.

> Heads-up: on most YubiKeys, slot 1 ships programmed with the factory Yubico OTP credential and overwriting it is permanent — which is why Superbacked defaults to slot 2, leaving the factory credential intact. Use `--slot 1` only if overwriting it is deliberate.

> Heads-up: if the YubiKey’s OTP interface is disabled, the command offers to enable it and waits for the YubiKey to restart. If the slot is already programmed, the command asks before overwriting it — overwriting permanently destroys the current secret.

> Heads-up: on macOS, opening the YubiKey requires granting the terminal Input Monitoring permission (System Settings → Privacy & Security → Input Monitoring) — macOS prompts on first use.

The YubiKey needs to be provisioned once with a challenge-response secret — the same operation Yubico Authenticator calls “Program a challenge-response credential”. The following command generates a challenge-response secret, provisions slot 2, verifies the slot answers correctly and displays that secret so it can be backed up (on Superbacked OS, the first confirmation is skipped).

```console
$ superbacked provision-yubikey --generate
Provisioning YubiKey exposes challenge-response secret to this computer.
For high-stakes secrets, provision YubiKey using Superbacked OS (https://superbacked.com/superbacked-os).
Do you wish to continue (yes or no)? yes
YubiKey detected
The generated challenge-response secret is displayed once and cannot be read back from the YubiKey.
Use a block that is not YubiKey-protected to back up the secret or provision another YubiKey with the same secret — without either, everything relying on that secret is unrecoverable if the YubiKey is lost or broken.
Do you wish to continue (yes or no)? yes
Touch YubiKey…
Slot 2 provisioned for challenge-response
Challenge-response secret: 8d66618b105e51cbf0412f8a29368e71d4bb27b5
```

By default, computing a response requires touching the YubiKey — every derivation asks for physical presence.

Use `--no-touch` to provision a slot that answers without touch (weaker).

### Step 2: back up challenge-response secret

> Heads-up: the challenge-response secret cannot be read back from the YubiKey — without a backup or another YubiKey provisioned with the same secret, every YubiKey-protected block or standalone archive is unrecoverable, as is every derived password and Bitcoin wallet.

Back up the challenge-response secret in a block that is not YubiKey-protected — restoring the backup must never depend on the YubiKey it provisions.

### Step 3 (optional): provision another YubiKey

Provision another YubiKey with the same challenge-response secret so either one derives the same passwords and wallets — that secret is prompted twice (hidden) and must match. It can also be piped to the command instead of typed.

```console
$ superbacked provision-yubikey
Provisioning YubiKey exposes challenge-response secret to this computer.
For high-stakes secrets, provision YubiKey using Superbacked OS (https://superbacked.com/superbacked-os).
Do you wish to continue (yes or no)? yes
YubiKey detected
Challenge-response secret (40-character hex):
Confirm challenge-response secret:
Touch YubiKey…
Slot 2 provisioned for challenge-response
```
