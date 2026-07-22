# Derived password technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the derived password feature in Superbacked. Derived passwords are deterministic, high-entropy, per-label passwords derived from a memorized master passphrase and a YubiKey HMAC-SHA1 challenge-response — two-factor password derivation with nothing stored anywhere. The source ([src/utilities/derivedPassword.ts](../src/utilities/derivedPassword.ts) and [src/utilities/yubikey.ts](../src/utilities/yubikey.ts)) is the ground truth for this document, and the reference vectors in [tests/derivedPassword.test.ts](../tests/derivedPassword.test.ts) pin the scheme.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Derived passwords extend the platform with stateless password derivation: instead of storing passwords, users re-derive them on demand from two factors — a memorized master passphrase and the HMAC-SHA1 secret sealed inside a YubiKey slot. The same passphrase, label and YubiKey always produce the same password, on any machine, with no vault, sync or backup required.

The YubiKey is treated as an untrusted black box: it never receives the passphrase (only a pseudorandom challenge derived from it) and a malicious or compromised device can only remove the hardware-binding property — it can never weaken the output below the security of the passphrase-only derivation.

## Terminology

- **Challenge**: 256-bit value sent to the YubiKey, derived from the master key and label.
- **Character class**: one of lowercase, uppercase, digits and special characters.
- **Label**: memorized identifier a password is derived for (for example `github` or `proton`).
- **Master key**: 256-bit key derived from the master passphrase using Argon2id.
- **Master passphrase**: memorized passphrase used as the knowledge factor.
- **Response**: 160-bit HMAC-SHA1 output computed inside the YubiKey.
- **Slot**: YubiKey OTP application slot configured for HMAC-SHA1 challenge-response.

## Overview

When you derive a password, the app:

1. Stretches the master passphrase into a 256-bit master key using Argon2id
2. Computes a 256-bit challenge from the master key and label using HMAC-SHA256
3. Computes a 160-bit response on the YubiKey using HMAC-SHA1
4. Expands the master key and response into a deterministic byte stream using HKDF-SHA256
5. Renders the byte stream into a password using rejection sampling

Every stage is a pure function — no randomness and no stored state — so derivation is deterministic. The scheme is frozen: changing any constant, cost parameter or construction silently changes every derived password.

## Master key derivation

The master passphrase is stretched into the master key using Argon2id and a deterministic label-bound salt:

```typescript
const masterKey = await computeMasterKey(masterPassphrase, label)
```

### Implementation

```typescript
export const computeMasterKey = async (
  masterPassphrase: string,
  label: string
): Promise<Buffer> => {
  const salt = createHash("sha256")
    .update(`superbacked-derived-password-salt-${label}`, "utf8")
    .digest("hex")
    .substring(0, 32)
  return argon2(masterPassphrase, salt, "id")
}
```

### Argon2id parameters

**Algorithm**: Argon2id

**Parameters:**

- **Salt**: First 16 bytes (hex-encoded) of SHA-256 of `superbacked-derived-password-salt-` followed by label
- **Variant**: Argon2id (`-id`)
- **Parallelism**: 2 threads (`-p 2`)
- **Memory**: 65,536 KiB or 64 MiB (`-k 65536`)
- **Output format**: Raw (`-r`)
- **Iterations**: 10 (`-t 10`)

**Output:**

- 256-bit master key

### Security characteristics

- **Memory hardness**: Each passphrase guess costs 64 MiB of memory-bound work, defending against GPU and ASIC-based attacks in the one scenario where an offline attack exists (YubiKey slot secret compromise)
- **Deterministic salt**: The scheme is stateless, so the salt is derived rather than randomly generated and stored — binding it to the label prevents a precomputed dictionary from transferring across labels
- **Variant**: Argon2id is used (rather than Argon2d used by blocks) as it is the recommended variant for password hashing, combining memory hardness with side-channel resistance — cost parameters are shared with blocks

## Challenge computation

The challenge is computed from the master key and label using HMAC-SHA256:

```typescript
const challenge = computeChallenge(masterKey, label)
```

### Implementation

```typescript
export const computeChallenge = (masterKey: Buffer, label: string): Buffer => {
  return createHmac("sha256", masterKey)
    .update(`superbacked-derived-password-challenge-${label}`, "utf8")
    .digest()
}
```

