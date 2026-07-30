# Passphrase key technical documentation

## Abstract

This document specifies passphrase key derivation — the scheme [standalone archives](standalone-archive.md) and [blocks](block.md) share to turn a memorized passphrase and a stored salt into a 256-bit key: the passphrase stretched with Argon2d at a [KDF profile](scheme-registry.md) alone, or, when the optional YubiKey second factor is requested, mixed with a YubiKey HMAC-SHA1 challenge-response. The scheme also derives the probe key through which version 2 artifacts declare their version. The source ([src/utilities/crypto/passphraseKey.ts](../../src/utilities/crypto/passphraseKey.ts) and [src/utilities/yubikey/otp.ts](../../src/utilities/yubikey/otp.ts)) is the ground truth for this document, and the reference vectors in [tests/passphraseKey.test.ts](../../tests/passphraseKey.test.ts) pin the scheme.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Every block and standalone archive carries a random salt, and its key is re-derived at restoration from that salt and the memorized passphrase. Because the salt is stored, the scheme binds it from the very first step — unlike [derived keys](derived-key.md), whose statelessness forces label-derived salts. The salt entering at the stretch gives every block and standalone archive a unique key, a unique YubiKey challenge and a unique brute-force target.

The YubiKey is treated as an untrusted black box: it never receives the passphrase (only a pseudorandom challenge derived from it) and a malicious or compromised device can only remove the hardware-binding property — it can never weaken the key below the security of the single-factor derivation.

## Terminology

- **Challenge**: 256-bit value sent to the YubiKey, derived from the stretched key.
- **Info**: fixed HKDF info string freezing a consumer’s key derivation (`archive-key` for archives, `kdf-key` for blocks).
- **KDF profile**: named, frozen Argon2d cost parameters (see the [scheme registry technical documentation](scheme-registry.md)).
- **Passphrase**: memorized passphrase used as the knowledge factor.
- **Probe key**: 256-bit HKDF sibling of the consumer key, encrypting the scheme header of version 2 artifacts.
- **Response**: 160-bit HMAC-SHA1 output computed inside the YubiKey.
- **Salt**: random value stored in every block and standalone archive, binding each derivation to it.
- **Stretched key**: 256-bit key derived from the passphrase and the salt using Argon2d.

## Overview

When a consumer derives a key, the app:

1. Stretches the passphrase and the salt into a 256-bit stretched key using Argon2d at the artifact’s [KDF profile](scheme-registry.md) — without a YubiKey, this is the key
2. Computes a 256-bit challenge from the stretched key using HMAC-SHA256
3. Computes a 160-bit response on the YubiKey using HMAC-SHA1
4. Mixes the stretched key and response into the 256-bit key using HKDF-SHA256 under the consumer’s info

At restoration the profile is discovered by trial (see the [scheme registry technical documentation](scheme-registry.md)) — one stretch (and, with a YubiKey, one touch) per candidate profile, expanded into both the probe key and the consumer key.

The scheme is frozen: the single-factor arm at the legacy profile is the derivation every version 1 block and standalone archive in the wild already uses, and changing any constant or construction silently changes the key of every YubiKey-protected block and standalone archive.

## Stretching

The passphrase is stretched over the salt using Argon2d:

```typescript
export const computeStretchedKey = async (
  passphrase: string,
  salt: Buffer,
  profile: KdfProfile
): Promise<Buffer> => {
  return argon2(passphrase, salt.toString("base64"), profile)
}
```

The profile names the Argon2d cost — legacy for every version 1 artifact, standard for new artifacts and paranoid under Paranoid mode (see the [scheme registry technical documentation](scheme-registry.md) for the parameter table and rules).

### Security characteristics

- **Memory hardness**: Each passphrase guess costs the profile’s memory across its passes in memory-bound work (64 MiB × 80 at the standard profile), defending against GPU and ASIC-based attacks
- **Stored salt**: The random salt makes every derivation independent — a precomputed dictionary transfers to no other block or standalone archive, on either arm

