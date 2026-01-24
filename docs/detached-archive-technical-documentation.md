# Detached archive technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the detached archive feature in Superbacked. Detached archives allow users to encrypt files and folders using master keys embedded alongside user-provided secrets in QR code-encoded datasets called blocks. The content of archives is stored separately from blocks while being cryptographically associated to them—restoring detached archives requires both blocks and passphrases providing multi-factor authentication.

## Introduction

Superbacked is a secret management platform used to back up and pass on sensitive data such as BIP39 mnemonics, master passwords and TOTP secrets. Superbacked stores this data in encrypted QR code-encoded datasets called blocks.

Superbacked supports two backup types: single block and blockset which embeds additional Shamir Secret Sharing key material alongside user-provided secrets and master keys to enable threshold-based recovery.

While using QR code encoding allows users to print blocks on archival paper, a format ideal for cold storage, larger datasets cannot be efficiently encoded this way. Detached archives solve this limitation by storing files and folders separately from blocks and blocksets while being cryptographically associated to them.

This design also provides an important future capability: users will be able to update archives without regenerating and redistributing blocks. This is particularly valuable in governance schemes where institutional block custodians are involved.

## Terminology

- **Block**: Encrypted QR code-encoded dataset
- **Blockset**: Set of cryptographically-associated blocks
- **Blockset threshold**: Minimum number of blocks required to restore blockset
- **Block custodian**: Trusted party in governance scheme who custodies one or more blocks
- **Secret**: Text entered in secret field (BIP39 mnemonic, master password, TOTP secret, etc…) stored in block
- **Master key**: Random 256-bit key embedded in block alongside user-provided secret used to derive archive encryption key and filename
- **Archive**: Encrypted tar archive containing files and/or folders stored separately from block or blockset

## Overview

When user drags and drops files and/or folders to block or blockset, app provisions archive by:

1. Generating cryptographically-secure 256-bit master key
2. Embedding master key alongside secret in block or blockset
3. Deriving archive encryption key from master key
4. Deriving archive filename from master key and secret

Then, when user creates block or blockset, archive is created, encrypted and saved using `.superbacked` extension.

Finally, block or blockset is created.

## Master key generation

Master key is generated when files or folders are first added to block or blockset:

```typescript
masterKey = window.api.invokeSync.generateMasterKey()
```

### Security characteristics

- **Key strength**: 256-bit—provides strong security against brute-force attacks
- **Unpredictability**: Master keys cannot be predicted or reproduced—each generated key is cryptographically unique
- **Forward secrecy**: Master keys are generated independently for each secret to prevent correlation attacks
- **Randomness source**: Node.js `crypto.randomBytes`—generates cryptographically secure pseudo-random bytes using `/dev/urandom`

## Key derivation

Master key is used to derive two separate keys using HKDF (HMAC-based Key Derivation Function):

### 1. Encryption key derivation

```typescript
encryptionKey = window.api.invokeSync.deriveKey(masterKey, "encryption-key-v1")
```

**HKDF parameters:**

- **Key**: 256-bit master key
- **Info**: `encryption-key-v1`—domain separation string

**Output:**

- 256-bit encryption key

**Purpose:**

Derive 256-bit encryption key from master key

### 2. Filename derivation

```typescript
const salt = window.btoa(formSecret || "")
archiveFilename = window.api.invokeSync.deriveKey(
  masterKey,
  "filename-v1",
  16,
  "hex",
  salt
)
```

**HKDF parameters:**

- **Key**: 256-bit master key
- **Info**: `filename-v1`—domain separation string
- **Salt**: secret or empty string

**Output:**

- 128-bit filename

**Purpose:**

- Derive deterministic 128-bit filename from master key and secret
- Provide deterministic yet private two-way cryptographic association between filename and secret
- Prevent filename collisions even when storing trillions of archives in shared namespace

### Why use secret as salt?

Using secret as salt during key derivation ensures same master key and secret will always output same filename while different secrets output different filenames. This design prevents filename guessing and provides a deterministic two-way cryptographic association between archive and secrets. TL;DR; Using filename, one can cryptographically prove that secret has not been tampered with.

## Archive format

Archives use portable tar format as the container for files and folders.

- **Container**: Portable tar archive format
- **Portability**: Omits system-specific metadata for cross-platform compatibility
- **File metadata**: Preserves file names, sizes and permissions

## Archive encryption

Archives use AES-256-GCM authenticated encryption providing confidentiality and integrity.

**Security characteristics:**

- **Algorithm**: AES-256-GCM authenticated encryption
- **Confidentiality**: AES-256 block cipher encrypts archive content
- **Integrity**: Galois/Counter Mode (GCM) provides authentication tag to detect tampering

## Archive structure

Archives use binary format with embedded cryptographic metadata.

### File format

Archive files use the following binary structure:

```text
[salt (16 bytes)][nonce (12 bytes)][encrypted data][tag (16 bytes)]
```

**Components:**

- **Salt**: 16-byte random salt (not used by detached archives)
- **Nonce**: 12-byte random nonce for AES-256-GCM archive encryption
- **Encrypted data**: AES-256-GCM encrypted portable tar archive
- **Authentication tag**: 16-byte GCM authentication tag

This structure embeds all cryptographic metadata needed for decryption directly in archive file, eliminating the need for separate manifest files.

### Creation workflow

With app in create mode:

1. User selects backup type
2. User enters block or blockset secret, passphrase and, optionally, label
3. User drags and drops files and/or folders
4. User clicks create button
5. User chooses where to save archive
6. App creates, encrypts and saves archive using `.superbacked` extension
7. App creates block or blockset
8. User prints or saves block or blockset

### Restoration workflow

With app in restore mode:

1. User scans or drags and drops one or more blocks
2. User enters block or blockset passphrase
3. App derives archive encryption key from embedded master key
4. App derives archive filename from embedded master key and secret
5. User drags and drops archive with matching filename
6. User chooses where to save archive content
