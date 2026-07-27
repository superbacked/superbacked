# Detached archive technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the detached archive feature in Superbacked. Detached archives allow users to encrypt files and folders using master keys that are embedded — alongside user-provided secrets — in encrypted QR codes called blocks. The content of archives is stored separately from blocks or blocksets while being cryptographically bound to block content — restoring detached archives requires both blocks and passphrases. The source ([src/utilities/core/detachedArchive.ts](../src/utilities/core/detachedArchive.ts) and [src/utilities/core/archive.ts](../src/utilities/core/archive.ts)) is the ground truth for this document.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Detached archives extend the platform with encrypted files and folders that are cryptographically bound to blocks.

Superbacked supports two backup types: block and blockset — the latter embeds additional Shamir Secret Sharing key material alongside user-provided secrets and master keys to enable threshold-based recovery, and comes in three subtypes (2-of-3, 3-of-5 and 4-of-7).

While using QR code encoding allows users to print blocks on archival paper, a format ideal for cold storage, larger datasets cannot be efficiently encoded this way. Detached archives solve this limitation by storing files and folders separately from blocks and blocksets while being cryptographically bound to them.

This design also provides an important future capability: users will be able to update detached archives without regenerating and redistributing blocks. This is particularly valuable in governance schemes where institutional block custodians are involved.

## Terminology

- **Block**: an encrypted QR code printed on archival paper or saved as a JPG or PDF file.
- **Block custodian**: trusted party in a governance scheme who custodies one or more blocks.
- **Blockset**: a set of cryptographically bound blocks.
- **Blockset threshold**: minimum number of blocks required to restore a blockset.
- **Detached archive**: encrypted tar archive containing files and/or folders, stored separately from a block or blockset while being cryptographically bound to block content.
- **Master key**: random 256-bit key embedded in a block alongside a secret, used to derive the detached archive encryption key, HMAC key and filename.
- **Secret**: text entered in the secret field (for example a BIP39 mnemonic, master password or TOTP secret) embedded in a block.

## Overview

When you drag and drop files and/or folders to a block or blockset, the app provisions a detached archive by:

1. Generating a cryptographically secure 256-bit master key
2. Embedding the master key alongside the secret in the block or blockset
3. Deriving the detached archive encryption key, HMAC key and filename from the master key

Then, when you create the block or blockset, the detached archive is created and saved using the `.superbacked` extension.

Finally, the block or blockset is created.

## Master key generation

The master key is generated when files or folders are first added to a block or blockset:

```typescript
masterKey = window.api.invokeSync.generateMasterKey()
```

### Security characteristics

- **Key strength**: 256-bit — provides strong security against brute-force attacks
- **Unpredictability**: Master keys cannot be predicted or reproduced — each generated key is cryptographically unique
- **Key independence**: Master keys are generated independently for each secret to prevent correlation attacks
- **Randomness source**: Node.js `crypto.randomBytes` — cryptographically secure random bytes from the operating system’s CSPRNG

## Key derivation

The master key is used to derive three separate keys using HKDF (HMAC-based Key Derivation Function):

### 1. Encryption key derivation

```typescript
encryptionKey = window.api.invokeSync.deriveKey(masterKey, "encryption-key-v1")
```

**HKDF parameters:**

- **Key**: 256-bit master key
- **Salt**: Empty buffer
- **Info**: `encryption-key-v1` — domain separation string

**Output:**

- 256-bit encryption key

**Purpose:**

Derive the 256-bit encryption key from the master key

### 2. HMAC key derivation

```typescript
hmacKey = window.api.invokeSync.deriveKey(masterKey, "hmac-v1")
```

**HKDF parameters:**

- **Key**: 256-bit master key
- **Salt**: Empty buffer
- **Info**: `hmac-v1` — domain separation string

**Output:**

- 256-bit HMAC key

**Purpose:**

Derive a separate 256-bit HMAC key from the master key to maintain cryptographic key separation between encryption and message authentication

### 3. Filename derivation

```typescript
archiveFilename = window.api.invokeSync.deriveKey(
  masterKey,
  "filename-v1",
  16,
  "hex"
)
```

**HKDF parameters:**

- **Key**: 256-bit master key
- **Salt**: Empty buffer
- **Info**: `filename-v1` — domain separation string

**Output:**

- 128-bit filename

**Purpose:**

- Derive a deterministic 128-bit filename from the master key
- Prevent filename collisions even when storing trillions of archives in a shared namespace

### Domain separation

Using distinct info strings (`encryption-key-v1`, `hmac-v1` and `filename-v1`) ensures the derived keys are cryptographically independent — compromising one derived key does not compromise the others. This prevents cross-protocol attacks where the same key material might be used in different contexts.

## Detached archive format

Detached archives use the portable tar format as the container for files and folders.

- **Container**: Portable tar archive format
- **Portability**: Omits system-specific metadata for cross-platform compatibility
- **File metadata**: Preserves file names, sizes and permissions

## Detached archive encryption

Detached archives use AES-256-GCM authenticated encryption, providing confidentiality and integrity.

**Security characteristics:**

- **Algorithm**: AES-256-GCM authenticated encryption
- **Confidentiality**: The AES-256 block cipher encrypts the detached archive content
- **Integrity**: Galois/Counter Mode (GCM) provides an authentication tag to detect tampering

## Detached archive structure

Detached archives use a binary format with embedded cryptographic metadata.

### File format

Detached archive files use the following binary structure:

```text
[iv (12 bytes)][encrypted data][tag (16 bytes)][hmac (32 bytes)]
```

**Components:**

- **Initialization vector**: 12-byte random initialization vector for AES-256-GCM detached archive encryption
- **Encrypted data**: AES-256-GCM-encrypted portable tar archive
- **Authentication tag**: 16-byte GCM authentication tag
- **HMAC**: 32-byte HMAC-SHA256 message authentication code

This structure embeds all the cryptographic metadata needed for decryption directly in the detached archive file, eliminating the need for separate manifest files.

### Message authentication

Detached archives use HMAC-SHA256 to bind block content to the detached archive:

**HMAC inputs:**

```text
HMAC-SHA256(hmacKey, message || iv || encrypted data || tag)
```

Where `message` contains the JSON-encoded block content.

**Purpose:**

- Cryptographically binds the detached archive to the block content
- Detects tampering of either the block content or the detached archive
- Prevents substitution attacks where an attacker replaces the detached archive with different encrypted content
- Complements the GCM tag, which only authenticates the encrypted data, not the block content

**Security characteristics:**

- **Algorithm**: HMAC-SHA256
- **Key**: Separate 256-bit HMAC key derived from the master key
- **Verification**: Constant-time comparison using `crypto.timingSafeEqual`

### Creation workflow

With the app in create mode:

1. Select the backup type.
2. Enter the block or blockset secret, passphrase and, optionally, label.
3. Drag and drop files and/or folders.
4. Click the create button.
5. Choose where to save the detached archive.
6. The app creates, encrypts and saves the detached archive with its HMAC using the `.superbacked` extension.
7. The app creates the block or blockset.
8. Print or save the block or blockset.

### Restoration workflow

With the app in restore mode:

1. Scan or drag and drop one or more blocks.
2. Enter the block or blockset passphrase.
3. The app derives the encryption key, HMAC key and filename from the embedded master key.
4. Drag and drop the detached archive with the filename matching the derived filename.
5. Choose where to save the detached archive content.
6. The app decrypts and saves the detached archive content.
7. The app verifies the HMAC binding the detached archive to the block content and reports success only when it matches.
