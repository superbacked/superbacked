# Block technical documentation

## Abstract

This document covers the Superbacked-level design of a block. Superbacked encodes secrets as encrypted QR codes called blocks — 4×6-inch cards printed on archival paper or saved as JPG or PDF files (printing is recommended). Secrets are encrypted using fixed-size encryption — a scheme that provides plausible deniability — and the result is packaged as the block’s QR code. Its cryptographic design (ciphers, key derivation, block format and padding) is specified in the [fixed-size encryption technical documentation](fixed-size-encryption.md). Each secret is protected by a passphrase, optionally strengthened with a [YubiKey second factor](#yubikey-second-factor). The source ([src/utilities/core/block.ts](../../src/utilities/core/block.ts), [src/handlers/create.ts](../../src/handlers/create.ts) and [src/block/App.tsx](../../src/block/App.tsx)) is the ground truth for this document.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Blocks are the foundation of the platform. Some secrets are too important to lose and too sensitive to share — Superbacked encrypts them into blocks using a passphrase, and only you can decrypt them: no account, no internet connection. Printed blocks are ideal for cold storage, which is why printing is recommended.

Blocks can hold multiple secrets, each protected by its own passphrase — the first is always present, additional secrets are concealed and capacity is bounded only by the fixed block size. Every block has the same fixed size — 768 bytes of encrypted data or random padding in current versions, bounded by QR code capacity at the low error correction level (see [src/utilities/core/block.ts](../../src/utilities/core/block.ts)) — and additional secrets are indistinguishable from the random padding that fills unused block space. Without an additional secret’s passphrase, an adversary cannot tell whether it exists at all.

## Terminology

- **Additional secret**: any secret of a block beyond the first — indistinguishable from padding, so its existence cannot be proven without knowing its passphrase. Additional secrets are the basis of a block’s plausible deniability.
- **Block**: an encrypted QR code printed on archival paper or saved as a JPG or PDF file.
- **Fixed-size encryption**: the scheme Superbacked uses to encrypt secrets — see the [fixed-size encryption technical documentation](fixed-size-encryption.md).
- **Payload**: the JSON, carrying the fixed-size encryption output, that a block’s QR code encodes.
- **Plausible deniability**: the property that the number of secrets in a block, and the existence of any undisclosed secret, cannot be determined from the block.

## How a block is created

When you create a block, the app:

1. Takes one or more secrets — as many as fit the block — each with its own passphrase (optionally [YubiKey-protected](#yubikey-second-factor)) and an optional label.
2. Derives a key from each passphrase using Argon2d at the active [KDF profile](scheme-registry.md) and the `block-key` HKDF domain key, prepends the 8-byte [scheme header](scheme-registry.md) to each secret’s message, then encrypts the secrets using fixed-size encryption.
3. Serializes the fixed-size encryption output as a JSON payload.
4. Encodes the payload as a QR code and renders the block — a 4×6-inch card carrying the QR code alongside a label and a short hash — printed or saved as a JPG or PDF file.

## Encryption

Blocks are encrypted using [fixed-size encryption](fixed-size-encryption.md). Superbacked derives each secret’s key (Argon2d, memory-hard, followed by the backup type’s HKDF domain key — see `encryptBlock` in [src/utilities/core/block.ts](../../src/utilities/core/block.ts)) and sets the fixed block size, which bounds how many secrets a block holds; the scheme provides the properties a block relies on:

- **Authenticated encryption** of each secret under its own passphrase — a wrong passphrase or a tampered block fails to decrypt.
- **Plausible deniability** — every byte of a block is ciphertext or random padding, indistinguishable from random data, so a block reveals nothing about how many secrets it holds beyond the first, which is always present.
- **A fixed block size** — every block is padded to the same size, so its size reveals nothing about how much it holds.

The cryptographic design behind these properties — the ciphers, key derivation, block format and padding — lives in the [fixed-size encryption technical documentation](fixed-size-encryption.md), not here.

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

### Version declaration

Every version 2 secret carries the 8-byte [scheme header](scheme-registry.md) at the start of its message plaintext, inside the encryption — the payload is visible JSON, but the version is declared only to a passphrase holder and plausible deniability is unaffected. A successful decryption therefore also names the version:

- A supported version restores; an unsupported one reports that the block requires a newer release of Superbacked, never a wrong passphrase
- The header costs 8 bytes of block capacity per secret (see `getBlockUsage` in [src/utilities/core/block.ts](../../src/utilities/core/block.ts))
- Restoration trials the standard profile — and the paranoid profile while Paranoid mode is enabled, so a paranoid block restored without the mode reports a wrong passphrase until it is switched on — with the payload’s own authentication tags serving as the probe (see the [scheme registry technical documentation](scheme-registry.md))

Superbacked hashes the payload using SHA-256 for integrity and identification; the first eight characters (a **short hash**) are included on the block so you can identify and match blocks at a glance. The block itself is a 4×6-inch card designed to explain itself decades later: the QR code sits at its center, the label and short hash identify it, a recovery pointer (superbacked.com/recover) says how to restore it, an “Important document, do not discard” notice guards it against accidental disposal and trim marks frame the printed card for cutting to size. A block’s security rests entirely on its encrypted payload — the hash is for integrity and identification, not confidentiality.

## Creation workflow

With the app in create mode:

1. Select the block backup type (blocksets are covered in the [blockset technical documentation](blockset.md)).
2. Enter a secret, its passphrase and an optional label — and optionally enable the [YubiKey second factor](#yubikey-second-factor).
3. Optionally, click the add secret button to add additional secrets — each with its own passphrase — until remaining block capacity runs out.
4. Click the create button.
5. The app encrypts the secret(s) and asks the user to print the block or save it as a JPG or PDF file.

## Restoration workflow

With the app in restore mode:

1. Scan a block.
2. Enter a passphrase — enabling the YubiKey switch for [YubiKey-protected](#yubikey-second-factor) secrets.
3. Click the unlock button.
4. The app decrypts the secret and asks whether to copy or show it. If a block belongs to a blockset, the app asks the user to scan the next block — see the [blockset technical documentation](blockset.md).

## YubiKey second factor

With the YubiKey switch in the app’s create and restore flows, a secret’s stretched key becomes the input keying material of a [passphrase key](passphrase-key.md) derivation instead of the key derivation function key itself: the YubiKey answers a challenge derived from the stretched key and the response is mixed back in through HKDF-SHA256 under the frozen info `kdf-key` — the backup type’s HKDF domain key is applied on top either way (see `computeBlockKdfKey` in [src/utilities/core/block.ts](../../src/utilities/core/block.ts)):

```typescript
export const computeBlockKdfKey = async (
  passphrase: string,
  salt: Buffer,
  profile: KdfProfile,
  yubikey?: ChallengeResponseOptions
): Promise<Buffer> => {
  return computePassphraseKey(
    passphrase,
    salt,
    profile,
    passphraseKeyInfo,
    yubikey
  )
}
```

The scheme — stretching, challenge computation, response mixing and its security model — is specified in the [passphrase key technical documentation](passphrase-key.md) and shared with [standalone archives](standalone-archive.md#yubikey-second-factor). Block specifics:

- **Blocks only**: The second factor applies to standard blocks, never blocksets — a blockset’s shares are meant to restore on any machine holding enough blocks, a property a hardware binding would defeat
- **Per secret**: Each secret of a block opts in independently — a block can mix YubiKey-protected and passphrase-only secrets, and plausible deniability is unaffected (the format records nothing about how any key was derived)
- **Format unchanged**: Only the key derivation differs — YubiKey-protected blocks are byte-compatible with the format above, so a block cannot announce the mode and restoring requires enabling the YubiKey switch again while holding a YubiKey provisioned with the same slot secret; a missing switch, wrong slot or wrong hardware fails exactly like a wrong passphrase
- **Strength gate**: The passphrase strength requirement applies to the memorized passphrase — the second factor strengthens it rather than replacing it
