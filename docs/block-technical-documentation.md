# Block technical documentation

## Abstract

This document covers the Superbacked-level design of a block. Superbacked encodes secrets as encrypted QR codes called blocks — 4×6-inch cards printed on archival paper or saved as JPG or PDF files (printing is recommended). Secrets are encrypted using [Blockcrypt](https://github.com/superbacked/blockcrypt) — an open-source primitive that provides plausible deniability — and the result is packaged as the block’s QR code. Blockcrypt’s cryptographic design (ciphers, key derivation, header format and padding) is specified in its own repository.

## Introduction

Some secrets are too important to lose and too sensitive to share — critical credentials, signing keys and digital assets. Superbacked encrypts them using a passphrase and encodes the result as a QR code called a block, printed on archival paper for cold storage or saved as a JPG or PDF file (printing is recommended). No account, no internet connection — only you can decrypt it.

Blocks can hold up to three secrets, each protected by its own passphrase — the first is always present, a second or third secret is hidden. Every block has the same fixed size (512 bytes of encrypted data or random padding in current versions), and hidden secrets are indistinguishable from the random padding that fills unused block space. Without a hidden secret’s passphrase, an adversary cannot tell whether it exists at all.

## Terminology

- **Block**: an encrypted QR code backup, printed on paper or saved as a JPG or PDF file.
- **Blockcrypt**: the open-source primitive Superbacked uses to encrypt secrets — see [github.com/superbacked/blockcrypt](https://github.com/superbacked/blockcrypt).
- **Hidden secret**: second or third secret of a block — indistinguishable from padding, so its existence cannot be proven without knowing its passphrase. Hidden secrets are the basis of a block’s plausible deniability.
- **Payload**: the JSON, carrying Blockcrypt’s output, that a block’s QR code encodes.
- **Plausible deniability**: the property that the number of secrets in a block, and the existence of any undisclosed secret, cannot be determined from the block.

## How a block is created

When you create a block, the app:

1. Takes up to three secrets, each with its own passphrase and an optional label.
2. Derives a key from each passphrase using Argon2d and encrypts the secrets using Blockcrypt.
3. Serializes Blockcrypt’s output as a JSON payload.
4. Encodes the payload as a QR code and renders the block — a 4×6-inch card carrying the QR code alongside a label and a short hash — printed or saved as a JPG or PDF file.

## Encryption

Blocks are encrypted using [Blockcrypt](https://github.com/superbacked/blockcrypt). Superbacked supplies the key-derivation function (Argon2d, memory-hard) and configures blocks to hold up to three secrets; Blockcrypt provides the properties a block relies on:

- **Authenticated encryption** of each secret under its own passphrase — a wrong passphrase or a tampered block fails to decrypt.
- **Plausible deniability** — a block’s encrypted headers are indistinguishable from its encrypted data and from random padding, so the number of secrets it holds cannot be determined. At least one secret is always present; whether a second or third (hidden) secret exists cannot be determined.
- **A fixed block size** — every block is padded to the same size, so its size reveals nothing about how much it holds.

The cryptographic design behind these properties — the ciphers, key derivation, header format and padding — lives in the [Blockcrypt repository](https://github.com/superbacked/blockcrypt), not here.

## Payload and artifact

A block’s QR code encodes a JSON payload: Blockcrypt’s output (salt, initialization vector, headers and data, base64-encoded) plus optional metadata such as a label.

```typescript
const payload = {
  salt: block.salt.toString("base64"),
  iv: block.iv.toString("base64"),
  headers: block.headers.toString("base64"),
  data: block.data.toString("base64"),
  metadata: { label },
}
```

Superbacked hashes the payload using SHA-256 for integrity and identification; the first eight characters (a **short hash**) are included on the block so you can identify and match blocks at a glance. The block itself is a 4×6-inch card designed to explain itself decades later: the QR code sits at its center, the label and short hash identify it, a recovery pointer (superbacked.com/recover) says how to restore it, an “Important document, do not discard” notice protects it from being discarded and trim marks frame the printed card for cutting to size. A block’s security rests entirely on its encrypted payload — the hash is for integrity and identification, not confidentiality.

## Creation workflow

With the app in create mode:

1. Select the single block backup type (blocksets are covered in the [blockset technical documentation](blockset-technical-documentation.md)).
2. Enter a secret, its passphrase and an optional label.
3. Optionally, click the add hidden secret button to add a second or third secret, each with its own passphrase.
4. Click the create button.
5. The app encrypts the secret(s) and asks the user to print the block or save it as a JPG or PDF file.

## Restoration workflow

With the app in restore mode:

1. Scan a block.
2. Enter a passphrase.
3. Click the unlock button.
4. The app decrypts the secret and asks whether to copy or show it. If a block belongs to a blockset, the app asks the user to scan the next block — see the [blockset technical documentation](blockset-technical-documentation.md).
