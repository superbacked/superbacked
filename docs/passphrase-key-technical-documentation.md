# Passphrase key technical documentation

## Abstract

This document specifies passphrase key derivation — the scheme [standalone archives](standalone-archive-technical-documentation.md) and [blocks](block-technical-documentation.md) share to turn a memorized passphrase and a per-artifact salt into a 256-bit key: the passphrase stretched with Argon2d alone, or, when the optional YubiKey second factor is requested, mixed with a YubiKey HMAC-SHA1 challenge-response. The source ([src/utilities/passphraseKey.ts](../src/utilities/passphraseKey.ts) and [src/utilities/yubikey.ts](../src/utilities/yubikey.ts)) is the ground truth for this document, and the reference vectors in [tests/passphraseKey.test.ts](../tests/passphraseKey.test.ts) pin the scheme.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Blocks and standalone archives are encrypted artifacts: each carries a random salt, and its key is re-derived at restoration from that salt and the memorized passphrase. Because the salt is stored in the artifact, the scheme binds it from the very first step — unlike [derived keys](derived-key-technical-documentation.md), whose statelessness forces label-derived salts. The salt entering at the stretch gives every artifact a unique key, a unique YubiKey challenge and a unique brute-force target.

The YubiKey is treated as an untrusted black box: it never receives the passphrase (only a pseudorandom challenge derived from it) and a malicious or compromised device can only remove the hardware-binding property — it can never weaken the key below the security of the single-factor derivation.

## Terminology

- **Artifact**: a standalone archive or a block — an encrypted object carrying its own random salt.
- **Challenge**: 256-bit value sent to the YubiKey, derived from the stretched key.
- **Info**: fixed HKDF info string freezing a consumer’s key derivation (`encryption-key-v1` for archives, `kdf-key-v1` for blocks).
- **Passphrase**: memorized passphrase used as the knowledge factor.
- **Response**: 160-bit HMAC-SHA1 output computed inside the YubiKey.
- **Stretched key**: 256-bit key derived from the passphrase and the artifact salt using Argon2d.

## Overview

When a consumer derives a key, the app:

1. Stretches the passphrase and the artifact salt into a 256-bit stretched key using Argon2d — without a YubiKey, this is the key
2. Computes a 256-bit challenge from the stretched key using HMAC-SHA256
3. Computes a 160-bit response on the YubiKey using HMAC-SHA1
4. Mixes the stretched key and response into the 256-bit key using HKDF-SHA256 under the consumer’s info

The scheme is frozen: the single-factor arm is the derivation every artifact in the wild already uses, and changing any constant or construction silently changes the key of every YubiKey-protected artifact.

## Stretching

The passphrase is stretched over the artifact salt using Argon2d:

```typescript
export const computeStretchedKey = async (
  passphrase: string,
  salt: Buffer
): Promise<Buffer> => {
  return argon2(passphrase, salt.toString("base64"))
}
```

The parameters (Argon2d, 2 threads, 64 MiB, 10 iterations) are shared with every key derivation in Superbacked — see the [standalone archive technical documentation](standalone-archive-technical-documentation.md) for the full parameter table.

### Security characteristics

- **Memory hardness**: Each passphrase guess costs 64 MiB of memory-bound work, defending against GPU and ASIC-based attacks
- **Per-artifact salt**: The random artifact salt makes every derivation independent — a precomputed dictionary transfers to no other artifact, on either arm

## Challenge computation

The challenge is computed from the stretched key using HMAC-SHA256:

```typescript
export const computeChallenge = (stretchedKey: Buffer): Buffer => {
  return createHmac("sha256", stretchedKey)
    .update("superbacked-passphrase-key-v1-challenge", "utf8")
    .digest()
}
```

### Security characteristics

- **Passphrase concealment**: The YubiKey receives one HMAC-SHA256 output per artifact — under the PRF assumption this value is computationally indistinguishable from random data, so even a backdoored device logging every challenge collects only PRF images
- **Hardware gating**: The challenge is a secret function of the passphrase, so an attacker holding the artifact cannot pose the right question to the YubiKey without already knowing the passphrase — each guess requires Argon2d plus a live round-trip through the physical hardware (no offline attack exists)
- **Per-artifact challenges**: The artifact salt is already stretched into the key, so every artifact asks a different question — a captured response is useful against that one artifact only, and the context string can stay fixed

## Response mixing

The stretched key and response are mixed into the consumer key using HKDF-SHA256:

```typescript
export const computeResponseBoundKey = (
  stretchedKey: Buffer,
  response: Buffer,
  info: string
): Buffer => {
  return hkdf(stretchedKey, response, Buffer.from(info, "utf8"), 32)
}
```

### Security characteristics

- **Factor combination**: HKDF-Extract is where the two factors meet — the salt is unknowable without the hardware and the input keying material is unknowable without the passphrase
- **Additive trust model**: The response is only the HKDF salt while the stretched key independently enters as input keying material, so a fully malicious YubiKey returning rigged responses degrades derivation to exactly the single-factor scheme — it can remove the hardware-binding property but can never make the key predictable to anyone who lacks the passphrase
- **Consumer separation**: The frozen info domain-separates consumers — an archive key and a block key can never coincide even under identical inputs

## YubiKey challenge-response

Slot provisioning, hardware redundancy and the wire protocol are shared with [derived keys](derived-key-technical-documentation.md#yubikey-challenge-response) — one provisioned slot secret backs derived passwords, YubiKey-protected archives and YubiKey-protected blocks alike.

## Security model

| Attacker holds           | Best remaining attack                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| Artifact                 | Passphrase guessing gated by physical YubiKey round-trip and Argon2d per guess — no offline attack |
| YubiKey (stolen)         | Nothing to query it with — challenges depend on the passphrase                                     |
| Artifact and YubiKey     | Passphrase guessing, still hardware-gated per guess                                                |
| Artifact and slot secret | Offline passphrase guessing, memory-hard (Argon2d) with a per-artifact dictionary                  |
| Passphrase only          | Nothing to decrypt — and without the artifact salt, not even the stretched key can be derived      |

**Limitations:**

- **Mode not recorded**: The artifact formats are unchanged and record nothing about how their key was derived — restoring requires enabling YubiKey mode again (`--yubikey` or the app switch), and a missing switch, wrong slot or wrong hardware fails exactly like a wrong passphrase
- **Loss of YubiKey**: Without a second YubiKey programmed with the same slot secret, every YubiKey-protected artifact is unrecoverable — the passphrase alone is not enough

## Consumers

- **[Standalone archives](standalone-archive-technical-documentation.md)**: `computeArchiveKey` freezes info `encryption-key-v1` — the key encrypts the archive (`--yubikey` or the app switch)
- **[Blocks](block-technical-documentation.md)**: `computeBlockKdfKey` freezes info `kdf-key-v1` — the backup type’s HKDF domain key is applied on top, and the second factor is offered for standard blocks only, never blocksets
