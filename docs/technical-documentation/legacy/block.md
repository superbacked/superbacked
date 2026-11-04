# Legacy block technical documentation

## Abstract

This document specifies the legacy block — the scheme used by blocks created before the [current scheme](../block.md): every release up to v1.12.1. The scheme is frozen — printed blocks in the wild must decrypt forever — and restoration-only: creation always uses the current scheme. The source code ([src/utilities/core/legacy/block.ts](../../../src/utilities/core/legacy/block.ts)) is the ground truth for this document, and the scheme is pinned against shipped artifacts by the published legacy [reference blocks](../../../tests/fixtures/legacy/blocks).

## Introduction

Superbacked protects secrets too important to lose and too sensitive to share — critical credentials, signing keys and digital assets. Secrets are backed up — encrypted, offline, with succession planning built in.

A legacy block is a [legacy fixed-size encryption](fixed-size-encryption.md) output carried in a QR payload — the cryptographic design (ciphers, key derivation, block format and padding) lives there; this document covers the block-level scheme around it.

## Payload

The legacy block artifact’s wire format carries `iv` and `headers` fields alongside `salt`, `data` and `metadata` — their presence is how restoration tells the eras apart (see `LegacyPayload` in [src/utilities/core/legacy/block.ts](../../../src/utilities/core/legacy/block.ts) and the era detection in [src/handlers/restore.ts](../../../src/handlers/restore.ts)).

## Restoration

`decryptLegacyBlock` decrypts one secret of a legacy payload — headers locate secrets and the key derivation function runs inside decryption, always at the legacy [KDF profile](../../../src/shared/kdfProfiles.ts): every legacy block was created at legacy cost, so the pin is their compatibility contract, not a default. Subkey-mode decryption (v1.6.0 and later, blockcrypt 0.0.1-beta.22) is tried first, falling back to [legacy mode](fixed-size-encryption.md#key-derivation) for blocks created before HKDF subkeys (v1.5.1 and earlier).

The scheme predates the [scheme header](../../../src/utilities/crypto/schemeHeader.ts), [YubiKey protection](../block.md#yubikey-second-factor) and Paranoid mode — no header exists to probe (legacy blocks are recognized by payload shape, before any key derivation), no second factor exists to request (a slot supplied against a legacy block fails exactly like a wrong passphrase) and every block restores at legacy cost.

Blockset shares inside legacy blocks are classified by the [legacy blockset](blockset.md) scheme.
