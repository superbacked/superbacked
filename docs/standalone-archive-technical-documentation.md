# Standalone archive technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the standalone archive feature in Superbacked. Standalone archives allow users to encrypt files and folders using passphrases without having to create blocks or blocksets—restoring standalone archives requires only passphrases providing single-factor authentication.

## Introduction

Superbacked is a secret management platform used to back up and pass on sensitive data such as BIP39 mnemonics, master passwords and TOTP secrets. Superbacked stores this data in encrypted QR code-encoded datasets called blocks.

Superbacked supports two backup types: single block and blockset which embeds additional Shamir Secret Sharing key material alongside user-provided secrets to enable threshold-based recovery.

While using QR code encoding allows users to print blocks on archival paper, a format ideal for cold storage, larger datasets cannot be efficiently encoded this way and some use-cases may not require these properties.

Standalone archives provide a simple alternative when users need to encrypt files and folders using passphrases.

## Terminology

- **Block**: Encrypted QR code-encoded dataset
- **Blockset**: Set of cryptographically-associated blocks
- **Passphrase**: User-provided passphrase used to derive encryption key
- **Archive**: Encrypted tar archive containing files and/or folders stored separately from block or blockset

## Overview

When user creates standalone archive, app creates archive by:

1. Generating cryptographically-secure 128-bit salt
2. Deriving 256-bit encryption key from passphrase and salt
3. Generating cryptographically-secure 96-bit nonce
4. Creating, encrypting and saving archive using `.superbacked` extension

## Salt generation

Random salt is generated for each standalone archive:

```typescript
const salt = generateSalt()
```

### Implementation

```typescript
export const generateSalt = (saltSize = 16): Buffer => {
  return randomBytes(saltSize)
}
```

### Security characteristics

- **Salt strength**: 128 bit—provides strong security against rainbow table attacks
- **Randomness source**: Node.js `crypto.randomBytes`—generates cryptographically-secure pseudo-random bytes using `/dev/urandom`
- **Storage**: Salt is stored at the beginning of encrypted archive file (first 16 bytes)

## Encryption key generation

Encryption key is derived from passphrase and salt using Argon2d:

```typescript
const key = await argon2(passphrase, salt.toString("base64"))
```

### Implementation

```typescript
export default async (passphrase: string, salt: string): Promise<Buffer> => {
  const { stdout } = await spawn(
    `${binDir}/argon2`,
    [salt, "-d", "-p", "2", "-k", "65536", "-r", "-t", "10"],
    { input: passphrase }
  )
  return Buffer.from(stdout, "hex")
}
```

### Argon2d parameters

Argon2d is a memory-hard password hashing function designed to resist brute-force attacks including GPU and ASIC-based attacks.

**Algorithm**: Argon2d

**Parameters:**

- **Salt**: 128-bit salt
- **Variant**: Argon2d (`-d`)
- **Parallelism**: 2 threads (`-p 2`)
- **Memory**: 65536 KiB or 64 MB (`-k 65536`)
- **Output format**: Raw (`-r`)
- **Iterations**: 10 (`-t 10`)

**Output:**

- 256-bit encryption key

**Purpose:**

Memory-hard key derivation makes brute-force attacks computationally expensive by requiring significant memory resources per attempt, defending against specialized hardware attacks.

### Why Argon2d?

Argon2d provides data-dependent memory access maximizing memory hardness for GPU resistance. This variant is optimized for scenarios where side-channel attacks are not primary concern and maximum brute-force resistance is required.

## Nonce generation

Random nonce is generated for each encryption operation:

```typescript
const nonce = randomBytes(12)
```

### Security characteristics

- **Nonce strength**: 96-bit—recommended for AES-GCM
- **Randomness source**: Node.js `crypto.randomBytes`—generates cryptographically-secure pseudo-random bytes using `/dev/urandom`
- **Uniqueness**: Each archive has unique nonce ensuring encryption key never encrypts multiple archives using same nonce

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

- **Salt**: 16-byte random salt used for Argon2d key derivation
- **Nonce**: 12-byte random nonce for AES-256-GCM archive encryption
- **Encrypted data**: AES-256-GCM encrypted portable tar archive
- **Authentication tag**: 16-byte GCM authentication tag

This structure embeds all cryptographic metadata needed for decryption directly in archive file, eliminating the need for separate manifest files.

### Creation workflow

With app in create mode:

1. User drags and drops files and/or folders
2. User clicks create standalone archive button
3. User enters filename and passphrase
4. User clicks create button
5. User chooses where to save archive
6. App creates, encrypts and saves archive using `.superbacked` extension

### Restoration workflow

With app in create mode:

1. User drags and drops standalone archive
2. User enters passphrase
3. User clicks restore button
4. User chooses where to save archive content
5. App decrypts and saves archive content