## Challenge computation

The challenge is computed from the stretched key using HMAC-SHA256:

```typescript
export const computeChallenge = (stretchedKey: Buffer): Buffer => {
  return createHmac("sha256", stretchedKey)
    .update("superbacked-passphrase-key-challenge", "utf8")
    .digest()
}
```

### Security characteristics

- **Passphrase concealment**: The YubiKey receives one HMAC-SHA256 output per block or standalone archive — under the PRF assumption this value is computationally indistinguishable from random data, so even a backdoored device logging every challenge collects only PRF images
- **Hardware gating**: The challenge is a secret function of the passphrase, so an attacker holding the block or standalone archive cannot pose the right question to the YubiKey without already knowing the passphrase — each guess requires Argon2d plus a live round-trip through the physical hardware (no offline attack exists)
- **Unique challenges**: The salt is already stretched into the key, so every block and standalone archive asks a different question — a captured response is useful against that one block or standalone archive only, and the context string can stay fixed

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

## Probe key

Version 2 artifacts declare their version through a probe (see the [scheme registry technical documentation](scheme-registry.md)), keyed by an HKDF sibling of the consumer key:

```typescript
export const computeProbeKey = (
  stretchedKey: Buffer,
  info: string,
  response?: Buffer
): Buffer => {
  return hkdf(
    stretchedKey,
    response ?? Buffer.alloc(0),
    Buffer.from(info, "utf8"),
    32
  )
}
```

### Security characteristics

- **Domain separation**: The single-factor consumer key is the raw stretched key, so the probe always passes through HKDF under the consumer’s probe info — a probe key never coincides with a consumer key
- **Factor depth**: The two-factor probe mixes the YubiKey response, keeping the probe exactly as expensive as the payload it guards — a version check reachable without the hardware would be a passphrase-correctness oracle at single-factor cost, collapsing the second factor

## YubiKey challenge-response

Slot provisioning, hardware redundancy and the wire protocol are shared with [derived keys](derived-key.md#yubikey-challenge-response) — one provisioned slot secret backs derived passwords, YubiKey-protected archives and YubiKey-protected blocks alike.

## Security model

| Attacker holds                              | Best remaining attack                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Block or standalone archive                 | Passphrase guessing gated by physical YubiKey round-trip and Argon2d per guess — no offline attack   |
| YubiKey (stolen)                            | Nothing to query it with — challenges depend on the passphrase                                       |
| Block or standalone archive and YubiKey     | Passphrase guessing, still hardware-gated per guess                                                  |
| Block or standalone archive and slot secret | Offline passphrase guessing, memory-hard (Argon2d) with a dictionary per block or standalone archive |
| Passphrase only                             | Nothing to decrypt — and without the stored salt, not even the stretched key can be derived          |

**Limitations:**

- **YubiKey mode not recorded**: No artifact records whether its key was hardware-bound — restoring requires enabling YubiKey mode again (`--yubikey` or the app switch), and a missing switch, wrong slot or wrong hardware fails exactly like a wrong passphrase. Version 2 artifacts do declare their version and, implicitly, their KDF profile — but only under encryption, discovered by trial (see the [scheme registry technical documentation](scheme-registry.md))
- **Loss of YubiKey**: Without a second YubiKey programmed with the same slot secret, every YubiKey-protected block and standalone archive is unrecoverable — the passphrase alone is not enough

## Consumers

- **[Standalone archives](standalone-archive.md)**: `computeArchiveKeys` freezes info `archive-key` for the encryption key and `version-probe` for the probe key — one stretch expanded into both (`--yubikey` or the app switch)
- **[Blocks](block.md)**: `computeBlockKdfKey` freezes info `kdf-key` — the backup type’s HKDF domain key is applied on top, and the second factor is offered for standard blocks only, never blocksets