### Security characteristics

- **Passphrase concealment**: YubiKey receives one 32-byte HMAC-SHA256 output per label — under the PRF assumption this value is computationally indistinguishable from random data and reveals nothing about the master key, so even a backdoored device logging every challenge collects only PRF images (inverting one to the passphrase requires a memory-hard dictionary attack through Argon2id)
- **Hardware gating**: The challenge is a secret function of the master passphrase, so an attacker cannot pose the right question to the YubiKey without already knowing the passphrase — given a leaked derived password, each passphrase guess requires Argon2id plus a live round-trip through the physical YubiKey, capping brute-force throughput at USB challenge-response speed instead of GPU speed (no offline attack exists)
- **Domain separation**: Context strings share the `superbacked-derived-password-` prefix followed by a role segment (`salt-`, `challenge-`, `no-yubikey`) — roles diverge at a fixed position so no label can make two contexts collide, and fixed 32-byte output keeps the challenge within the 64-byte HMAC-SHA1 challenge limit regardless of label length

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

Slot 1 ships from the factory configured for Yubico OTP — provisioning it for challenge-response overwrites that configuration permanently. To keep factory Yubico OTP, provision slot 2 instead (`--slot 2`) and derive with `--slot 2`.

Computing a response requires physical touch by default — add `--no-touch` to compute responses without touch (weaker). Requires YubiKey firmware 2.2 or later. The generated secret is displayed once so a second YubiKey can be programmed with it, providing hardware redundancy — losing the only YubiKey loses all derived passwords. Slots provisioned with other tools (for example `ykman otp chalresp`) remain compatible.

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

## Password derivation

The master key and response are expanded into a deterministic byte stream using HKDF-SHA256:

```typescript
chunk = hkdf(masterKey, salt, info, 64)
```

### Implementation

```typescript
export const hkdf = (
  inputKeyingMaterial: Buffer,
  salt: Buffer,
  info: Buffer,
  length: number
): Buffer => {
  return Buffer.from(
    hkdfSync("sha256", inputKeyingMaterial, salt, info, length)
  )
}
```

**Parameters:**

- **Input keying material**: 256-bit master key
- **Salt**: 160-bit YubiKey response (or fixed public salt when deriving without YubiKey)
- **Info**: Label followed by fixed-width 32-bit big-endian counter
- **Output**: 64 bytes per counter — incrementing the counter yields an unbounded deterministic stream

### Security characteristics

- **Factor combination**: HKDF-Extract is where the two factors cryptographically meet — the salt is unknowable without the hardware and the input keying material is unknowable without the passphrase
- **Label independence**: Under the PRF assumption, streams for different labels are computationally independent — a password leaked from one label reveals nothing about any other
- **Info unambiguity**: The fixed-width counter guarantees no two label and counter pairs produce the same info value

## Password rendering

The byte stream is rendered into a password using rejection sampling over 85 characters:

- **Lowercase**: `abcdefghijkmnopqrstuvwxyz`
- **Uppercase**: `ABCDEFGHJKLMNPQRSTUVWXYZ`
- **Digits**: `23456789`
- **Special**: `!#$%&()*+,-./:;<=>?@[\]^_{}~` (US keyboard layout, space excluded)

Ambiguous characters are excluded (KeePassXC-style look-alike exclusion, extended with the quote family): `0`/`O` and `1`/`l`/`I` transcribe unreliably when passwords are typed manually on air-gapped devices, `|` reads as `l` or `I` and mobile keyboards substitute curly variants when typing `'`, `"` and `` ` ``.

### Algorithm

1. Accept stream byte only if below 255 (largest multiple of 85 below 256), map accepted byte modulo 85 into character set
2. Accumulate characters until requested length is reached
3. Keep candidate password only if it contains all four character classes — otherwise discard it whole and continue down the stream

### Security characteristics

- **Uniformity**: Rejection sampling (the same technique as `arc4random_uniform` and Python `secrets`) makes all 85 characters exactly equiprobable at ~6.41 bits per character — a bare modulo would bias toward the first characters
- **Compliance without bias**: Discarding non-compliant candidates whole (rather than patching characters in) keeps output uniform over the set of compliant passwords, so every password satisfies common complexity rules without distribution skew
- **Capacity**: Default 16-character password carries ~102 bits (past the 100-bit threshold KeePassXC rates excellent) — short enough to type manually on air-gapped devices, while effective strength remains min(passphrase guessing cost, 160-bit response, rendered bits), making the passphrase the binding constraint by design

## Deriving without YubiKey

With `--no-yubikey`, a fixed public salt replaces the response:

```typescript
export const noYubiKeySalt = createHash("sha256")
  .update("superbacked-derived-password-no-yubikey", "utf8")
  .digest()
