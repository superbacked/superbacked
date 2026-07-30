# Scheme registry technical documentation

## Abstract

This document specifies the scheme registry — the append-only set of KDF profiles, the scheme header and the probe blocks through which Superbacked artifacts declare their version and key derivation cost without storing either in plaintext. The source ([src/shared/utilities/kdfProfiles.ts](../../src/shared/utilities/kdfProfiles.ts) and [src/utilities/crypto/schemeHeader.ts](../../src/utilities/crypto/schemeHeader.ts)) is the ground truth for this document, and the reference vectors in [tests/kdfProfiles.test.ts](../../tests/kdfProfiles.test.ts) and [tests/schemeHeader.test.ts](../../tests/schemeHeader.test.ts) pin the registry.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Artifacts are immutable and decades-lived, so every constant that shaped one is frozen the moment it ships — and a format that cannot say which constants shaped it freezes them forever, for every future artifact too. The registry converts that dead end into append-only evolution: defaults are an application choice, but parameters are an artifact property, discovered at restoration rather than remembered by the user. Strengthening key derivation means appending a registry row, never editing one.

The registry serves a second constraint: deniability. Blocks and archives are indistinguishable from random data, so an artifact cannot declare its version in plaintext. Instead, the declaration is encrypted — readable only by the passphrase holder, discovered by trying known profiles.

## Terminology

Four terms ladder everything in this document — each level a facet of the one below it:

- **Primitive**: a building block with no policy — Argon2d, HKDF-SHA256, AES-256-GCM.
- **Scheme**: a frozen composition of primitives with rules — fixed-size encryption, passphrase key, derived key, block, blockset, standalone archive, detached archive. Everything versioned is a scheme.
- **Format**: the at-rest byte layout a scheme gives its outputs. Only some schemes have one — the derived schemes deliberately do not.
- **Artifact**: a concrete instance of a format in the wild — a printed block, a `.superbacked` file. Only schemes with formats have artifacts.

And the registry-specific terms:

- **KDF profile**: a named, frozen set of Argon2d cost parameters (memory, passes, parallelism).
- **Paranoid mode**: opt-in setting deriving at the paranoid profile (the app Settings switch or the `--paranoid` command-line flag).
- **Probe block**: encrypted scheme header with its own initialization vector and authentication tag — the version trial.
- **Registry row**: a frozen profile — appended when key derivation is strengthened, never edited.
- **Scheme header**: 8-byte version declaration carried under encryption by every version 2 artifact.
- **Trial**: one attempt to reveal a scheme header using the key material of one profile.

## KDF profiles

Every key derivation in Superbacked runs Argon2d at a named profile — the `argon2` primitive takes the profile explicitly, with no default, so each call site names its compatibility contract:

| Profile  | Parameters                 | Attack cost | Protects                                                                   |
| -------- | -------------------------- | ----------- | -------------------------------------------------------------------------- |
| legacy   | 64 MiB, 10 passes, 2 lanes | 1×          | Every version 1 block, blockset and standalone archive in the wild         |
| standard | 64 MiB, 80 passes, 4 lanes | 8×          | Version 2 artifacts, [derived keys](derived-key.md) and everything on them |
| paranoid | 1 GiB, 50 passes, 4 lanes  | 80×         | Artifacts and derivations created under Paranoid mode                      |

Attack cost scales with memory × passes — the model is memory-bandwidth-bound (see the [passphrase strength technical documentation](passphrase-strength.md)), so the standard profile costs an attacker 8× the legacy profile per guess and the paranoid profile 80×. Parallelism only divides honest wall-clock across cores and is free to raise; memory is a hard restore floor — restoring a paranoid artifact requires at least 1 GiB of free memory.

**Rules:**

- **Append-only**: every row is frozen forever — editing one silently changes the key of every artifact created with it, which is why [tests/kdfProfiles.test.ts](../../tests/kdfProfiles.test.ts) exists to fail that edit
- **Never stored**: artifacts carry no parameters — the profile is discovered at restoration by trial, so no parsing surface exists and nothing about cost leaks in plaintext
- **Named rows only**: free-form parameters are unsupported by construction — discovery only terminates over a finite profile set

## Scheme header

Every version 2 artifact declares its version through an 8-byte header, always under encryption:

```
[magic sbck (4 bytes)][version (1 byte)][reserved (3 bytes, zero)]
```

- **Magic**: frozen forever and deliberately version-free — a constant magic is what lets an old release recognize an artifact from a newer one and report it as such instead of misreporting a wrong passphrase
- **Version**: names the artifact layout (1–255; version 1 is the headerless legacy format, recognized by revealing no header)
- **Reserved**: must be zero — headroom for future parameters, which can only ever be post-decryption parameters (compression, layout tweaks), never KDF parameters: the key needed to read them already implies the cost

## Probe blocks

Where an artifact is raw ciphertext, the header travels in a probe block — AES-256-GCM over the header under a dedicated probe key:

```
[initialization vector (12 bytes)][encrypted scheme header (8 bytes)][authentication tag (16 bytes)]
```

A probe either reveals a valid header (authentication tag verifies and the magic, version and reserved bytes check out) or is indistinguishable from random bytes — wrong keys, wrong profiles and headerless legacy artifacts all land in the same place. Each scheme carries the header its own way:

