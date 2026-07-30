# Legacy standalone archive technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the legacy standalone archive — the scheme used by standalone archives created before the [current scheme](../standalone-archive.md): v1.10.0 (where standalone archives shipped) through v1.12.1. The scheme is frozen — archives in the wild must restore forever — and restoration-only: creation always uses the current scheme. The source ([src/utilities/core/legacy/standaloneArchive.ts](../../../src/utilities/core/legacy/standaloneArchive.ts)) is the ground truth for this document, and the format is pinned by [tests/legacy/standaloneArchive.test.ts](../../../tests/legacy/standaloneArchive.test.ts) and the published legacy [reference archive](../../../tests/fixtures/legacy/standalone-archives).

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Legacy standalone archives are the scheme standalone archives were built on before the current one: a passphrase-encrypted tar archive with a headerless layout, keyed by the raw Argon2d stretched key. The current scheme added the [probe block](../scheme-registry.md), the version-probe key and the YubiKey second factor; this scheme carries none of them.

## Terminology

Passphrase, salt and standalone archive carry the same meaning as in the [standalone archive technical documentation](../standalone-archive.md).

## Key derivation

The encryption key is the raw Argon2d output — the passphrase stretched over the stored salt at the legacy [KDF profile](../scheme-registry.md), with no HKDF expansion and no identity strings. That absence is itself the shipped contract: unlike the [legacy detached archive](detached-archive.md), this scheme owns no frozen strings, only the raw-key construction and the layout below.

## File format

```text
[salt (16 bytes)][iv (12 bytes)][encrypted data][tag (16 bytes)]
```

- **Salt**: 16-byte random salt, passed to Argon2d alongside the passphrase
- **Initialization vector**: 12-byte random initialization vector for AES-256-GCM
- **Encrypted data**: AES-256-GCM-encrypted portable tar archive
- **Authentication tag**: 16-byte GCM authentication tag

Every byte is indistinguishable from random data. A wrong passphrase and a corrupted archive are cryptographically indistinguishable — both surface as the same authentication failure.

## Discovery

Legacy archives are recognized by revealing nothing: restoration trials the known profiles against the current scheme’s probe position (see [Version discovery](../standalone-archive.md#version-discovery)), and matching no probe means the headerless legacy format. The legacy trial’s stretched key is the encryption key — already in hand, so legacy restoration costs no extra stretch.
