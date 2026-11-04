# Blockset technical documentation

## Abstract

This document specifies the design and implementation of blocksets. A blockset encrypts a secret using a random key called the Shamir key, then splits that key — never the secret — one share per block using Shamir Secret Sharing (via [sss](https://github.com/dsprenkels/sss-cli)): enough blocks rebuild the key and unlock the secret, any smaller number reveals nothing. Each block — carrying the whole encrypted secret and one share — is encrypted a second time using [fixed-size encryption](fixed-size-encryption.md), exactly like any other block (see the [block technical documentation](block.md)): two layers of encryption, so a blockset keeps every property of a block while adding threshold recovery. The source code ([src/utilities/core/blockset.ts](../../src/utilities/core/blockset.ts) and [src/utilities/crypto/shamir.ts](../../src/utilities/crypto/shamir.ts)) is the ground truth for this document.

## Introduction

Superbacked protects secrets too important to lose and too sensitive to share — critical credentials, signing keys and digital assets. Secrets are backed up — encrypted, offline, with succession planning built in — or never stored at all: derived on demand from a master passphrase and YubiKey.

Blocksets extend blocks with threshold recovery — because some secrets need to outlive you. A blockset — a set of blocks — splits recovery of a secret among the people you trust: no single person can recover secrets alone, but together the right group can recover what matters, even without you.

A blockset never splits the secret itself. The app creates a new random key — the Shamir key — encrypts the secret using it, and splits the key one share per block. Each block — carrying the whole encrypted secret and one share — is then encrypted again using fixed-size encryption, exactly like any other block (see the [block technical documentation](block.md)). Enough blocks — for example, any two of three — rebuild the key and unlock the secret, while any smaller number reveals nothing. Store the blocks in separate locations or hand them to separate people you trust — no single block, and no combination of blocks below the threshold, can be used to recover the secret.

## Terminology

- **Blockset**: a set of blocks that each carry, for every secret, the encrypted secret and one share — enabling threshold recovery.
- **Shamir key**: the random encryption key that seals a secret (each secret of a blockset has its own) — Shamir Secret Sharing splits this key, not the secret.
- **Shamir Secret Sharing**: a scheme that splits a secret into a chosen number of shares, such that any threshold of them reconstructs it and any fewer reveal nothing.
- **Share**: one of the parts the Shamir key is split into — any threshold of shares rebuilds the key, and any fewer — even one short of the threshold — reveal nothing about it.
- **Threshold**: the number of blocks required to reconstruct a secret (for example, 2 in a 2-of-3 blockset).

Block, secret, additional secret and passphrase carry the same meaning as in the [block technical documentation](block.md).

## Overview

When you create a blockset, the app:

1. Encrypts each secret using a new random key — the Shamir key.
2. Splits the Shamir key into shares using Shamir Secret Sharing.
3. Assembles one block per share — each block carries, for every secret, the encrypted secret together with one share.
4. Encrypts and outputs each block exactly like a single block (see the [block technical documentation](block.md)).

The app offers three blockset subtypes — 2-of-3, 3-of-5 and 4-of-7 (threshold-of-blocks).

## Composition

Two layers of encryption wrap every secret in a blockset, applied one after the other:

1. **sss encrypts the secret and splits the key.** sss creates a new random key — the Shamir key — encrypts the secret using it and splits the key into shares, one per block.
2. **Fixed-size encryption seals every block.** Each block — carrying the encrypted secret and one share — is encrypted using the secret’s passphrase and the `blockset-key` HKDF domain key, exactly like a single block uses `block-key` — restoration recognizes shares by which key authenticates, not by a plaintext marker.

When a blockset holds several secrets, each block carries the encrypted secret and one share of every secret (see `encryptBlockset` in [src/utilities/core/blockset.ts](../../src/utilities/core/blockset.ts)).

Encrypting twice is what gives a blockset its guarantees. The single block and blockset backup types yield indistinguishable blocks: the outer layer always uses the same fixed-size encryption, so a blockset’s block looks like any other. And recovery is gated twice: a valid passphrase opens a block, and when the block belongs to a blockset, the secret stays sealed until enough blocks meet the threshold and rebuild the Shamir key — a requirement enforced by the encryption itself, not by policy. There is no separate linking metadata to protect — what binds the blocks of a blockset together is the shares themselves.

## Threshold recovery

Recovery peels the two layers in reverse order:

1. **Fixed-size encryption opens each block.** Each block is decrypted exactly as a single block (see [Restoration workflow](block.md#restoration-workflow) in the block technical documentation): the passphrase yields the encrypted secret and one share rather than the secret itself — the share’s [version byte](#version-declaration) is validated before anything else.
2. **Enough shares rebuild the Shamir key.** The app collects shares block by block; once the threshold is met, the shares rebuild the Shamir key and the secret is decrypted. Below the threshold, reconstruction fails and you are prompted for the next block — a single block never yields the secret.

### Version declaration

Every share carries the blockset scheme version as its first byte, inside the block envelope: `[block scheme header][blockset version (1 byte)][share]`. The two versions live on independent axes, each declared at the top of the bytes its scheme owns — the [scheme header](../../src/utilities/crypto/schemeHeader.ts) names the block envelope and the byte names the composition, read only after the blockset domain key authenticates, so restoration already knows the type:

- A supported version reveals the share; an unsupported one reports that the blockset requires a newer version of Superbacked, never a wrong passphrase
- The byte costs one byte of block capacity per share (see `getBlockUsage` in [src/utilities/core/block.ts](../../src/utilities/core/block.ts))
- Version 1 is the [legacy prefix convention](legacy/blockset.md), which never wrote the byte

## Key derivation

Each share’s key is derived exactly like a [block’s](block.md#key-derivation) — a memory-hard Argon2d stretch at the active [KDF profile](../../src/shared/kdfProfiles.ts) followed by the `blockset-key` HKDF domain key.

### Paranoid mode

A blockset created under [Paranoid mode](../../src/shared/kdfProfiles.ts) derives every share’s key at the paranoid profile, exactly like a single block — and restoring its blocks requires the mode enabled.

### YubiKey second factor

The [YubiKey second factor](block.md#yubikey-second-factor) is supported for single blocks only, never blocksets — a blockset’s shares are meant to restore on any machine holding enough blocks, a property a hardware binding would defeat and creation rejects the combination outright (see `encryptBlockset` in [src/utilities/core/blockset.ts](../../src/utilities/core/blockset.ts)).

## Creation workflow

With the app in create mode:

1. Select a blockset subtype (2-of-3, 3-of-5 or 4-of-7) and optionally enter a label.
2. Enter a secret and its passphrase.
3. Optionally, add additional secrets using the secret actions menu — each with its own passphrase — until remaining block capacity runs out.
4. Click “Create”.
5. The app creates the shares, assembles one block per share and asks the user to print each block or save it as a JPG or PDF file.

## Restoration workflow

With the app in restore mode:

1. Scan a block.
2. Enter a passphrase.
3. Click “Unlock”.
4. The app prompts for further blocks until the threshold is met, then reconstructs the secret and asks whether to copy or show it.
