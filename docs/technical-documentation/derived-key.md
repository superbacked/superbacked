# Derived key technical documentation

## Abstract

This document specifies the cryptographic design and implementation of derived keys — the scheme behind [derived passwords](derived-password.md). A derived key is a deterministic 256-bit key derived from a memorized master passphrase, a label and a YubiKey HMAC-SHA1 challenge-response — two-factor key derivation with nothing stored anywhere. The source ([src/utilities/crypto/derivedKey.ts](../../src/utilities/crypto/derivedKey.ts) and [src/utilities/yubikey/otp.ts](../../src/utilities/yubikey/otp.ts)) is the ground truth for this document, and the reference vectors in [tests/derivedKey.test.ts](../../tests/derivedKey.test.ts) pin the scheme.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Derived keys extend the platform with stateless key derivation: instead of storing key material, consumers re-derive it on demand from two factors — a memorized master passphrase and the HMAC-SHA1 secret sealed inside a YubiKey slot. The same passphrase, label and YubiKey always produce the same key, on any machine, with no vault, sync or backup required. The label binds every derivation to its purpose — a memorized label per password — giving every label an independent key. Statelessness is what distinguishes this primitive from the [passphrase key](passphrase-key.md) scheme protecting standalone archives and blocks: those store a random salt, so their derivation binds it directly, while derived keys must derive their salts from the label.

The YubiKey is treated as an untrusted black box: it never receives the passphrase (only a pseudorandom challenge derived from it) and a malicious or compromised device can only remove the hardware-binding property — it can never weaken the output below the security of the passphrase-only derivation.

## Terminology

- **Challenge**: 256-bit value sent to the YubiKey, derived from the master key and label.
- **Derived key**: 256-bit key derived from the master key and response.
- **Label**: identifier a key is derived for, binding it to its purpose.
- **Master key**: 256-bit key derived from the master passphrase using Argon2d.
- **Master passphrase**: memorized passphrase used as the knowledge factor.
- **Response**: 160-bit HMAC-SHA1 output computed inside the YubiKey.
- **Slot**: YubiKey OTP application slot configured for HMAC-SHA1 challenge-response.

## Overview

When a consumer derives a key, the app:

1. Stretches the master passphrase into a 256-bit master key using Argon2d at the active [KDF profile](scheme-registry.md)
2. Computes a 256-bit challenge from the master key and label using HMAC-SHA256
3. Computes a 160-bit response on the YubiKey using HMAC-SHA1
4. Combines the master key and response into a 256-bit derived key using HKDF-SHA256

Every stage is a pure function — no randomness and no stored state — so derivation is deterministic. The scheme is frozen: changing any constant, cost parameter or construction silently changes every derived key — and with it every derived password.

## Master key derivation

The master passphrase is stretched into the master key using Argon2d and a deterministic label-bound salt:

```typescript
const masterKey = await computeMasterKey(masterPassphrase, label, paranoid)
```

### Implementation

```typescript
export const computeMasterKey = async (
  masterPassphrase: string,
  label: string,
  paranoid: boolean
): Promise<Buffer> => {
  const salt = createHash("sha256")
    .update(`superbacked-derived-key-salt-${label}`, "utf8")
    .digest()
    .subarray(0, 16)
    .toString("base64")
  return argon2(
    masterPassphrase,
    salt,
    paranoid === true ? paranoidKdfProfile : standardKdfProfile
  )
}
```

### Argon2d parameters

**Algorithm**: Argon2d, at the standard [KDF profile](scheme-registry.md) — or the paranoid profile under Paranoid mode

**Parameters:**

- **Salt**: First 16 bytes (base64-encoded) of SHA-256 of `superbacked-derived-key-salt-` followed by label
- **Variant**: Argon2d (`-d`)
- **Parallelism**: 4 lanes (`-p 4`)
- **Memory**: 64 MiB (`-k 65536`) — 1 GiB (`-k 1048576`) under Paranoid mode
- **Output format**: Raw (`-r`)
- **Passes**: 80 (`-t 80`) — 50 (`-t 50`) under Paranoid mode

**Output:**

- 256-bit master key

