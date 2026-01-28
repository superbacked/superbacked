# Detached archive technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the detached archive feature in Superbacked. Detached archives allow users to encrypt files and folders using master keys embedded alongside user-provided secrets in QR code-encoded datasets called blocks. The content of archives is stored separately from blocks or blocksets while being cryptographically bound to block content—restoring detached archives requires both blocks and passphrases providing multi-factor authentication.

## Introduction

Superbacked is a secret management platform used to back up and pass on sensitive data such as BIP39 mnemonics, master passwords and TOTP secrets. Superbacked stores this data in encrypted QR code-encoded datasets called blocks.

Superbacked supports two backup types: single block and blockset which embeds additional Shamir Secret Sharing key material alongside user-provided secrets and master keys to enable threshold-based recovery.

While using QR code encoding allows users to print blocks on archival paper, a format ideal for cold storage, larger datasets cannot be efficiently encoded this way. Detached archives solve this limitation by storing files and folders separately from blocks and blocksets while being cryptographically bound to them.

This design also provides an important future capability: users will be able to update detached archives without regenerating and redistributing blocks. This is particularly valuable in governance schemes where institutional block custodians are involved.

## Terminology

- **Block**: Encrypted QR code-encoded dataset
- **Blockset**: Set of cryptographically-bound blocks
- **Blockset threshold**: Minimum number of blocks required to restore blockset
- **Block custodian**: Trusted party in governance scheme who custodies one or more blocks
- **Secret**: Text entered in secret field (BIP39 mnemonic, master password, TOTP secret, etc…) embedded in block
- **Master key**: Random 256-bit key embedded in block alongside secret used to derive detached archive encryption key, HMAC key and filename
- **Detached archive**: Encrypted tar archive containing files and/or folders stored separately from block or blockset while being cryptographically bound to block content

## Overview

When user drags and drops files and/or folders to block or blockset, app provisions detached archive by:

1. Generating cryptographically-secure 256-bit master key
2. Embedding master key alongside secret in block or blockset
3. Deriving detached archive encryption key, HMAC key and filename from master key

Then, when user creates block or blockset, detached archive is created and saved using `.superbacked` extension.

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

Master key is used to derive three separate keys using HKDF (HMAC-based Key Derivation Function):

### 1. Encryption key derivation

```typescript
encryptionKey = window.api.invokeSync.deriveKey(masterKey, "encryption-key-v1")
```

**HKDF parameters:**

- **Key**: 256-bit master key
- **Salt**: Empty buffer
- **Info**: `encryption-key-v1`—domain separation string

**Output:**

- 256-bit encryption key

**Purpose:**

Derive 256-bit encryption key from master key

### 2. HMAC key derivation

```typescript
hmacKey = window.api.invokeSync.deriveKey(masterKey, "hmac-v1")
```

**HKDF parameters:**

- **Key**: 256-bit master key
- **Salt**: Empty buffer
- **Info**: `hmac-v1`—domain separation string

**Output:**

- 256-bit HMAC key

**Purpose:**

Derive separate 256-bit HMAC key from master key to maintain cryptographic key separation between encryption and message authentication

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
- **Info**: `filename-v1`—domain separation string

**Output:**

- 128-bit filename

**Purpose:**

- Derive deterministic 128-bit filename from master key
- Prevent filename collisions even when storing trillions of archives in shared namespace

### Domain separation

Using distinct info strings (`encryption-key-v1`, `hmac-v1` and `filename-v1`) ensures derived keys are cryptographically independent—compromising one derived key does not compromise the others. This prevents cross-protocol attacks where same key material might be used in different contexts.

## Detached archive format

Detached archives use portable tar format as the container for files and folders.

- **Container**: Portable tar archive format
- **Portability**: Omits system-specific metadata for cross-platform compatibility
- **File metadata**: Preserves file names, sizes and permissions

## Detached archive encryption

Detached archives use AES-256-GCM authenticated encryption providing confidentiality and integrity.

**Security characteristics:**

- **Algorithm**: AES-256-GCM authenticated encryption
- **Confidentiality**: AES-256 block cipher encrypts detached archive content
- **Integrity**: Galois/Counter Mode (GCM) provides authentication tag to detect tampering

## Detached archive structure

Archives use binary format with embedded cryptographic metadata.

### File format

Detached archive files use the following binary structure:

```text
[nonce (12 bytes)][encrypted data][tag (16 bytes)][hmac (32 bytes)]
```

**Components:**

- **Nonce**: 12-byte random nonce for AES-256-GCM detached archive encryption
- **Encrypted data**: AES-256-GCM encrypted portable tar archive
- **Authentication tag**: 16-byte GCM authentication tag
- **HMAC**: 32-byte HMAC-SHA256 message authentication code

This structure embeds all cryptographic metadata needed for decryption directly in detached archive file, eliminating the need for separate manifest files.

### Message authentication

Detached archives use HMAC-SHA256 to bind block content to detached archive:

**HMAC inputs:**

```text
HMAC-SHA256(hmacKey, message || nonce || encrypted data || tag)
```

Where `message` contains JSON-encoded block content.

**Purpose:**

- Cryptographically binds detached archive to block content
- Detects tampering of either block content or detached archive
- Prevents substitution attacks where attacker replaces detached archive with different encrypted content
- Complements GCM tag which only authenticates encrypted data, not block content

**Security characteristics:**

- **Algorithm**: HMAC-SHA256
- **Key**: Separate 256-bit HMAC key derived from master key
- **Verification**: Constant-time comparison using `crypto.timingSafeEqual`

### Creation workflow

With app in create mode:

1. User selects backup type
2. User enters block or blockset secret, passphrase and, optionally, label
3. User drags and drops files and/or folders
4. User clicks create button
5. User chooses where to save detached archive
6. App creates, encrypts and saves detached archive with HMAC using `.superbacked` extension
7. App creates block or blockset
8. User prints or saves block or blockset

### Restoration workflow

With app in restore mode:

1. User scans or drags and drops one or more blocks
2. User enters block or blockset passphrase
3. App derives encryption key, HMAC key and filename from embedded master key
4. User drags and drops detached archive with filename matching derived filename
5. User chooses where to save detached archive content
6. App verifies HMAC authentication binding detached archive to block content
7. App decrypts and saves detached archive content
