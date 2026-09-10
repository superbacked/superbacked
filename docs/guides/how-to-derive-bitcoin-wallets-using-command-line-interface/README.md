<!--
Title: How to derive Bitcoin wallets using command-line interface
Description: Learn how to derive deterministic Bitcoin wallets from a master passphrase and YubiKey using the Superbacked command-line interface
Publication date: 2026-07-29T12:00:00.000Z
Pinned:
-->

# How to derive Bitcoin wallets using command-line interface

## Overview

Superbacked can derive deterministic Bitcoin wallets from a master passphrase, a memorized label (for example `hotwallet`) and a YubiKey. The same inputs always derive the same wallet, so nothing needs to be stored or backed up — and the output is a standard BIP39 mnemonic, so recovery is Superbacked-independent: any wallet software can restore it.

> Heads-up: deriving a Bitcoin wallet exposes its private keys to the computer running the command (unlike a signing device, which never releases its seed) and a forgotten label, forgotten passphrase or lost YubiKey secret is unrecoverable. For amounts you are not willing to lose, use a signing device such as a Trezor.

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

Allow YubiKey access by running following command and unplugging and plugging YubiKey back in.

```console
$ sudo tee /etc/udev/rules.d/70-superbacked-yubikey.rules << 'EOF'
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1050", TAG+="uaccess"
EOF
```

### Superbacked OS

The `superbacked` command is preinstalled.

## Usage guide

### Step 1: provision YubiKey

Deriving wallets uses the same HMAC-SHA1 challenge-response credential as derived passwords — see [how to derive passwords](https://superbacked.com/guides/how-to-derive-passwords-using-command-line-interface) for provisioning. Without a backup of the secret or a second YubiKey provisioned with it, the wallet — and the funds it controls — is unrecoverable if the YubiKey is lost.

### Step 2: derive wallet

> Heads-up: no fingerprint or checksum of the master passphrase is ever displayed or stored, so a mistyped passphrase silently derives a different wallet. Use `--confirm-passphrase` when creating a wallet — and verify the extended public key against a previous derivation before funding.

The command is public by default, secret on demand: it prints the wallet’s extended public key (`zpub…`) — the watch-only verification handle — without materializing the mnemonic (the command refuses weak master passphrases, like everywhere else in Superbacked).

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

Use `--addresses` to also print the first receive addresses — importing the same wallet elsewhere must show the same ones.

```console
$ superbacked derive-bitcoin-wallet hotwallet --addresses 3
…
m/84'/0'/0'/0/0 bc1qmmvmyjcpcqkkw7ssewyd8vw6ud6ctv6rh9m7xq
m/84'/0'/0'/0/1 bc1qcjk90ecfvf6pvm6nfspvzhk20p3v9vawxnfwjw
m/84'/0'/0'/0/2 bc1qv2wjjvr4j6ldkehaph8099dezy033qcshs9k7y
```

### Step 3: reveal mnemonic or import into wallet software

Use `--reveal mnemonic` to copy the BIP39 mnemonic to the clipboard (clearing after 10 seconds, keeping it out of terminal scrollback) — importable into any BIP39 wallet (for example [Electrum](https://electrum.org/)). Confirm the wallet software reports the same extended public key and addresses the command printed.

```console
$ superbacked derive-bitcoin-wallet hotwallet --reveal mnemonic
…
Mnemonic copied to clipboard, clearing in 10 seconds…
```

Use `--reveal zprv` to copy the extended private key instead — pasting it into Electrum imports the entire account without exposing the mnemonic.

Use `--print` with `--reveal` to print the secret to stdout instead of copying it to the clipboard.
