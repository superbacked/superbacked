# Legacy detached archive technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the legacy detached archive — the scheme used by detached archives created before the [current scheme](../detached-archive.md): v1.10.0 (where detached archives shipped) through v1.12.1. The scheme is frozen — archives in the wild must restore forever — and restoration-only: creation always uses the current scheme. The source ([src/utilities/core/legacy/detachedArchive.ts](../../../src/utilities/core/legacy/detachedArchive.ts)) is the ground truth for this document, and the reference vectors in [tests/legacy/detachedArchive.test.ts](../../../tests/legacy/detachedArchive.test.ts) pin the key chain and the format.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Legacy detached archives are the scheme detached archives were built on before the current one: the same master-key design — a random 256-bit key embedded in a block, expanded into an encryption key, an HMAC key and a filename — with a headerless file layout and the shipped key chain. The current scheme added the [probe block](../scheme-registry.md) and a fresh key chain; this scheme carries neither.

## Terminology

Block, detached archive, master key and secret carry the same meaning as in the [detached archive technical documentation](../detached-archive.md).

## Key derivation

The master key is expanded into the shipped key chain using HKDF-SHA256 (`deriveLegacyDetachedArchiveKeys`):

| Output         | Info                | Length   |
| -------------- | ------------------- | -------- |
| Encryption key | `encryption-key-v1` | 256 bits |
| HMAC key       | `hmac-v1`           | 256 bits |
| Filename       | `filename-v1`       | 128 bits |

Every derivation uses the 256-bit master key as input keying material with an empty salt. The `-v1` suffixes are fossils of the era before artifacts carried versions, when the string suffix was the only forward-compatibility affordance — frozen shipped identities, not a pattern to imitate (see [Version namespaces](../scheme-registry.md#version-namespaces) in the scheme registry technical documentation).

## File format

```text
[iv (12 bytes)][encrypted data][tag (16 bytes)][hmac (32 bytes)]
```

- **Initialization vector**: 12-byte random initialization vector for AES-256-GCM
- **Encrypted data**: AES-256-GCM-encrypted portable tar archive
- **Authentication tag**: 16-byte GCM authentication tag
- **HMAC**: 32-byte HMAC-SHA256 binding the archive to its block content:

```text
HMAC-SHA256(hmacKey, message || iv || encrypted data || tag)
```

Where `message` contains the JSON-encoded block content. Verification uses constant-time comparison.

## Fallback

The fallback is bounded in the consumer ([src/handlers/detachedArchive.ts](../../../src/handlers/detachedArchive.ts)): restoration probes for the current scheme and falls back to this scheme only when no probe matches — a legacy archive puts payload bytes where the current scheme puts its probe block, which no probe key can match. The filename alone is named by the block’s era rather than detected (a legacy block always pairs with a legacy archive), as the archive must be located on disk before restoration can probe it.
