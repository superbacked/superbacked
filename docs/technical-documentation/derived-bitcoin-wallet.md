# Derived Bitcoin wallet technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the derived Bitcoin wallet feature in Superbacked. Derived Bitcoin wallets are deterministic BIP39 wallets rendered from a [derived key](derived-key.md) — a 256-bit key binding a memorized master passphrase, a label and a YubiKey HMAC-SHA1 challenge-response — two-factor wallet derivation with nothing stored anywhere. The mnemonic is the root artifact; the extended keys and receive addresses are projections of it. The source ([src/utilities/crypto/derivedBitcoinWallet.ts](../../src/utilities/crypto/derivedBitcoinWallet.ts), [src/utilities/crypto/bip84.ts](../../src/utilities/crypto/bip84.ts) — the shared BIP84 projections — and [src/utilities/crypto/derivedKey.ts](../../src/utilities/crypto/derivedKey.ts)) is the ground truth for this document, and the reference vectors in [tests/derivedBitcoinWallet.test.ts](../../tests/derivedBitcoinWallet.test.ts) and [tests/bip84.test.ts](../../tests/bip84.test.ts) pin the scheme.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Derived Bitcoin wallets extend the platform with stateless wallet derivation: instead of storing a seed phrase, users re-derive it on demand from two factors — a memorized master passphrase and the HMAC-SHA1 secret sealed inside a YubiKey slot. The same passphrase, label and YubiKey always produce the same wallet, on any machine, with no vault, sync or backup required. The output is a standard BIP39 mnemonic, so recovery is Superbacked-independent — once derived, any wallet software can restore it.

The two factors meet in the derived key, whose derivation — Argon2d stretching, keyed challenge, YubiKey response and HKDF combination — is specified in the [derived key technical documentation](derived-key.md), not here. This document specifies how a wallet is rendered from that key.

## Terminology

- **Derivation path**: BIP32 path locating the account within the wallet — fixed at `m/84'/0'/0'`, the BIP84 first account.
- **Derived key**: 256-bit key binding master passphrase, label and YubiKey response (see the [derived key technical documentation](derived-key.md)).
- **Determinism input**: any input whose change silently derives a different wallet — the label, the master passphrase, the YubiKey slot secret, Paranoid mode, the scheme version and the word count.
- **Extended public key**: watch-only account key (`zpub…` for native segwit) — the verification handle, revealing every address of the account but authorizing no spending.
- **Extended private key**: account key (`zprv…`) carrying full spending authority — pasting it into a wallet (for example Electrum) imports the entire account.
- **Label**: memorized identifier a wallet is derived for (for example `savings`).
- **Master passphrase**: memorized passphrase used as the knowledge factor.
- **Mnemonic**: BIP39 sentence of 12 or 24 words encoding the wallet entropy and its checksum.

## Overview

When you derive a Bitcoin wallet, the app:

1. Derives a 256-bit key from the master passphrase, label and YubiKey (see the [derived key technical documentation](derived-key.md))
2. Expands the derived key into BIP39 entropy using HKDF-SHA256
3. Renders the entropy into a mnemonic (BIP39)
4. Projects the mnemonic into an extended public key, receive addresses or an extended private key (BIP32, BIP84)

Every stage is a pure function — no randomness and no stored state — so derivation is deterministic. The rendering is frozen: changing any constant or construction silently changes every derived wallet — as does any change to the derived key scheme beneath it. A wallet can guard funds, so unlike a password it can never be rotated away from a mistake.

## Entropy expansion

The derived key is expanded into BIP39 entropy using HKDF-SHA256:

```typescript
entropy = hkdf(
  derivedKey,
  Buffer.alloc(0),
  `superbacked-derived-mnemonic-${words}`,
  words === 24 ? 32 : 16
)
```

**Parameters:**

- **Input keying material**: 256-bit derived key
- **Salt**: Empty — both factors and the label are already bound through the derived key
- **Info**: `superbacked-derived-mnemonic-24` or `superbacked-derived-mnemonic-12`
- **Output**: 32 bytes (24 words) or 16 bytes (12 words)

The context string names the mnemonic — the root artifact — not the command: product naming is free to move, scheme identities are not.

### Security characteristics

- **Domain separation**: The `superbacked-derived-mnemonic-` context separates wallet entropy from every other use of a derived key (for example [derived password](derived-password.md) rendering) — a wallet and a password derived from the same label never share bytes
- **Word count binding**: The word count is part of the info — HKDF outputs of different lengths share a prefix, so without it the 12-word mnemonic would be a truncation of the 24-word one instead of an independent wallet
- **Label independence**: Under the PRF assumption, keys (and therefore wallets) for different labels are computationally independent — a wallet leaked from one label reveals nothing about any other

## Mnemonic rendering

The entropy is rendered into a BIP39 mnemonic over the English wordlist — 24 words carry 256 bits of entropy, 12 words carry 128, each sentence ending in the BIP39 checksum. The mnemonic seeds the wallet through the standard BIP39 key derivation with an empty BIP39 passphrase (frozen — a passphrase option added later would not change existing wallets).

