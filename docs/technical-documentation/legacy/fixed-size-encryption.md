# Legacy fixed-size encryption technical documentation

## Abstract

This document specifies the cryptographic design and implementation of legacy fixed-size encryption — the scheme used by blocks created before the [current scheme](../fixed-size-encryption.md): every release up to v1.12.1, with subkey mode from v1.6.0 and [legacy mode](#key-derivation) up to v1.5.1. The scheme was formerly published as the standalone [Blockcrypt](https://github.com/superbacked/blockcrypt) package — the brand was discontinued, but the scheme is unchanged (vendored into Superbacked at 0.0.1-beta.24). The format is frozen — printed blocks in the wild must decrypt forever — and restoration-only: creation paths were removed, so this document specifies the shipped format while the source implements only its decryption. The source code ([src/utilities/crypto/legacy/fixedSizeEncryption.ts](../../../src/utilities/crypto/legacy/fixedSizeEncryption.ts)) is the ground truth for this document, and the frozen blocks in [tests/legacy/fixedSizeEncryption.test.ts](../../../tests/legacy/fixedSizeEncryption.test.ts) and the published legacy [reference blocks](../../../tests/fixtures/legacy/blocks) pin the format.

## Introduction

Superbacked protects secrets too important to lose and too sensitive to share — critical credentials, signing keys and digital assets. Secrets are backed up — encrypted, offline, with succession planning built in.

Legacy fixed-size encryption is the scheme blocks were built on before the current one. A block encrypted using it reveals only its size. Every byte — headers, data and padding — is either ciphertext or random, so the number of secrets, their sizes and their boundaries cannot be determined. Legacy payloads carry `iv` and `headers` fields — their presence is how restoration tells the formats apart (see the [block technical documentation](../block.md)).

## Terminology

- **Block**: the output of encryption — salt, initialization vector, headers and data — carried in the JSON payload a Superbacked block’s QR code encodes (see the [block technical documentation](../block.md)).
- **Data**: the concatenated ciphertexts of all secrets, followed by random padding.
- **Header**: an encrypted `start:length` pointer that locates one secret’s ciphertext within data.
- **KDF**: the caller-supplied key derivation function mapping a passphrase and salt to a 32-byte key.
- **Legacy mode**: a compatibility mode for blocks created before HKDF subkeys were introduced.
- **Secret**: a message and the passphrase that protects it.

## Block format

| Field     | Size                                                   | Content                                                                                                                                                               |
| --------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `salt`    | 16 bytes                                               | Random; passed to the KDF alongside each passphrase.                                                                                                                  |
| `iv`      | 16 bytes                                               | Random; initialization vector for header encryption.                                                                                                                  |
| `headers` | `headersLength` bytes (multiple of 16, defaults to 64) | One AES-256-CBC-encrypted header per secret, padded to `headersLength` with random bytes.                                                                             |
| `data`    | `dataLength` bytes (multiple of 16)                    | One AES-256-GCM-encrypted message per secret, followed by its 12-byte initialization vector and 16-byte authentication tag, padded to `dataLength` with random bytes. |

The lengths set a block’s capacity: each encrypted header occupies 16 bytes (32 when its `start:length` pointer runs past 15 characters), so the default 64-byte headers hold up to four secrets (Superbacked used 48-byte headers, holding up to three). When `dataLength` was not set, it defaulted to twice the length the first secret occupies in data, rounded up to the next multiple of 64 bytes — a block holding one secret reserves room for more, so its size does not disclose that nothing is hidden.

## Key derivation

Legacy fixed-size encryption does not bundle a KDF — the caller supplies one with the signature `(passphrase, salt) → 32-byte key`, and its strength (memory-hardness, parameters) is the caller’s responsibility. Superbacked supplies Argon2d (see the [block technical documentation](../block.md)).

For each secret, the KDF derives a key from its passphrase and the block’s salt (base64-encoded). Two subkeys are then derived from it using HKDF-SHA256: one with info `headers` encrypting the secret’s header, one with info `data` encrypting the secret’s message — so header and data ciphertexts never share a key. In legacy mode the KDF output is used directly as both keys.

## Encryption

How shipped blocks were created — the format specification restoration decrypts against, no longer implemented. For each secret:

1. Derive the header and data keys from its passphrase (see [Key derivation](#key-derivation)).
2. Encrypt the message using AES-256-GCM with the data key and a fresh random 12-byte initialization vector.
3. Append the secret’s data entry — ciphertext, initialization vector, authentication tag — to data.
4. Encrypt the pointer `start:length` (the ciphertext’s offset within data and its length) using AES-256-CBC with the header key and the block’s initialization vector, and append it to headers.

Headers and data are then padded to their configured lengths with random bytes, and the block — salt, initialization vector, headers, data — is returned.

## Decryption

Decryption takes a single passphrase and scans for a header it can decrypt: every contiguous byte range of headers is tried until one decrypts — using the passphrase’s header key — to a plaintext matching `start:length`. No slot index or count is stored anywhere; a header is found by successfully decrypting it, or it does not exist as far as that passphrase can tell.

The pointer locates the secret’s ciphertext within data, the initialization vector and authentication tag follow it and the message is decrypted and verified using AES-256-GCM. A wrong passphrase and an absent secret fail identically (`Header not found`) — the error does not reveal whether there was anything to find.

## Security properties

- **Authenticated encryption**: every secret carries an AES-256-GCM authentication tag — a tampered ciphertext or a wrong key fails to decrypt, it does not decrypt to garbage.
- **Plausible deniability**: headers, data and padding are mutually indistinguishable, so a block reveals nothing about how many secrets it holds beyond the first, which is always present.
- **Size uniformity**: headers and data are padded to fixed lengths, and the default `dataLength` reserves headroom beyond the first secret — size discloses neither count nor content.
- **Key separation**: header and data ciphertexts use independent HKDF subkeys, and each secret’s keys derive from its own passphrase.

## Known limitations

- The block is not authenticated as a whole: each secret’s data is protected by its authentication tag, but headers and padding are not. Tampering cannot forge or alter a secret, but it can make one unrecoverable — keep copies of a block if availability matters.
- Plausible deniability has a floor and a direction: every block provably holds at least one secret, so only the secrets beyond the first are deniable — and disclosing a later secret’s passphrase reveals, through its position, that one or more secrets precede it. Deniability is strongest when only the first secret is ever disclosed.
- Deniability covers the block, not its handling: passphrase management and the decision of what to disclose remain with the user.
- The KDF is injected, so the cost of brute-forcing passphrases is set by the caller’s choice, not by fixed-size encryption.