| Scheme                                             | Carriage                                                                                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Block](block.md)                                  | Header prepended to each secret’s message plaintext — the payload’s own authentication tag is the probe                                            |
| [Blockset](blockset.md)                            | Version byte at the start of each share’s message, inside the block envelope — the share domain key names the type, the byte names the composition |
| [Standalone archive](standalone-archive.md)        | Probe block between salt and payload, keyed by an HKDF sibling of the encryption key                                                               |
| [Detached archive](detached-archive.md)            | Probe block at the start of the file — the keys are already in hand, so the trial is free                                                          |
| [Derived key](derived-key.md) and everything on it | No artifact exists to probe — the scheme version is surfaced at every derivation and selected with `--derivation-version`, never discovered        |

Layers nest: a blockset member is a block until its decrypted plaintext says otherwise, so every scheme layer that owns bytes declares its own version at the top of the bytes it owns — payloads by shape, envelopes by the scheme header, compositions by their version byte — each revealed by opening the layer above, and each versioning independently.

**The probe sits at the same factor depth as the payload key.** For a YubiKey-protected artifact, the probe key mixes the hardware response — the governing rule is that the cheapest passphrase-correctness oracle anywhere in a format defines its real key derivation cost, so no probe may be reachable more cheaply than the payload it guards.

## Discovery

Restoration discovers the version and profile by trial, newest first:

1. For each candidate profile, derive the key material (one Argon2d stretch — and one YubiKey touch, when engaged — expanded into probe and payload keys)
2. A revealed header names the version — a supported version restores, an unsupported one reports that the artifact requires a newer release of Superbacked, never a wrong passphrase
3. No profile revealing a header means the headerless version 1 format, restored with the legacy trial’s key material — already in hand, so legacy restoration costs no extra stretch
4. Failing that, the passphrase is wrong or the artifact corrupted

Trial cost scales with the number of distinct profiles, not versions — rows sharing a profile share a stretch. The paranoid row joins the trial only while Paranoid mode is enabled: a deliberate contract keeping wrong passphrases fast for everyone else, at the cost of paranoid artifacts reporting a wrong passphrase until the mode is switched on.

## Version namespaces

Every version number in Superbacked counts iterations of its own thing, from 1 — there is no global scheme version, and any agreement between counters (or with the app version) is coincidence. Each versioned scheme exports one uniformly named `schemeVersion` constant — the module path names the scheme, so `grep -rn "export const schemeVersion" src` lists the namespaces:

| Namespace                 | Module                                    | Carried by                                                                            |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Block layout              | `src/utilities/core/block.ts`             | Scheme header inside each secret’s encrypted message                                  |
| Blockset composition      | `src/utilities/core/blockset.ts`          | Version byte at the start of each share’s encrypted message                           |
| Standalone archive layout | `src/utilities/core/standaloneArchive.ts` | Probe block between salt and payload                                                  |
| Detached archive layout   | `src/utilities/core/detachedArchive.ts`   | Probe block at the start of the file                                                  |
| Derived scheme            | `src/utilities/crypto/derivedKey.ts`      | Nothing stored — surfaced at every derivation, selectable with `--derivation-version` |

**Rules:**

- **A version constant exists only where the version travels as data** — written into artifact bytes or surfaced as a user-facing input — and is named `schemeVersion`, defined at the top of the module that owns the format or scheme. Modules whose version never exists as a number (for example the passphrase key scheme, versioned by the artifacts that consume it) state their version in a comment instead
- **Constants point, literals enumerate**: a version constant names the current version; the key-domain and context strings are the registry rows, one frozen literal per construction ever shipped. A constant may select among literals, never generate them — interpolating a version constant into an identity string would let a one-line bump silently rederive every key
- **Identity strings carry no version suffix**: the version lives in the carrier (header, probe or user input), so strings only need distinctness — `block-key`, `blockset-key`, `kdf-key`, `archive-key`, `version-probe` and the `superbacked-…` derived contexts are all bare. If a construction ever iterates, its successor gets a new literal named at that moment, while the old literal stays forever
- **Shipped suffixes are fossils**: the [legacy detached archive](legacy/detached-archive.md) chain shipped in v1.10.0 as `encryption-key-v1`, `hmac-v1` and `filename-v1` — from the era before artifacts carried versions, when the string suffix was the only forward-compatibility affordance. These are frozen shipped identities, quarantined in [src/utilities/core/legacy/detachedArchive.ts](../../src/utilities/core/legacy/detachedArchive.ts) — their suffixes are part of the bytes, not a pattern to imitate

## Paranoid mode

Paranoid mode derives at the paranoid profile. It is a creation-time setting — the app Settings switch (persisted to configuration) or the root `--paranoid` command-line flag — and applies to blocks, blocksets, standalone archives, [derived passwords](derived-password.md) and [derived Bitcoin wallets](derived-bitcoin-wallet.md).

For stored artifacts the mode also gates restoration, as above. For derived schemes nothing is stored, so the mode is a determinism input on par with the label — deriving without it silently produces different passwords and different wallets, which is why every derivation echoes it. The [passphrase strength](passphrase-strength.md) gate is priced at the active profile, so the paranoid profile buys real attack years and admits proportionally weaker passphrases — a deliberate, user-owned trade.