Scheme version 1 is permanently bound to these profile rows — derivation is stateless, so unlike stored artifacts no probe can ever discover a cost and the scheme version (surfaced at every derivation, selectable with `--derivation-version`) is part of what the user knows. Paranoid mode is likewise a determinism input: deriving without it silently produces different keys, which is why every derivation echoes it.

### Security characteristics

- **Memory hardness**: Each passphrase guess costs 64 MiB of memory traffic across 80 passes (a full gigabyte across 50 under Paranoid mode), defending against GPU and ASIC-based attacks in the one scenario where an offline attack exists (YubiKey slot secret compromise)
- **Deterministic salt**: The scheme is stateless, so the salt is derived rather than randomly generated and stored — binding it to the label prevents a precomputed dictionary from transferring across labels
- **Variant**: Argon2d is used everywhere in Superbacked — blocks, archives and derived keys share the variant and the [profile registry](scheme-registry.md) — maximizing offline brute-force resistance through fully data-dependent memory access. RFC 9106 recommends Argon2id as a general-purpose default to hedge cache side channels during legitimate derivation; Superbacked instead assumes a side-channel adversary on a derivation host is capable of direct capture, which no variant survives and optimizes for the attack that defines its threat model — offline brute force of leaked material

## Challenge computation

The challenge is computed from the master key and label using HMAC-SHA256:

```typescript
const challenge = computeChallenge(masterKey, label)
```

### Implementation

```typescript
export const computeChallenge = (masterKey: Buffer, label: string): Buffer => {
  return createHmac("sha256", masterKey)
    .update(`superbacked-derived-key-challenge-${label}`, "utf8")
    .digest()
}
```

### Security characteristics

- **Passphrase concealment**: YubiKey receives one 32-byte HMAC-SHA256 output per label — under the PRF assumption this value is computationally indistinguishable from random data and reveals nothing about the master key, so even a backdoored device logging every challenge collects only PRF images (inverting one to the passphrase requires a memory-hard dictionary attack through Argon2d)
- **Hardware gating**: The challenge is a secret function of the master passphrase, so an attacker cannot pose the right question to the YubiKey without already knowing the passphrase — given leaked derived material, each passphrase guess requires Argon2d plus a live round-trip through the physical YubiKey, capping brute-force throughput at USB challenge-response speed instead of GPU speed (no offline attack exists)
- **Domain separation**: Context strings share the `superbacked-derived-key-` prefix followed by a role segment (`salt-`, `challenge-`) — roles diverge at a fixed position so no label can make two contexts collide, and fixed 32-byte output keeps the challenge within the 64-byte HMAC-SHA1 challenge limit regardless of label length

## YubiKey challenge-response

The response is computed inside the YubiKey using HMAC-SHA1 keyed with the slot secret:

```typescript
const response = await calculateHmacSha1(slot, challenge, onTouchRequired)
```

### Slot configuration

The slot must be provisioned once for HMAC-SHA1 challenge-response:

```console
superbacked provision-yubikey --generate
```

Slot 1 ships from the factory configured for Yubico OTP — provisioning it for challenge-response overwrites that configuration permanently, which is why Superbacked defaults to slot 2, leaving the factory credential intact. Use `--slot 1` only if overwriting it is deliberate (and derive with `--slot 1`).

Computing a response requires physical touch by default — add `--no-touch` to compute responses without touch (weaker). Requires YubiKey firmware 2.2 or later. The generated secret is displayed once so a second YubiKey can be programmed with it, providing hardware redundancy — losing the only YubiKey loses every derived key. Slots provisioned with other tools (for example `ykman otp chalresp`) remain compatible.

### Protocol

