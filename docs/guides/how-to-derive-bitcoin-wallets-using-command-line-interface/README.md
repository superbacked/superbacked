<!--
Title: How to derive Bitcoin wallets using command-line interface
Description: Learn how to derive Bitcoin wallets from a master passphrase and YubiKey using the command-line interface
Keywords: macos, linux, cli, yubikey, bitcoin
Publication date: 2026-07-29T12:00:00.000Z
Category: Command-line interface
Pinned:
-->

# How to derive Bitcoin wallets using command-line interface

## Overview

This guide walks through deriving Bitcoin wallets from a memorized label (for example `hotwallet`), a master passphrase and a YubiKey using the command-line interface — the same wallet every time, so there is no mnemonic to store, sync or lose. Wallets are standard BIP39 mnemonics, so recovery is Superbacked-independent: any wallet software can restore them.

> Heads-up: deriving a Bitcoin wallet exposes its private keys to the computer running the command (unlike a signing device, which never releases its seed) and a forgotten label, forgotten passphrase or lost YubiKey secret is unrecoverable. **For amounts you are not willing to lose, use a signing device such as a Trezor.**

> Heads-up: a YubiKey provisioned with a challenge-response secret is required — see [how to provision YubiKey using command-line interface](../how-to-provision-yubikey-using-command-line-interface/README.md), which also covers backing up the secret.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

## Setup guide

The `superbacked` command is available in terminal on [Ubuntu Desktop](../how-to-install-superbacked-on-ubuntu-desktop/README.md) and [Superbacked OS](../how-to-run-superbacked-os-on-desktop-or-laptop/README.md), and after the optional terminal step of the [macOS](../how-to-install-superbacked-on-macos/README.md) and [Tails](../how-to-run-superbacked-on-tails/README.md) guides.

## Usage guide

### Derive wallet

> Heads-up: the master passphrase is never verified, so a mistyped passphrase silently derives a different wallet. Use `--confirm-passphrase` when deriving a wallet for the first time — the master passphrase is then prompted twice — and derive the wallet again to confirm the same extended public key before sending bitcoin to it.

> Heads-up: on macOS, opening the YubiKey may require granting the terminal Input Monitoring permission (System Settings → Privacy & Security → Input Monitoring).

By default, the command prints the wallet’s extended public key (`zpub…`) — enough to set up a watch-only wallet — without revealing the mnemonic (the command refuses weak master passphrases, like everywhere else in Superbacked).

```console
$ superbacked derive-bitcoin-wallet
Deriving a Bitcoin wallet exposes its private keys to the computer running the command.
For amounts you are not willing to lose, use a signing device such as a Trezor.
Do you wish to continue (yes or no)? yes
Label: hotwallet
Passphrase:
Touch YubiKey…
Derived using scheme v1, path m/84'/0'/0', 24 words
zpub6rskz9PppDLZKurVF9qhu7bs1TvadsejsGWmsFfQ2aVkKHi3eGiDCQXMEtgHBb1ucSHPMWnbRPoUsGwnAMS81q2ie77dD5sGzSXXpwKbFSo
```

Every derivation states the scheme version, the derivation path and the word count (and Paranoid mode, when enabled) — derivation is stateless, so a different word count (`--words 12`) or mode derives a different wallet and these are part of what must be remembered to re-derive the same one (the derivation path is fixed, stated for cross-verification in wallet software).

Use the root `--paranoid` flag to harden key derivation (10× standard cost, requiring at least 1 GiB of memory) — a wallet derived with it can only be re-derived with it.

Use `--addresses` to also print the first receive addresses — importing the same wallet elsewhere must show the same ones.

```console
$ superbacked derive-bitcoin-wallet hotwallet --addresses 3
…
m/84'/0'/0'/0/0 bc1qmmvmyjcpcqkkw7ssewyd8vw6ud6ctv6rh9m7xq
m/84'/0'/0'/0/1 bc1qcjk90ecfvf6pvm6nfspvzhk20p3v9vawxnfwjw
m/84'/0'/0'/0/2 bc1qv2wjjvr4j6ldkehaph8099dezy033qcshs9k7y
```

### Reveal mnemonic or import into wallet software

> Heads-up: on Linux, copying to the clipboard under Wayland requires wl-clipboard (`sudo apt install wl-clipboard`) — preinstalled on Superbacked OS. On GNOME, a dock icon may blink when the mnemonic is copied or cleared — cosmetic and expected.

Use `--reveal mnemonic` to copy the BIP39 mnemonic to the clipboard (clearing after 10 seconds, keeping it out of terminal scrollback) — importable into any BIP39 wallet (for example [Electrum](https://electrum.org/)). Confirm the wallet software reports the same extended public key and addresses the command printed.

```console
$ superbacked derive-bitcoin-wallet hotwallet --reveal mnemonic
…
Mnemonic copied to clipboard, clearing in 10 seconds…
```

Use `--reveal zprv` to copy the extended private key instead — pasting it into Electrum imports the entire account without exposing the mnemonic.

Use `--print` with `--reveal` to print the secret to stdout instead of copying it to the clipboard.