## Wallet projections

The BIP39 seed roots a BIP32 hierarchy from which three projections derive at the fixed derivation path (`m/84'/0'/0'` — the BIP84 first account):

- **Extended public key**: the account public key, serialized with [SLIP-132](https://github.com/satoshilabs/slips/blob/master/slip-0132.md) native segwit version bytes (`zpub…`)
- **Receive addresses**: bech32 P2WPKH mainnet addresses at `m/84'/0'/0'/0/0` through `m/84'/0'/0'/0/count-1`
- **Extended private key**: the account private key (`zprv…`), carrying full spending authority

The path is fixed by design. A stateless wallet punishes every forgettable input with silently empty wallets, so the scheme carries as few as possible — and fixing the path costs no capability: the mnemonic is Superbacked-independent, so other paths, accounts and script types stay reachable by importing it into wallet software (a second Superbacked wallet belongs under a second label, which is prompted and echoed rather than remembered as a flag).

### Security characteristics

- **Watch-only by default**: The extended public key authorizes no spending, but reveals every address of the account — treat it as privacy-sensitive
- **Verification without exposure**: Re-deriving on any device must yield the same extended public key and addresses — a mismatch means a determinism input differs, caught before any secret is materialized

## Security model

The two-factor security model — what each combination of leaked material allows — lives with the derived key scheme in the [derived key technical documentation](derived-key.md). Wallet-specific limitations:

- **Host exposure**: Deriving exposes the wallet’s private keys to the computer running the command — unlike a signing device, which never releases its seed — and a forgotten passphrase, label or flag is unrecoverable; for amounts you are not willing to lose, use a signing device such as a Trezor (the command requires typed confirmation of this warning at every derivation)
- **No rotation**: Derivation is deterministic, so a leaked mnemonic re-derives identically forever — recovering from a leak means moving the funds to a new label’s wallet
- **Determinism inputs**: The word count and Paranoid mode each derive a different wallet from the same passphrase and label — every derivation echoes both, and re-deriving with a forgotten flag silently produces an empty wallet, not an error
- **Loss of YubiKey**: Without a second YubiKey programmed with the same slot secret, a two-factor wallet — and the funds it guards — is unrecoverable
- **No verifier**: No fingerprint or checksum of the passphrase is ever displayed or stored — a mistyped passphrase silently derives a different wallet (use `--confirm-passphrase` when creating a wallet, and verify the extended public key against a previous derivation)

## Command-line interface

```console
superbacked derive-bitcoin-wallet [label] [options]
```

Every derivation opens with the host-exposure warning and requires the full word `yes` to continue — never assumed, and refused without a controlling terminal. Label prompting, stdin passphrase behavior and the strength gate match [derive-password](derived-password.md); under [Paranoid mode](../../src/shared/utilities/kdfProfiles.ts) the gate is priced at the paranoid profile and the mode is a determinism input echoed at every derivation.

The command is public by default, secret by request: the extended public key (and addresses, when asked) print to stdout, while the mnemonic or extended private key materialize only under `--reveal`.

**Options:**

- `--addresses <count>`: Print first receive addresses (maximum `100`)
- `--clear <seconds>`: Seconds before revealed secret is cleared from clipboard (default `10`)
- `--confirm-passphrase`: Prompt for master passphrase twice and require a match — catches typos when creating a wallet (interactive prompts only; a piped passphrase is used as-is)
- `-p, --print`: Print revealed secret to stdout instead of copying it to clipboard (requires `--reveal`; the public outputs move to stderr so piping stays single-purpose)
- `--reveal <secret>`: Materialize `mnemonic` or `zprv`, copied to clipboard with the same clearing, guarding and platform behavior as [derive-password](derived-password.md)
- `-s, --slot <slot>`: HMAC-SHA1 challenge-response slot (default `2`)
- `--words <words>`: Mnemonic length in words (`12` or `24`, default `24`)

### Derivation workflow

1. User runs `superbacked derive-bitcoin-wallet`
2. User confirms the host-exposure warning by typing `yes`
3. User enters label
4. User enters master passphrase (hidden prompt or piped via stdin)
5. User touches YubiKey if slot requires touch
6. App prints the extended public key (and addresses with `--addresses`), stating the scheme version, Paranoid mode, derivation path and word count on stderr — the path is fixed, echoed for cross-verification in wallet software
7. With `--reveal`, app copies the mnemonic or extended private key to clipboard, clearing it after 10 seconds or as soon as user presses enter (or prints it with `--print`)

To verify a wallet before funding it, import the mnemonic into wallet software (for example Sparrow or Electrum) and confirm it reports the same extended public key and addresses the command printed.

### Platform notes

- **Linux**: Reading `/dev/hidraw*` requires Yubico udev rules or root
- **macOS**: Opening the YubiKey keyboard interface may require granting the terminal Input Monitoring permission (System Settings → Privacy & Security → Input Monitoring)
