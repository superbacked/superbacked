# Standalone archive technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the standalone archive feature in Superbacked. Standalone archives allow users to encrypt files and folders using passphrases without having to create blocks or blocksets — restoring standalone archives requires only the passphrase, or, for archives created with the optional [YubiKey second factor](#yubikey-second-factor), the passphrase and a YubiKey provisioned with the same challenge-response secret. Version 2 archives declare their version through an encrypted [probe block](scheme-registry-technical-documentation.md), keeping every byte indistinguishable from random data. The source ([src/utilities/core/standaloneArchive.ts](../src/utilities/core/standaloneArchive.ts) and [src/utilities/core/archive.ts](../src/utilities/core/archive.ts)) is the ground truth for this document, and the reference vectors in [tests/standaloneArchive.test.ts](../tests/standaloneArchive.test.ts) and [tests/referenceStandaloneArchives.test.ts](../tests/referenceStandaloneArchives.test.ts) pin the scheme against the published reference archives.

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
2. Derives a 256-bit encryption key and a 256-bit probe key from the passphrase and salt — one Argon2d stretch at the active [KDF profile](scheme-registry-technical-documentation.md), expanded through HKDF-SHA256
3. Encrypts the scheme header into the probe block
4. Generates a cryptographically secure 96-bit initialization vector
5. Creates, encrypts and saves the standalone archive using the `.superbacked` extension

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

The encryption key is derived from the passphrase and salt using Argon2d at a named [KDF profile](scheme-registry-technical-documentation.md):

```typescript
const key = await argon2(passphrase, salt.toString("base64"), profile)
```

### Implementation

```typescript
export default async (
  passphrase: string,
  salt: string,
  profile: KdfProfile
): Promise<Buffer> => {
  const { stdout } = await spawn(
    `${binDir}/argon2`,
    [
      salt,
      "-d",
      "-p",
      String(profile.parallelism),
      "-k",
      String(profile.memoryKiB),
      "-r",
      "-t",
      String(profile.passes),
    ],
    { input: passphrase }
  )
  return Buffer.from(stdout, "hex")
}
```

Every key derivation in Superbacked — blocks, archives and [derived keys](derived-key-technical-documentation.md) — uses Argon2d, at a profile named explicitly by each call site: legacy for every version 1 artifact, v2 standard for new archives and v2 paranoid under Paranoid mode. The profile table, its frozen-forever rules and how restoration discovers the profile live in the [scheme registry technical documentation](scheme-registry-technical-documentation.md).

### Why Argon2d?

Argon2d is a memory-hard password hashing function designed to resist brute-force attacks, including GPU and ASIC-based attacks. Argon2d provides data-dependent memory access, maximizing memory hardness for GPU resistance. This variant is optimized for scenarios where side-channel attacks are not a primary concern and maximum brute-force resistance is required.

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

Version 2 standalone archive files use the following binary structure:

```text
[salt (16 bytes)][probe block (36 bytes)][iv (12 bytes)][encrypted data][tag (16 bytes)]
```

**Components:**

- **Salt**: 16-byte random salt used for Argon2d key derivation
- **Probe block**: encrypted [scheme header](scheme-registry-technical-documentation.md) — a 12-byte initialization vector, the 8-byte header encrypted with AES-256-GCM under the probe key and a 16-byte authentication tag
- **Initialization vector**: 12-byte random initialization vector for AES-256-GCM standalone archive encryption
- **Encrypted data**: AES-256-GCM-encrypted portable tar archive
- **Authentication tag**: 16-byte GCM authentication tag

Version 1 archives are identical without the probe block (`[salt][iv][encrypted data][tag]`). Both structures embed all the cryptographic metadata needed for decryption directly in the standalone archive file, every byte indistinguishable from random data — the version is declared only to the passphrase holder.

### Version discovery

Restoration discovers the version and KDF profile by trial, newest profile first (see the [scheme registry technical documentation](scheme-registry-technical-documentation.md)):

1. Each trial is one Argon2d stretch (and, with a YubiKey, one touch) expanded into the probe and encryption keys
2. A probe revealing the header restores at the declared version — an unsupported version reports that the archive requires a newer release of Superbacked, never a wrong passphrase
3. No probe match means the headerless version 1 format, restored with the legacy trial’s key — already in hand, so version 1 restoration costs no extra stretch
4. Failing that, the passphrase is wrong or the archive corrupted — cryptographically indistinguishable outcomes

The paranoid profile is trialed only while Paranoid mode is enabled — a paranoid archive restored without the mode reports a wrong passphrase until it is switched on, a deliberate contract keeping wrong passphrases fast for everyone else.

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

## YubiKey second factor

With `--yubikey` on the command-line interface (or the YubiKey switch in the app’s create and restore modals), the stretched key becomes the input keying material of a [passphrase key](passphrase-key-technical-documentation.md) derivation instead of the encryption key itself: the YubiKey answers a challenge derived from the stretched key and the response is mixed back in through HKDF-SHA256 — under the frozen info `encryption-key-v1` for the encryption key and `version-probe-v1` for the probe key, both expanded from the same stretch and touch:

```typescript
export const computeArchiveKeys = async (
  passphrase: string,
  salt: Buffer,
  profile: KdfProfile,
  yubikey?: ChallengeResponseOptions
): Promise<ArchiveKeys> => {
  const stretchedKey = await computeStretchedKey(passphrase, salt, profile)
  if (yubikey === undefined) {
    return {
      key: stretchedKey,
      probeKey: computeProbeKey(stretchedKey, probeKeyInfo),
    }
  }
  const response = await calculateHmacSha1(
    yubikey.slot,
    computeChallenge(stretchedKey),
    yubikey.onTouchRequired
  )
  return {
    key: computeResponseBoundKey(stretchedKey, response, passphraseKeyInfo),
    probeKey: computeProbeKey(stretchedKey, probeKeyInfo, response),
  }
}
```

The scheme — stretching, challenge computation, response mixing, probe keys and the security model — is specified in the [passphrase key technical documentation](passphrase-key-technical-documentation.md) and shared with [blocks](block-technical-documentation.md). Archive specifics:

- **Probe at factor depth**: The probe key of a YubiKey-protected archive mixes the hardware response, so even the version check requires the YubiKey — no correctness oracle exists below the full two-factor cost
- **Restoration**: Requires enabling YubiKey mode again (`--yubikey` or the app switch) while holding a YubiKey provisioned with the same slot secret — a missing flag, wrong slot or wrong hardware fails exactly like a wrong passphrase — the archive itself cannot announce the mode
- **Strength gate**: The passphrase strength requirement applies to the memorized passphrase — the second factor strengthens it rather than replacing it
