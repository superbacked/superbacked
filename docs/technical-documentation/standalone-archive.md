# Standalone archive technical documentation

## Abstract

This document specifies the cryptographic design and implementation of standalone archives. Standalone archives allow users to encrypt files and folders using passphrases without having to create blocks or blocksets — restoring standalone archives requires only the passphrase — or, for [YubiKey-protected](#yubikey-second-factor) archives, the passphrase and a YubiKey provisioned with the same challenge-response secret. Archives declare their version through an encrypted [probe block](../../src/utilities/crypto/schemeHeader.ts), keeping every byte indistinguishable from random data. The source code ([src/utilities/core/standaloneArchive.ts](../../src/utilities/core/standaloneArchive.ts) and [src/utilities/core/archive.ts](../../src/utilities/core/archive.ts)) is the ground truth for this document, and the reference vectors in [tests/standaloneArchive.test.ts](../../tests/standaloneArchive.test.ts) and [tests/referenceStandaloneArchives.test.ts](../../tests/referenceStandaloneArchives.test.ts) pin the scheme against the published reference archives. Archives created before version 2 restore through the [legacy standalone archive](legacy/standalone-archive.md) scheme.

## Introduction

Superbacked protects secrets too important to lose and too sensitive to share — critical credentials, signing keys and digital assets. Secrets are backed up — encrypted, offline, with succession planning built in — or never stored at all: derived on demand from a master passphrase and YubiKey.

Standalone archives extend Superbacked with passphrase-encrypted files and folders — single portable `.superbacked` files, created and restored anywhere Superbacked runs. Recovery requires only the passphrase — or the passphrase and YubiKey, for [YubiKey-protected](#yubikey-second-factor) archives — never a block.

Keys derive through the [passphrase key](passphrase-key.md) scheme shared with [blocks](block.md), at the active [KDF profile](../../src/shared/kdfProfiles.ts) — and every byte of the file is indistinguishable from random data.

Files that should stay bound to a block belong in a [detached archive](detached-archive.md) instead.

## Terminology

- **Passphrase**: user-provided passphrase used to derive the encryption key.
- **Standalone archive**: encrypted tar archive containing files and/or folders.

Block and blockset carry the same meaning as in the [block](block.md) and [blockset](blockset.md) technical documentation.

## Overview

When you create a standalone archive, the app:

1. Generates a cryptographically secure 128-bit salt
2. Derives a 256-bit encryption key and a 256-bit probe key from the passphrase and salt — one Argon2d stretch expanded into both keys (see [Key derivation](#key-derivation))
3. Encrypts the scheme header into the probe block
4. Generates a cryptographically secure 96-bit initialization vector
5. Creates, encrypts and saves the standalone archive using the `.superbacked` extension

## Encryption

A portable tar archive of the files and folders is encrypted using AES-256-GCM and a key derived from the passphrase (see [Key derivation](#key-derivation)). The construction provides the properties an archive relies on:

- **Authenticated encryption** — a wrong passphrase, a wrong YubiKey or a tampered archive fails to decrypt
- **Indistinguishability** — every byte of the file is ciphertext or random cryptographic metadata, indistinguishable from random data
- **Portability** — the tar container omits system-specific metadata and preserves file names, sizes and permissions, so archives restore across platforms

## Key derivation

Superbacked derives the encryption key and the probe key from the passphrase and a random 128-bit salt (see `generateSalt` in [src/utilities/crypto/primitives.ts](../../src/utilities/crypto/primitives.ts)): a memory-hard Argon2d stretch at the active [KDF profile](../../src/shared/kdfProfiles.ts), optionally mixed with a YubiKey HMAC-SHA1 challenge-response, expanded into both keys:

```typescript
export const computeStretchedKey = async (
  passphrase: string,
  salt: Buffer,
  profile: KdfProfile
): Promise<Buffer> => {
  return argon2(passphrase, salt.toString("base64"), profile)
}
```

Every key derivation in Superbacked — blocks, archives and [derived keys](derived-key.md) — uses Argon2d, at a profile named explicitly by each call site: legacy for every version 1 artifact, standard for new archives and paranoid under Paranoid mode. The profile table and its frozen-forever rules live in [src/shared/kdfProfiles.ts](../../src/shared/kdfProfiles.ts) and discovery is specified under [Version declaration](#version-declaration); the variant argument — why Argon2d over Argon2id — is specified with [derived keys](derived-key.md).

### Paranoid mode

An archive created under [Paranoid mode](../../src/shared/kdfProfiles.ts) derives its keys at the paranoid profile — and restoring it requires the mode enabled, reporting a wrong passphrase until it is switched on (a deliberate contract keeping wrong passphrases fast for everyone else).

### YubiKey second factor

When the YubiKey switch is enabled in the app’s create and restore modals (or `--yubikey` on the command-line interface), key derivation takes one extra step: the YubiKey answers a challenge derived from the stretched key and the response is mixed back in through HKDF-SHA256 — under the frozen info `archive-key` for the encryption key and `version-probe` for the probe key, both expanded from the same stretch and response (see the [passphrase key technical documentation](passphrase-key.md)). Without the switch, the stretched key is the encryption key itself — only the probe key passes through HKDF:

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

The scheme — stretching, challenge computation, response mixing, probe keys and the security model — is specified in the [passphrase key technical documentation](passphrase-key.md) and shared with [blocks](block.md). Archive specifics:

- **Probe at factor depth**: The probe key of a YubiKey-protected archive mixes the hardware response, so even the version check requires the YubiKey — no correctness oracle exists below the full two-factor cost
- **Restoration**: Requires enabling YubiKey mode again (the app switch or `--yubikey`) while holding a YubiKey provisioned with the same secret — a missing switch/flag or a YubiKey provisioned with a different secret fails exactly like a wrong passphrase, while an absent YubiKey or unprovisioned slot reports a specific YubiKey error — the archive itself cannot announce the mode
- **Strength gate**: The passphrase strength requirement applies to the memorized passphrase — the second factor strengthens it rather than replacing it

## Structure

Standalone archives use a binary format with embedded cryptographic metadata.

### File format

Standalone archive files use the following binary structure:

```text
[salt (16 bytes)][probe block (36 bytes)][iv (12 bytes)][encrypted data][tag (16 bytes)]
```

**Components:**

- **Salt**: 16-byte random salt used for Argon2d key derivation
- **Probe block**: encrypted [scheme header](../../src/utilities/crypto/schemeHeader.ts) — a 12-byte initialization vector, the 8-byte header (encrypted using AES-256-GCM and the probe key) and a 16-byte authentication tag
- **Initialization vector**: 12-byte random initialization vector for AES-256-GCM standalone archive encryption — unique per archive, so the encryption key never encrypts two archives using the same initialization vector (see `generateIv` in [src/utilities/core/archive.ts](../../src/utilities/core/archive.ts))
- **Encrypted data**: AES-256-GCM-encrypted portable tar archive
- **Authentication tag**: 16-byte GCM authentication tag

Version 1 archives are identical without the probe block and restore through their own scheme (see the [legacy standalone archive technical documentation](legacy/standalone-archive.md)). Both structures embed all the cryptographic metadata needed for decryption directly in the standalone archive file, every byte indistinguishable from random data — the version is declared only to the passphrase holder.

### Version declaration

Restoration discovers the version and KDF profile by trial, newest profile first (see `decodeProbeBlock` in [src/utilities/crypto/schemeHeader.ts](../../src/utilities/crypto/schemeHeader.ts)):

1. Each trial is one Argon2d stretch (and, with a YubiKey, one challenge-response) expanded into the probe and encryption keys
2. A probe revealing the header restores at the declared version — an unsupported version reports that the archive requires a newer version of Superbacked, never a wrong passphrase
3. No probe match means the headerless version 1 format, restored through the [legacy scheme](legacy/standalone-archive.md) with the legacy trial’s key — already in hand, so version 1 restoration costs no extra stretch
4. Failing that, the passphrase is wrong or the archive corrupted — cryptographically indistinguishable outcomes

## Creation workflow

With the app in create mode:

1. Drag and drop files and/or folders.
2. Click “Create standalone archive…”.
3. Enter a filename and passphrase — and optionally enable “[Protect with YubiKey](#yubikey-second-factor)”.
4. Click “Create”.
5. Choose where to save the standalone archive.
6. The app creates, encrypts and saves the standalone archive using the `.superbacked` extension.

## Restoration workflow

With the app in create mode — standalone archives are created and restored from the same screen:

1. Drag and drop the standalone archive.
2. Enter the passphrase — enabling “Protected with YubiKey” for [YubiKey-protected](#yubikey-second-factor) archives.
3. Click “Restore”.
4. Choose where to save the standalone archive content.
5. The app decrypts and saves the standalone archive content.