Yubico does not document the wire protocol — the implementation mirrors the reference implementation in [yubikey-manager](https://github.com/Yubico/yubikey-manager) (`yubikit/core/otp.py` and `yubikit/yubiotp.py`):

- **Transport**: 8-byte HID feature reports (7 payload bytes and 1 status/sequence byte) on the OTP keyboard interface (vendor id `0x1050`, usage page `0x01`, usage `0x06`)
- **Request**: 70-byte frame — 64-byte challenge payload (padded with a byte differing from the final challenge byte), slot command (`0x30` for slot 1, `0x38` for slot 2), little-endian CRC-16/ISO-13239 of payload and 3 filler bytes — sent as 10 sequence-tagged packets, skipping all-zero packets except first and last
- **Response**: Polled from feature reports while the response pending flag is set, ending when the sequence wraps to 0 — 20-byte HMAC-SHA1 response validated against its trailing CRC (residual `0xf0b8`)
- **Touch**: Waiting-for-touch status flag surfaces a touch notice — the device enforces its own ~15 second touch timeout

### Security characteristics

- **Possession factor**: The 160-bit slot secret is written once and physically non-exportable thereafter — it never exists on any computer after slot configuration
- **HMAC-SHA1 strength**: SHA-1 collision attacks are irrelevant to HMAC — HMAC security rests on the pseudorandomness of the keyed compression function rather than collision resistance, and HMAC-SHA1 keyed with a 160-bit random secret remains unbroken
- **Additive trust model**: The response is only the HKDF salt while the master key independently enters HKDF as input keying material, so a fully malicious YubiKey returning rigged responses degrades derivation to exactly the passphrase-only scheme — it can remove the hardware-binding property but can never make output predictable to anyone who lacks the passphrase

## Key derivation

The master key and response are combined into the derived key using HKDF-SHA256:

```typescript
export const deriveKey = (masterKey: Buffer, salt: Buffer): Buffer => {
  return hkdf(
    masterKey,
    salt,
    Buffer.from("superbacked-derived-key", "utf8"),
    32
  )
}
```

**Parameters:**

- **Input keying material**: 256-bit master key
- **Salt**: 160-bit YubiKey response
- **Info**: `superbacked-derived-key` — the label is already bound through the master key salt and the challenge
- **Output**: 256-bit derived key

### Security characteristics

- **Factor combination**: HKDF-Extract is where the two factors cryptographically meet — the salt is unknowable without the hardware and the input keying material is unknowable without the passphrase
- **Label independence**: Under the PRF assumption, keys for different labels are computationally independent — material leaked from one label reveals nothing about any other
- **Fixed width**: The output is always 256 bits — consumers needing further key material derive purpose-bound subkeys from it (HKDF outputs of different lengths would share prefixes, not be independent)

## Why derivation requires a YubiKey

A hardware-less variant would be single factor: leaked derived material would become offline-attackable, with Argon2d as the only remaining wall — and for derived Bitcoin wallets the public blockchain itself would be the verification oracle, letting anyone grind passphrase and label guesses against on-chain activity without any leak at all. No such variant exists: every derivation mixes in the YubiKey response, and hardware redundancy (a second YubiKey programmed with the same slot secret, backed up in a block or blockset) is the recovery story.

## Security model

| Attacker holds                  | Best remaining attack                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Leaked derived material         | Passphrase guessing gated by physical YubiKey round-trip and Argon2d per guess — no offline attack |
| YubiKey (stolen)                | Nothing to query it with — challenges depend on the passphrase                                     |
| YubiKey and leaked material     | Passphrase guessing, still hardware-gated per guess                                                |
| Slot secret and leaked material | Offline passphrase guessing, memory-hard (Argon2d) with per-label dictionaries                     |
| Passphrase only                 | Nothing — HKDF salt is sealed in hardware                                                          |

**Limitations:**

- **No rotation**: Derivation is deterministic, so a compromised label re-derives identically forever — replacing derived material requires a new label
- **Loss of YubiKey**: Without a second YubiKey programmed with the same slot secret, every derived key is unrecoverable
- **No verifier**: No fingerprint or checksum of the passphrase is ever displayed or stored — any passphrase-only verifier would reintroduce the offline attack the keyed challenge eliminates, so a mistyped passphrase silently derives a different key

## Consumers

- **[Derived passwords](derived-password.md)**: the derived key (`computeDerivedKey`) is the input keying material for a rendering stream domain-separated by the `superbacked-derived-password` context — a rendered password reveals nothing about the key itself
- **[Derived Bitcoin wallets](derived-bitcoin-wallet.md)**: the same derived key expanded into BIP39 entropy under the `superbacked-derived-mnemonic-` context — a wallet and a password derived from the same label never share bytes

YubiKey-protected standalone archives and blocks do not consume this scheme — they store a salt, so they bind it from the first step through the [passphrase key](passphrase-key.md) scheme instead. Both schemes share slot provisioning and the wire protocol above.
