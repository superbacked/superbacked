# Detached archive technical documentation

## Abstract

This document specifies the cryptographic design and implementation of detached archives. Detached archives allow users to encrypt files and folders using master keys that are embedded — alongside user-provided secrets — in [blocks](block.md). The content of archives is stored separately from blocks or blocksets while being cryptographically bound to blocks — restoring detached archives requires both blocks and passphrases. The source code ([src/utilities/core/detachedArchive.ts](../../src/utilities/core/detachedArchive.ts) and [src/utilities/core/archive.ts](../../src/utilities/core/archive.ts)) is the ground truth for this document, and the frozen key chain is pinned by [tests/detachedArchive.test.ts](../../tests/detachedArchive.test.ts). Archives created before version 2 restore through the [legacy detached archive](legacy/detached-archive.md) scheme.

## Introduction

Superbacked protects secrets too important to lose and too sensitive to share — critical credentials, signing keys and digital assets. Secrets are backed up — encrypted, offline, with succession planning built in — or never stored at all: derived on demand from a master passphrase and YubiKey.

Detached archives extend Superbacked with encrypted files and folders that are cryptographically bound to blocks — the archive’s master key is embedded in the block, so restoration requires both the block and its passphrase.

A block carries what fits inside a QR code; a detached archive lets files and folders ride with one, stored separately. Separate storage also anticipates a future capability: updating a detached archive without regenerating and redistributing blocks — most valuable in governance schemes where institutional block custodians hold the blocks.

Files that need no block belong in a [standalone archive](standalone-archive.md) instead.

## Terminology

- **Block custodian**: trusted party in a governance scheme who custodies one or more blocks.
- **Detached archive**: encrypted tar archive containing files and/or folders, stored separately from a block or blockset while being cryptographically bound to its block.
- **Master key**: random 256-bit key embedded in a block alongside a secret, used to derive the detached archive encryption key, HMAC key and filename.
- **Secret**: text entered in the secret field (for example a master password, TOTP secret or BIP39 mnemonic) embedded in a block.

Block, blockset and threshold carry the same meaning as in the [block](block.md) and [blockset](blockset.md) technical documentation.

## Overview

When you drag and drop files and/or folders to a block or blockset, the app provisions a detached archive by:

1. Generating a cryptographically secure 256-bit master key
2. Embedding the master key alongside the secret in the block or blockset
3. Deriving the detached archive encryption key, HMAC key and filename from the master key — only the filename reaches the renderer (to name the archive); the keys never leave the main process

Then, when you create the block or blockset, the detached archive is created and saved using the `.superbacked` extension.

Finally, the block or blockset is created.

## Master key generation

The master key is generated when files or folders are first added to a block or blockset (see `generateMasterKey` in [src/handlers/archive.ts](../../src/handlers/archive.ts)).

### Security characteristics

- **Key strength**: 256-bit — provides strong security against brute-force attacks
- **Unpredictability**: Master keys cannot be predicted or reproduced — each generated key is cryptographically unique
- **Key independence**: Master keys are generated independently for each secret to prevent correlation attacks
- **Randomness source**: Node.js `crypto.randomBytes` — cryptographically secure random bytes from the operating system’s CSPRNG

## Key derivation

The master key is expanded into a key chain — encryption key, HMAC key and filename — using HKDF-SHA256 (see `deriveDetachedArchiveKeys` in [src/utilities/core/detachedArchive.ts](../../src/utilities/core/detachedArchive.ts)):

| Output         | Info                        | Length   | Purpose                                                                                    |
| -------------- | --------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| Encryption key | `detached-archive-key`      | 256 bits | AES-256-GCM encryption of the archive                                                      |
| HMAC key       | `detached-archive-hmac`     | 256 bits | Separate authentication key — cryptographic key separation from encryption                 |
| Filename       | `detached-archive-filename` | 128 bits | Deterministic hex filename — collision-free even across trillions of archives in one place |

Every derivation uses the 256-bit master key as input keying material with an empty salt. Distinct info strings make the outputs cryptographically independent — compromising one reveals nothing about the others.

### Legacy scheme

Archives created before version 2 derive a different chain from the same master key and restore through their own scheme — see the [legacy detached archive technical documentation](legacy/detached-archive.md). The legacy scheme is restoration-only, and the fallback is bounded in the consumer ([src/handlers/detachedArchive.ts](../../src/handlers/detachedArchive.ts)): restoration probes for the current scheme and falls back to the legacy scheme only when no probe matches, so neither scheme module references the other. The filename is the one property named by the block’s era rather than detected — the archive must be located on disk before restoration can probe it, and a legacy block always pairs with a legacy archive.

