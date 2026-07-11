# Block technical documentation

## Abstract

A block is Superbacked’s encrypted QR code backup, printed on archival paper. Secrets are encrypted using [Blockcrypt](https://github.com/superbacked/blockcrypt) — an open-source primitive that provides plausible deniability by design — and the result is packaged as a QR code on a 4×6 inch card. This document covers the Superbacked-level design of a block; Blockcrypt’s cryptographic construction (ciphers, key schedule, header format and padding) is specified in its own repository.

## Introduction

Some secrets are too important to lose and too sensitive to share — critical credentials, signing keys and digital assets. Superbacked encrypts them using passphrase in an encrypted QR code-encoded dataset called a block, printed on archival paper for cold storage. No account, no internet connection — only you can decrypt it.

A single block holds up to three secrets, each protected by its own passphrase. At least one secret is always present; whether the block holds a second or a third cannot be determined, because any additional secrets are indistinguishable from the random padding that fills every block to a fixed size. Revealing one passphrase therefore never proves it is the only secret: someone compelled to open a block can disclose a decoy while plausibly denying that any other secret exists.

## Terminology

- **Block**: an encrypted QR code backup, printed on paper.
- **Blockcrypt**: the open-source primitive Superbacked uses to encrypt a block’s secrets — see [github.com/superbacked/blockcrypt](https://github.com/superbacked/blockcrypt).
- **Payload**: the JSON, carrying Blockcrypt’s output, that a block’s QR code encodes.
- **Plausible deniability**: the property that the number of secrets in a block, and the existence of any undisclosed secret, cannot be determined from the block.

## How a block is created

When you create a block, the app:

1. Takes up to three secrets, each with its own passphrase and an optional label.
2. Derives a key from each passphrase using Argon2d — the same memory-hard key derivation documented for [standalone](standalone-archive-technical-documentation.md) and [detached](detached-archive-technical-documentation.md) archives — and encrypts the secrets using Blockcrypt.
3. Serializes Blockcrypt’s output as a JSON payload.
4. Encodes the payload as a QR code and prints it on a 4×6 inch block, alongside a label and a short hash.

## Encryption

Blocks are encrypted using [Blockcrypt](https://github.com/superbacked/blockcrypt). Superbacked supplies the key-derivation function (Argon2d, memory-hard) and configures blocks to hold up to three secrets; Blockcrypt provides the properties a block relies on:

- **Authenticated encryption** of each secret under its own passphrase — a wrong passphrase or a tampered block fails to decrypt.
- **Plausible deniability** — a block’s encrypted headers are indistinguishable from its encrypted data and from random padding, so the number of secrets it holds cannot be read off the block. At least one secret is always present; whether a second or third exists cannot be told.
- **A fixed block size** — every block is padded to the same size, so its size reveals nothing about how much it holds.

The cryptographic construction behind these properties — the ciphers, key schedule, header format and padding — lives in the [Blockcrypt repository](https://github.com/superbacked/blockcrypt), not here.

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

Superbacked hashes the payload using SHA-256 for integrity and identification; the first eight characters (a **short hash**) are printed on the block so you can identify and match blocks at a glance. The QR code is printed on a 4×6 inch block with trim marks, alongside the label and short hash. A block’s security rests entirely on its encrypted payload — the hash is for integrity and identification, not confidentiality.

## Creation workflow

With the app in create mode:

1. Enter one or more secrets, each with its own passphrase and an optional label.
2. Select a single block (blocksets are covered in the [blockset technical documentation](blockset-technical-documentation.md)).
3. Click the create button.
4. The app encrypts the secrets and prints the block on a 4×6 inch block.

## Restoration workflow

With the app in create mode:

1. Scan a block.
2. Enter a passphrase.
3. Click the restore button.
4. The app decrypts and displays the secret. A block that belongs to a blockset carries a share rather than the secret itself — see the [blockset technical documentation](blockset-technical-documentation.md).
