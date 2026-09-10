# Block technical documentation

## Abstract

This document specifies the design and implementation of blocks. Superbacked encodes secrets as encrypted QR codes called blocks — 4×6-inch cards printed on archival paper or saved as JPG or PDF files (printing is recommended). Secrets are encrypted using fixed-size encryption — a scheme that provides plausible deniability — and the result is packaged as the block’s QR code. Its cryptographic design is specified in the [fixed-size encryption technical documentation](fixed-size-encryption.md) and the keys it consumes in [Key derivation](#key-derivation). Each secret has its own passphrase, optionally [YubiKey-protected](#yubikey-second-factor). The source code ([src/utilities/core/block.ts](../../src/utilities/core/block.ts), [src/handlers/create.ts](../../src/handlers/create.ts) and [src/block/App.tsx](../../src/block/App.tsx)) is the ground truth for this document.

## Introduction

Superbacked protects secrets too important to lose and too sensitive to share — critical credentials, signing keys and digital assets. Secrets are backed up — encrypted, offline, with succession planning built in — or never stored at all: derived on demand from a master passphrase and YubiKey.

Blocks are the foundation of Superbacked. Superbacked encrypts secrets into blocks using a passphrase (optionally [YubiKey-protected](#yubikey-second-factor)) and only you can decrypt them: no account, no internet connection. Printed blocks are ideal for cold storage, which is why printing is recommended.

Blocks can hold multiple secrets, each protected by its own passphrase (optionally [YubiKey-protected](#yubikey-second-factor)) — the first is always present, and capacity is bounded only by the block size. Every block has the same fixed size — 768 bytes of encrypted data or random padding in current versions, bounded by QR code capacity at the low error correction level (see [src/utilities/core/block.ts](../../src/utilities/core/block.ts)). Additional secrets carry plausible deniability: they are indistinguishable from the random padding that fills unused block space, so without an additional secret’s passphrase, an adversary cannot tell whether it exists at all.

## Terminology

- **Additional secret**: any secret of a block beyond the first — indistinguishable from padding, so its existence cannot be proven without knowing its passphrase.
- **Block**: an encrypted QR code printed on archival paper or saved as a JPG or PDF file.
- **Fixed-size encryption**: the scheme Superbacked uses to encrypt secrets — see the [fixed-size encryption technical documentation](fixed-size-encryption.md).
- **Passphrase**: user-provided passphrase used to derive a secret’s encryption key — each secret of a block has its own.
- **Payload**: the JSON, carrying the fixed-size encryption output, that a block’s QR code encodes.
- **Plausible deniability**: the property that the number of secrets in a block, and the existence of any undisclosed secret, cannot be determined from the block.
- **Secret**: text entered in the secret field (for example a master password, TOTP secret or BIP39 mnemonic).

## Overview

When you create a block, the app:

1. Takes one or more secrets — as many as fit the block — each with its own passphrase (optionally [YubiKey-protected](#yubikey-second-factor)) and an optional label.
2. Derives a key from each passphrase (see [Key derivation](#key-derivation)), prepends the 8-byte [scheme header](../../src/utilities/crypto/schemeHeader.ts) to each secret’s message, then encrypts the secrets using [fixed-size encryption](fixed-size-encryption.md).
3. Serializes the fixed-size encryption output as a JSON payload.
4. Encodes the payload as a QR code and renders the block — a 4×6-inch card carrying the QR code alongside a label and a short hash — printed or saved as a JPG or PDF file.

## Encryption

Blocks are encrypted using [fixed-size encryption](fixed-size-encryption.md) and keys derived from their passphrases (see [Key derivation](#key-derivation)). Superbacked sets the fixed block size, which bounds how many secrets a block holds. The scheme provides the properties a block relies on:

- **Authenticated encryption** of each secret using its own passphrase (optionally [YubiKey-protected](#yubikey-second-factor)) — a wrong passphrase, a wrong YubiKey or a tampered block fails to decrypt.
- **Plausible deniability** — every byte of a block is ciphertext or random padding, indistinguishable from random data, so a block reveals nothing about how many secrets it holds beyond the first, which is always present.
- **A fixed block size** — every block is padded to the same size, so its size reveals nothing about how much it holds.

The cryptographic design behind these properties lives in the [fixed-size encryption technical documentation](fixed-size-encryption.md), not here.

## Key derivation

Superbacked derives each secret’s key from its passphrase: a memory-hard Argon2d stretch at the active [KDF profile](../../src/shared/kdfProfiles.ts), optionally mixed with a YubiKey HMAC-SHA1 challenge-response, followed by the `block-key` HKDF domain key (see `encryptBlock` in [src/utilities/core/block.ts](../../src/utilities/core/block.ts)).

### Paranoid mode

A block created under [Paranoid mode](../../src/shared/kdfProfiles.ts) derives every secret’s key at the paranoid profile — and restoring it requires the mode enabled, reporting a wrong passphrase until it is switched on.

### YubiKey second factor

When the YubiKey switch is enabled in the app’s create and restore flows, key derivation takes one extra step: the YubiKey answers a challenge derived from the secret’s stretched key and the response is mixed back into it through HKDF-SHA256 under the frozen info `kdf-key` (see the [passphrase key technical documentation](passphrase-key.md)). Without the switch, the stretched key is used directly. Either way, the backup type’s HKDF domain key is applied on top (see `computeBlockKdfKey` in [src/utilities/core/block.ts](../../src/utilities/core/block.ts)).

The scheme — stretching, challenge computation, response mixing and its security model — is specified in the [passphrase key technical documentation](passphrase-key.md) and shared with [standalone archives](standalone-archive.md#yubikey-second-factor). Block specifics:

- **Blocks only**: The second factor is supported for single blocks only, never blocksets — a blockset’s shares are meant to restore on any machine holding enough blocks, a property a hardware binding would defeat
- **Per secret**: Each secret of a block opts in independently — a block can mix YubiKey-protected and passphrase-only secrets, and plausible deniability is unaffected (the format records nothing about how any key was derived)
- **Format unchanged**: Only the key derivation differs — YubiKey-protected blocks are byte-compatible with the [payload format](#payload-and-artifact), so a block cannot announce the mode and restoring requires enabling the YubiKey switch again while holding a YubiKey provisioned with the same secret; a missing switch or a YubiKey provisioned with a different secret fails exactly like a wrong passphrase, while an absent YubiKey or unprovisioned slot reports a specific YubiKey error
- **Strength gate**: The passphrase strength requirement applies to the memorized passphrase — the second factor strengthens it rather than replacing it

## Payload and artifact

A block’s QR code encodes a JSON payload: the key-derivation salt and the fixed-size encryption output (both base64-encoded) plus optional metadata such as a label. Legacy payloads carry iv and headers fields as well — their presence is how restoration tells the formats apart (see the [legacy fixed-size encryption technical documentation](legacy/fixed-size-encryption.md)).

```typescript
return {
  salt: salt.toString("base64"),
  data: encrypt(blockSecrets, blockSize).toString("base64"),
  metadata: {
    label: label,
  },
}
```

Superbacked hashes the payload using SHA-256 for integrity and identification; the first eight characters (a **short hash**) are included on the block so you can identify and match blocks at a glance. The hash is not a confidentiality mechanism — a block’s security rests entirely on its encrypted payload.

### Version declaration

Every version 2 secret carries an 8-byte [scheme header](../../src/utilities/crypto/schemeHeader.ts) at the start of its message. A readable header would prove a secret exists, so the header is encrypted alongside the secret, preserving plausible deniability. When decrypting a block:

1. **Each enabled [KDF profile](../../src/shared/kdfProfiles.ts) is trialed.** A key is derived from the passphrase at that profile and decryption is attempted.
2. **The authentication tag is the probe.** A tag authenticates only under the right key, so a successful decryption proves the passphrase and names the profile in one step.
3. **The plaintext opens with the header.** The revealed header names the version: a supported version restores; an unsupported one reports that the block requires a newer version of Superbacked — never a wrong passphrase.

The header costs 8 bytes of block capacity per secret (see `getBlockUsage` in [src/utilities/core/block.ts](../../src/utilities/core/block.ts)).

## Creation workflow

With the app in create mode:

1. Select the single block backup type (blocksets are covered in the [blockset technical documentation](blockset.md)) and optionally enter a label.
2. Enter a secret and its passphrase — and optionally enable “[Protect with YubiKey](#yubikey-second-factor)”.
3. Optionally, add additional secrets using the secret actions menu — each with its own passphrase — until remaining block capacity runs out.
4. Click “Create”.
5. The app encrypts the secret(s) and asks the user to print the block or save it as a JPG or PDF file.

## Restoration workflow

With the app in restore mode:

1. Scan a block.
2. Enter a passphrase — enabling “Protected with YubiKey” for [YubiKey-protected](#yubikey-second-factor) secrets.
3. Click “Unlock”.
4. The app decrypts the secret and asks whether to copy or show it. If a block belongs to a blockset, the app asks the user to scan the next block — see the [blockset technical documentation](blockset.md).
