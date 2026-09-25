# Passphrase key technical documentation

## Abstract

This document specifies the cryptographic design and implementation of passphrase keys. A passphrase key is a 256-bit encryption key derived from a memorized passphrase and the random salt stored in a [block](block.md) or [standalone archive](standalone-archive.md) — a memory-hard Argon2d stretch, optionally mixed with a YubiKey HMAC-SHA1 challenge-response. The scheme also derives the probe key through which version 2 standalone archives declare their version. The source code ([src/utilities/crypto/passphraseKey.ts](../../src/utilities/crypto/passphraseKey.ts) and [src/utilities/yubikey/otp.ts](../../src/utilities/yubikey/otp.ts)) is the ground truth for this document, and the reference vectors in [tests/passphraseKey.test.ts](../../tests/passphraseKey.test.ts) pin the scheme.

## Introduction

Superbacked protects secrets too important to lose and too sensitive to share — critical credentials, signing keys and digital assets. Secrets are backed up — encrypted, offline, with succession planning built in — or never stored at all: derived on demand from a master passphrase and YubiKey.

Passphrase keys are the scheme blocks and standalone archives share to turn a memorized passphrase into an encryption key. Each artifact carries a random salt, and its key is re-derived at restoration from that salt and the memorized passphrase. Because the salt is stored, the scheme binds it from the very first step — unlike [derived keys](derived-key.md), whose statelessness forces label-derived salts. The salt entering at the stretch gives every block and standalone archive a unique key, a unique YubiKey challenge and a unique brute-force target.

The YubiKey second factor is optional and additive: the scheme treats the device as an untrusted black box that can add the hardware-binding property but never weaken the key below the single-factor derivation.

## Terminology

- **Challenge**: 256-bit value sent to the YubiKey, derived from the stretched key.
- **Consumer key**: 256-bit key a consumer encrypts with — the stretched key alone or, with a YubiKey, the stretched key mixed with the response under the consumer’s info.
- **Info**: fixed HKDF info string freezing a consumer’s key derivation (`kdf-key` for blocks, `archive-key` for archives).
- **KDF profile**: named, frozen Argon2d cost parameters (see [src/shared/kdfProfiles.ts](../../src/shared/kdfProfiles.ts)).
- **Passphrase**: memorized passphrase used as the knowledge factor.
- **Probe key**: 256-bit HKDF sibling of the consumer key, encrypting the scheme header of version 2 standalone archives.
- **Response**: 160-bit HMAC-SHA1 output computed inside the YubiKey.
- **Salt**: random value stored in every block and standalone archive, binding each derivation to it.
- **Slot**: YubiKey OTP application slot provisioned for HMAC-SHA1 challenge-response.
- **Stretched key**: 256-bit key derived from the passphrase and the salt using Argon2d.

## Overview

When a consumer derives a key, the app:

1. Stretches the passphrase and the salt into a 256-bit stretched key using Argon2d at the artifact’s [KDF profile](../../src/shared/kdfProfiles.ts) — without a YubiKey, this is the key
2. With a YubiKey, computes a 256-bit challenge from the stretched key using HMAC-SHA256
3. Computes a 160-bit response on the YubiKey using HMAC-SHA1
4. Mixes the stretched key and response into the 256-bit key using HKDF-SHA256 under the consumer’s info

At restoration the profile is discovered by trial (see the [architecture overview](README.md)). Each trial costs one stretch — and, with a YubiKey, one challenge-response. That one stretch expands into every key the trial checks: the probe and consumer keys of a standalone archive or a block’s two backup type domain keys, `block-key` and `blockset-key`.

The scheme is frozen: changing any constant or construction silently changes keys in the wild — the single-factor arm is the derivation of every passphrase-only block and standalone archive (version 1 artifacts included) and the two-factor arm that of every YubiKey-protected one.

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

The profile names the Argon2d cost — legacy for every version 1 artifact, standard for new artifacts and paranoid under Paranoid mode (see [src/shared/kdfProfiles.ts](../../src/shared/kdfProfiles.ts) for the frozen rows and rules).

### Security characteristics

