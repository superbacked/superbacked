# Standalone archive technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the standalone archive feature in Superbacked. Standalone archives allow users to encrypt files and folders using passphrases without having to create blocks or blocksets — restoring standalone archives requires only passphrases, providing single-factor authentication. The source ([src/utilities/standaloneArchive.ts](../src/utilities/standaloneArchive.ts) and [src/utilities/archiveCore.ts](../src/utilities/archiveCore.ts)) is the ground truth for this document.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Standalone archives extend the platform with passphrase-encrypted files and folders.

Superbacked supports two backup types: block and blockset — the latter embeds additional Shamir Secret Sharing key material alongside user-provided secrets to enable threshold-based recovery, and comes in three subtypes (2-of-3, 3-of-5 and 4-of-7).

While using QR code encoding allows users to print blocks on archival paper, a format ideal for cold storage, larger datasets cannot be efficiently encoded this way and some use-cases may not require these properties.

Standalone archives provide a simple alternative when users need to encrypt files and folders using passphrases.

## Terminology

- **Block**: an encrypted QR code printed on archival paper or saved as a JPG or PDF file.
- **Blockset**: a set of cryptographically bound blocks.
- **Passphrase**: user-provided passphrase used to derive the encryption key.
- **Standalone archive**: encrypted tar archive containing files and/or folders.

## Overview

When you create a standalone archive, the app:

1. Generates a cryptographically secure 128-bit salt
2. Derives a 256-bit encryption key from the passphrase and salt
3. Generates a cryptographically secure 96-bit initialization vector
4. Creates, encrypts and saves the standalone archive using the `.superbacked` extension

## Salt generation

A random salt is generated for each standalone archive:

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

- **Salt strength**: 128-bit — provides strong security against rainbow table attacks
- **Randomness source**: Node.js `crypto.randomBytes` — cryptographically secure random bytes from the operating system’s CSPRNG
- **Storage**: The salt is stored at the beginning of the encrypted standalone archive file (first 16 bytes)

## Encryption key generation

The encryption key is derived from the passphrase and salt using Argon2d:

```typescript
const key = await argon2(passphrase, salt.toString("base64"))
```

### Implementation

```typescript
export default async (
  passphrase: string,
  salt: string,
  mode: "d" | "id" = "d"
): Promise<Buffer> => {
  const { stdout } = await spawn(
    `${binDir}/argon2`,
    [salt, `-${mode}`, "-p", "2", "-k", "65536", "-r", "-t", "10"],
    { input: passphrase }
  )
  return Buffer.from(stdout, "hex")
}
```

The `mode` parameter defaults to Argon2d, which standalone archives use; derived passwords use Argon2id (see the [derived password technical documentation](derived-password-technical-documentation.md)).

### Argon2d parameters

Argon2d is a memory-hard password hashing function designed to resist brute-force attacks, including GPU and ASIC-based attacks.

**Algorithm**: Argon2d

**Parameters:**

- **Salt**: 128-bit salt
- **Variant**: Argon2d (`-d`)
- **Parallelism**: 2 threads (`-p 2`)
- **Memory**: 65,536 KiB or 64 MiB (`-k 65536`)
- **Output format**: Raw (`-r`)
- **Iterations**: 10 (`-t 10`)

**Output:**

- 256-bit encryption key

**Purpose:**

Memory-hard key derivation makes brute-force attacks computationally expensive by requiring significant memory resources per attempt, defending against specialized hardware attacks.

### Why Argon2d?

Argon2d provides data-dependent memory access, maximizing memory hardness for GPU resistance. This variant is optimized for scenarios where side-channel attacks are not a primary concern and maximum brute-force resistance is required.

## Initialization vector generation

A random initialization vector is generated for each encryption operation:

```typescript
const iv = generateIv()
```

### Security characteristics

- **Initialization vector strength**: 96-bit — recommended for AES-GCM
- **Randomness source**: Node.js `crypto.randomBytes` — cryptographically secure random bytes from the operating system’s CSPRNG
- **Uniqueness**: Each standalone archive has a unique initialization vector, ensuring the encryption key never encrypts multiple standalone archives using the same initialization vector

## Standalone archive format

Standalone archives use the portable tar format as the container for files and folders.

- **Container**: Portable tar archive format
- **Portability**: Omits system-specific metadata for cross-platform compatibility
- **File metadata**: Preserves file names, sizes and permissions

## Standalone archive encryption

Standalone archives use AES-256-GCM authenticated encryption, providing confidentiality and integrity.

**Security characteristics:**

- **Algorithm**: AES-256-GCM authenticated encryption
- **Confidentiality**: The AES-256 block cipher encrypts the standalone archive content
- **Integrity**: Galois/Counter Mode (GCM) provides an authentication tag to detect tampering

## Standalone archive structure

Standalone archives use a binary format with embedded cryptographic metadata.

### File format

Standalone archive files use the following binary structure:

```text
[salt (16 bytes)][iv (12 bytes)][encrypted data][tag (16 bytes)]
```

**Components:**

- **Salt**: 16-byte random salt used for Argon2d key derivation
- **Initialization vector**: 12-byte random initialization vector for AES-256-GCM standalone archive encryption
- **Encrypted data**: AES-256-GCM-encrypted portable tar archive
- **Authentication tag**: 16-byte GCM authentication tag

This structure embeds all the cryptographic metadata needed for decryption directly in the standalone archive file, eliminating the need for separate manifest files.

### Creation workflow

With the app in create mode:

1. Drag and drop files and/or folders.
2. Click the create standalone archive button.
3. Enter a filename and passphrase.
4. Click the create button.
5. Choose where to save the standalone archive.
6. The app creates, encrypts and saves the standalone archive using the `.superbacked` extension.

### Restoration workflow

With the app in create mode — standalone archives are created and restored from the same screen:

1. Drag and drop the standalone archive.
2. Enter the passphrase.
3. Click the restore button.
4. Choose where to save the standalone archive content.
5. The app decrypts and saves the standalone archive content.
