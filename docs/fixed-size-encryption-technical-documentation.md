# Fixed-size encryption technical documentation

## Abstract

This document specifies the cryptographic design and implementation of fixed-size encryption — the primitive behind blocks. Fixed-size encryption encrypts one or more secrets into a fixed-size block whose every byte is indistinguishable from random data, providing plausible deniability. The source ([src/utilities/crypto/fixedSizeEncryption.ts](../src/utilities/crypto/fixedSizeEncryption.ts)) is the ground truth for this document, and the reference vectors in [tests/fixedSizeEncryption.test.ts](../tests/fixedSizeEncryption.test.ts) pin the format.

The scheme specified here — AES-256-GCM only, headerless, caller-supplied 256-bit keys — encrypts every new block. Blocks created before it use the [legacy scheme](legacy-fixed-size-encryption-technical-documentation.md), which must decrypt forever.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Fixed-size encryption is the primitive every block is built on. A block encrypted using it reveals only its size. Every byte — entries and padding — is either ciphertext or random, so the number of secrets, their sizes and their boundaries cannot be determined. Only the first secret is ever known to exist — every block holds at least one — so plausible deniability covers the secrets beyond it: additional secrets are concealed in the padding, and without their passphrases, no one can tell whether they exist at all. Decrypting the first secret reveals nothing about the others; decrypting a later secret reveals that one or more secrets precede it in the block — though nothing more, nor whether more secrets exist.

## Terminology

- **Block**: the output of encryption — a single buffer carried in the JSON payload a Superbacked block’s QR code encodes (see the [block technical documentation](block-technical-documentation.md)).
- **Entry**: one secret’s region of a block — initialization vector, masked length, ciphertext and authentication tag.
- **Secret**: a message and the caller-supplied 256-bit key that protects it (see [src/utilities/crypto/fixedSizeEncryption.ts](../src/utilities/crypto/fixedSizeEncryption.ts)).

## Format

A block is a single buffer of the caller-requested size. Each secret occupies one entry; entries are concatenated from the start of the block and unused space is filled with random padding, so a block reveals nothing about how many secrets it holds or where they sit.

| Field           | Size           | Content                                                                  |
| --------------- | -------------- | ------------------------------------------------------------------------ |
| `iv`            | 12 bytes       | Random; initialization vector for AES-256-GCM.                           |
| `masked length` | 2 bytes        | Ciphertext length, masked by XOR with a PRF of the length subkey and iv. |
| `ciphertext`    | message length | AES-256-GCM-encrypted message.                                           |
| `tag`           | 16 bytes       | AES-256-GCM authentication tag.                                          |

An entry occupies its message length plus 30 bytes of overhead (`secretOverhead`); messages may be at most 65,535 bytes. Encryption fails loudly when entries exceed the block size, and the `getDataLength` helper returns the space a message occupies (its length plus `secretOverhead`) so callers can measure before encrypting. Superbacked sets the block size to 768 bytes, bounded by QR code capacity (see [src/utilities/core/block.ts](../src/utilities/core/block.ts)).

## Key derivation

The scheme does not bundle a KDF — the caller supplies a 256-bit key per secret, and its strength is the caller’s responsibility. Superbacked derives keys from passphrases using Argon2d followed by the backup type’s HKDF domain key (see the [block technical documentation](block-technical-documentation.md)).

Two subkeys are derived from each secret’s key using HKDF-SHA256 with an empty salt: one with info `length` keying the length mask, one with info `data` keying AES-256-GCM — so the two primitives never share a key. The info strings are frozen format constants. Subkeys depend only on the secret’s key, so decryption derives them once, not per scanned offset.

## Length masking

The ciphertext length is masked by XOR with the first 2 bytes of the HMAC-SHA256 of the initialization vector under the length subkey, making it indistinguishable from random data without the key while sparing decryption a search over lengths.

## Encryption

For each secret:

1. Derive the length and data subkeys from its key (see [Key derivation](#key-derivation)).
2. Encrypt the message using AES-256-GCM with the data subkey and a fresh random 12-byte initialization vector.
3. Mask the ciphertext length (see [Length masking](#length-masking)).
4. Append the entry — initialization vector, masked length, ciphertext, authentication tag — to the block.

Entries are concatenated and the block is padded to the requested size with random bytes.

## Decryption

Decryption takes a single key, derives its subkeys once and slides over every byte offset of the block: unmask the candidate length at the offset, bounds-check it and attempt authenticated decryption — the authentication tag rejects false candidates, costing O(block size) cheap attempts worst case. A wrong key and an absent secret fail identically (`Secret not found`) — the error does not reveal whether there was anything to find.

## Security properties

- **Authenticated encryption**: every secret carries an AES-256-GCM authentication tag — a tampered ciphertext or a wrong key fails to decrypt, it does not decrypt to garbage.
- **Plausible deniability**: a block has no headers — every byte is an initialization vector, masked length, ciphertext, authentication tag or random padding, all indistinguishable from random data, so a block reveals nothing about how many secrets it holds beyond the first, which is always present.
- **Size uniformity**: every block is padded to the same size, so its size reveals nothing about how much it holds.
- **Key separation**: the length mask and the cipher use independent HKDF subkeys, and each secret has its own caller-supplied key.

## Known limitations

- The block is not authenticated as a whole: each secret’s entry is protected by its authentication tag, but padding is not. Tampering cannot forge or alter a secret, but it can make one unrecoverable — keep copies of a block if availability matters.
- Plausible deniability has a floor and a direction: every block provably holds at least one secret, so only the secrets beyond the first are deniable — and disclosing a later secret’s passphrase reveals, through its entry’s position (recoverable with its key), that one or more secrets precede it. Deniability is strongest when only the first secret is ever disclosed.
- Deniability covers the block, not its handling: passphrase management and the decision of what to disclose remain with the user.
- Keys are caller-supplied, so the cost of brute-forcing passphrases is set by the caller’s key derivation, not by fixed-size encryption.

## Acknowledgments

The scheme specified here was inspired by the work of [Christoffer Carlsson](https://github.com/christoffercarlsson).