- **Memory hardness**: Each passphrase guess costs the profile’s memory across its passes in memory-bound work (64 MiB × 80 at the standard profile), defending against GPU and ASIC-based attacks
- **Stored salt**: The random salt makes every derivation independent — a precomputed dictionary transfers to no other block or standalone archive, on either arm

## Challenge computation

The challenge is computed from the stretched key using HMAC-SHA256:

```typescript
const challengeContext = "superbacked-passphrase-key-challenge"

export const computeChallenge = (stretchedKey: Buffer): Buffer => {
  return createHmac("sha256", stretchedKey)
    .update(challengeContext, "utf8")
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
- **Consumer separation**: The frozen info domain-separates consumers — two-factor block and archive keys can never coincide even under identical inputs. Single-factor consumer keys are the raw stretched key; their separation comes from per-artifact random salts and the domain key blocks apply on top

## Probe key

Version 2 standalone archives declare their version through a probe (see [Version declaration](standalone-archive.md#version-declaration) in the standalone archive technical documentation), keyed by an HKDF sibling of the consumer key:

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

Only standalone archives consume the probe key — a block declares its version inside its encrypted payload, where the trial decryption that opens the secret already reads it (see the [block technical documentation](block.md#version-declaration)).

### Security characteristics

- **Domain separation**: The single-factor consumer key is the raw stretched key, so the probe always passes through HKDF under the consumer’s probe info — a probe key never coincides with a consumer key
- **Factor depth**: The two-factor probe mixes the YubiKey response, keeping the probe exactly as expensive as the payload it guards — a version check reachable without the hardware would be a passphrase-correctness oracle at single-factor cost, collapsing the second factor

## YubiKey challenge-response

Slot provisioning, hardware redundancy and the wire protocol are shared with [derived keys](derived-key.md#yubikey-challenge-response) — one provisioned slot secret backs YubiKey-protected blocks, YubiKey-protected archives and derived passwords alike.

## Security model

| Attacker holds                                                | Best remaining attack                                                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passphrase-only block or standalone archive                   | Offline passphrase guessing, memory-hard (Argon2d) with a dictionary per block or standalone archive                                                       |
| YubiKey-protected block or standalone archive                 | Passphrase guessing gated by physical YubiKey round-trip and Argon2d per guess — no offline attack                                                         |
| YubiKey (stolen)                                              | Nothing to query it with — challenges depend on the passphrase                                                                                             |
| YubiKey-protected block or standalone archive and YubiKey     | Passphrase guessing, still hardware-gated per guess                                                                                                        |
| YubiKey-protected block or standalone archive and slot secret | Offline passphrase guessing, memory-hard (Argon2d) with a dictionary per block or standalone archive — the additive floor: exactly the single-factor model |
| Passphrase alone                                              | Nothing to decrypt — and without the stored salt, not even the stretched key can be derived                                                                |

**Limitations:**

- **YubiKey mode not recorded**: No artifact records whether its key was hardware-bound — restoring requires enabling YubiKey mode again (the app switch or `--yubikey`), and a missing switch/flag or a YubiKey provisioned with a different secret fails exactly like a wrong passphrase, while an absent YubiKey or unprovisioned slot reports a specific YubiKey error. Version 2 artifacts do declare their version and, implicitly, their KDF profile — but only under encryption, discovered by trial (see the [architecture overview](README.md))
- **Loss of YubiKey**: Without a backup of the secret or a second YubiKey provisioned with it, every YubiKey-protected block and standalone archive is unrecoverable — the passphrase alone is not enough

## Consumers

- **[Blocks](block.md)**: `computeBlockKdfKey` freezes info `kdf-key` — the backup type’s HKDF domain key is applied on top either way, and the second factor is supported for single blocks only, never blocksets
- **[Standalone archives](standalone-archive.md)**: `computeArchiveKeys` freezes info `archive-key` for the encryption key and `version-probe` for the probe key — one stretch expanded into both, with or without the second factor

[Derived keys](derived-key.md) do not consume this scheme — stateless derivation stores no salt, so a label-derived salt takes its place from the first step. Both schemes share slot provisioning and the wire protocol (see [YubiKey challenge-response](#yubikey-challenge-response)).
