# Legacy blockset technical documentation

## Abstract

This document specifies the legacy blockset — the scheme used by blocksets created before the [current scheme](../blockset.md): every release up to v1.12.1. The scheme is frozen — printed blocks in the wild must decrypt forever — and restoration-only: creation always uses the current scheme. The source ([src/utilities/core/legacy/blockset.ts](../../../src/utilities/core/legacy/blockset.ts)) is the ground truth for this document, and the classification is pinned by [tests/legacy/blockset.test.ts](../../../tests/legacy/blockset.test.ts) and the published legacy reference blockset ([tests/fixtures/legacy/blocks/blockset](../../../tests/fixtures/legacy/blocks/blockset)).

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Legacy blocksets share the current composition — each secret split into one share per block using Shamir Secret Sharing, each block a [legacy block](block.md) — but mark shares differently: where the current scheme recognizes shares by which domain key authenticates and versions them with a [version byte](../blockset.md#version-declaration), the legacy scheme marks each share with a plaintext `shamir:` prefix inside the encrypted message and carries no version byte. The prefix convention is blockset scheme version 1, recognized structurally — the era is known from the payload shape before classification runs.

## Share classification

The prefix alone cannot classify — a plain secret may start with it. Plain messages are UTF-8-encoded strings by contract while shares are effectively random bytes, so a share must also be share-shaped: at least 50 bytes after the prefix (a keyshare is 33 bytes, ciphertext at least 1 and an authentication tag 16 — anything shorter cannot be one) and not valid UTF-8. Messages failing either test are plain secrets, however the prefix reads.

Classification runs on the decrypted message, so the marker costs no deniability — an adversary without the passphrase never sees it. A misclassification in either direction fails safe: a prefixed plain secret is returned as a secret, and share accumulation and combining live above the classification (see [src/handlers/restore.ts](../../../src/handlers/restore.ts)).