## Encryption

A portable tar archive of the files and folders is encrypted using AES-256-GCM and the encryption key derived from the master key (see [Key derivation](#key-derivation)). The construction provides the properties an archive relies on:

- **Authenticated encryption** — the GCM authentication tag detects tampering of the archive content, and the [HMAC](#message-authentication) binds the whole file to the block content
- **Indistinguishability** — every byte of the file is ciphertext or random cryptographic metadata, indistinguishable from random data
- **Portability** — the tar container omits system-specific metadata and preserves file names, sizes and permissions, so archives restore across platforms

## Structure

Detached archives use a binary format with embedded cryptographic metadata.

### File format

Detached archive files use the following binary structure:

```text
[probe block (36 bytes)][iv (12 bytes)][encrypted data][tag (16 bytes)][hmac (32 bytes)]
```

**Components:**

- **Probe block**: encrypted [scheme header](../../src/utilities/crypto/schemeHeader.ts) — a 12-byte initialization vector, the 8-byte header (encrypted using AES-256-GCM and the probe key) and a 16-byte authentication tag
- **Initialization vector**: 12-byte random initialization vector for AES-256-GCM detached archive encryption
- **Encrypted data**: AES-256-GCM-encrypted portable tar archive
- **Authentication tag**: 16-byte GCM authentication tag
- **HMAC**: 32-byte HMAC-SHA256 message authentication code

Version 1 archives are identical without the probe block and restore through their own scheme and chain (see the [legacy detached archive technical documentation](legacy/detached-archive.md)). Both structures embed all the cryptographic metadata needed for decryption directly in the detached archive file, every byte indistinguishable from random data.

### Version declaration

The probe key is derived from the encryption key using HKDF-SHA256 under the frozen info `version-probe` — derived inside the archive core, so the handler wire format stays the stored key pair and block content. Because every key is already in hand at restoration (embedded in the block), the probe is free and always decisive:

1. A probe revealing the header restores at the declared version — an unsupported version reports that the detached archive requires a newer version of Superbacked
2. No probe match falls back to the [legacy scheme](legacy/detached-archive.md), whose HMAC delivers the verdict — so corruption surfaces there, never as a wrong key

Master keys are random, so no KDF profile applies — detached archives are unaffected by Paranoid mode (their gate is the block that embeds their master key).

### Message authentication

Detached archives use HMAC-SHA256 to bind block content to the detached archive:

**HMAC inputs:**

```text
HMAC-SHA256(hmacKey, message || probe block || iv || encrypted data || tag)
```

Where `message` contains the JSON-encoded block content (the [legacy scheme](legacy/detached-archive.md) binds the same way, without the probe block and using its own HMAC key). The probe block is authenticated by its own GCM tag, but binding it into the HMAC keeps the whole file under one integrity root.

**Purpose:**

- Cryptographically binds the detached archive to the block content
- Detects tampering of either the block content or the detached archive
- Detects substitution attacks where an attacker replaces the detached archive with different encrypted content
- Complements the GCM tag, which only authenticates the encrypted data, not the block content

**Security characteristics:**

- **Algorithm**: HMAC-SHA256
- **Key**: Separate 256-bit HMAC key derived from the master key
- **Verification**: Constant-time comparison using `crypto.timingSafeEqual`

Verification follows extraction: the GCM tag and the HMAC authenticate whole streams, so restoration streams decrypted content to disk and both verdicts land only after extraction. A tampered archive is always detected and reported, but its content has already been written — delete the output of a failed restore.

## Creation workflow

With the app in create mode:

1. Select the backup type and optionally enter a label.
2. Enter the block or blockset secret and passphrase.
3. Drag and drop files and/or folders.
4. Click “Create”.
5. Choose where to save the detached archive.
6. The app creates, encrypts and saves the detached archive with its HMAC using the `.superbacked` extension.
7. The app creates the block or blockset.
8. Print or save the block or blockset.

## Restoration workflow

With the app in restore mode:

1. Scan or drag and drop one or more blocks.
2. Enter the block or blockset passphrase.
3. The app derives the archive filename from the embedded master key — through the block era’s chain, as the file must be located by name before it can be probed.
4. Drag and drop the detached archive with the filename matching the derived filename.
5. Choose where to save the detached archive content.
6. The app probes the archive — restoring through the current scheme on a match and falling back to the [legacy scheme](legacy/detached-archive.md) when no probe matches — then decrypts and saves the content.
7. The app verifies the HMAC binding the detached archive to the block content and reports success only when it matches.