```

- **Independence**: The fixed salt is 32 bytes and can never equal a 20-byte response, so passwords derived with and without YubiKey for the same label are independent — deriving without YubiKey is not a fallback for a lost key
- **Trade-off**: Single factor — a leaked derived password becomes offline-attackable, with Argon2id as the only remaining wall

## Security model

| Attacker holds                  | Best remaining attack                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Leaked derived password         | Passphrase guessing gated by physical YubiKey round-trip and Argon2id per guess — no offline attack |
| YubiKey (stolen)                | Nothing to query it with — challenges depend on the passphrase                                      |
| YubiKey and leaked password     | Passphrase guessing, still hardware-gated per guess                                                 |
| Slot secret and leaked password | Offline passphrase guessing, memory-hard (Argon2id) with per-label dictionaries                     |
| Passphrase only                 | Nothing — HKDF salt is sealed in hardware                                                           |

**Limitations:**

- **No rotation**: Derivation is deterministic, so a leaked password re-derives identically forever — replacing it requires a new label (for example `github2`)
- **Length is not rotation**: Passwords of different lengths for the same label are windows into the same byte stream and share material — to replace a password, change the label, not the length
- **Loss of YubiKey**: Without a second YubiKey programmed with the same slot secret, all derived passwords are unrecoverable
- **No verifier**: No fingerprint or checksum of the passphrase is ever displayed or stored — any passphrase-only verifier would reintroduce the offline attack the keyed challenge eliminates, so a mistyped passphrase silently derives a different password (derive twice and compare before setting a password for the first time)

## Command-line interface

```console
superbacked derive-password [label] [options]
```

Label is prompted when omitted, keeping labels out of shell history and process listings. When the passphrase is piped via stdin, the prompt reads from the controlling terminal (the sudo and ssh behavior) — passing the label as argument is only required fully non-interactively (no controlling terminal, for example cron).

**Options:**

- `--clear <seconds>`: Seconds before copied password is cleared from clipboard (default `10`)
- `--confirm`: Prompt for master passphrase twice and require a match — catches typos when creating a password (interactive prompts only; a piped passphrase is used as-is)
- `-l, --length <length>`: Password length (default `16`, minimum `8`, maximum `128`)
- `--no-yubikey`: Derive without YubiKey (single factor, weaker)
- `-p, --print`: Print password to stdout instead of copying it to clipboard
- `-s, --slot <slot>`: HMAC-SHA1 challenge-response slot (default `1`)

### Derivation workflow

1. User runs `superbacked derive-password`
2. User enters label
3. User enters master passphrase (hidden prompt or piped via stdin)
4. User touches YubiKey if slot requires touch
5. App copies password to clipboard, clearing it after 10 seconds or as soon as user presses enter (or prints it with `--print`)

The password is copied to the clipboard by default, keeping it out of terminal scrollback (which tmux and some terminal emulators persist to disk). The process stays alive for the clearing delay (X11 and Wayland drop a selection when its owner exits) then clears the clipboard unless the user copied something else meanwhile — pressing enter ends the wait and clears immediately. Interrupting the wait leaves the password on the clipboard on macOS (the pasteboard survives the process) whereas X11 and Wayland drop the selection when the process dies. With `--print`, the password is written to stdout on its own so the command composes with other utilities — prompts and the touch notice go to stderr.

### Platform notes

- **Linux**: Reading `/dev/hidraw*` requires Yubico udev rules or root
- **macOS**: Opening the YubiKey keyboard interface may require granting the terminal Input Monitoring permission (System Settings → Privacy & Security → Input Monitoring)
