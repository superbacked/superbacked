# Fixed-size encryption technical documentation

## Abstract

This document specifies the cryptographic design and implementation of fixed-size encryption — the primitive behind blocks. Fixed-size encryption encrypts one or more secrets into a fixed-size block whose every byte is indistinguishable from random, providing plausible deniability. The sources ([src/utilities/fixedSizeEncryption.ts](../src/utilities/fixedSizeEncryption.ts) and [src/utilities/legacyFixedSizeEncryption.ts](../src/utilities/legacyFixedSizeEncryption.ts)) are the ground truth for this document, and the reference vectors in [tests/fixedSizeEncryption.test.ts](../tests/fixedSizeEncryption.test.ts) and [tests/legacyFixedSizeEncryption.test.ts](../tests/legacyFixedSizeEncryption.test.ts) pin the formats.

Two schemes are specified: the [current scheme](#current-scheme) (AES-256-GCM only, headerless, caller-supplied 256-bit keys), used for every new block and the legacy scheme, used by blocks created before it — which must decrypt forever.

## Introduction

Superbacked is a secret management platform used to back up and pass on sensitive data such as BIP39 mnemonics, master passwords and TOTP secrets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Fixed-size encryption is the primitive every block is built on. A block encrypted using it reveals only its size. Every byte — headers, data and padding — is either ciphertext or random, so the number of secrets, their sizes and their boundaries cannot be determined. Only the first secret is expected — every block holds at least one — so plausible deniability covers the secrets beyond it: additional secrets are concealed in the padding, and without their passphrases, no one can tell whether they exist at all. Decrypting the first secret reveals nothing about the others; decrypting a later secret reveals that one or more secrets precede it in the block — though nothing more, nor whether more secrets exist.

## Terminology

- **Block**: the output of encryption — salt, initialization vector, headers and data — carried in the JSON payload a Superbacked block’s QR code encodes (see the [block technical documentation](block-technical-documentation.md)).
- **Data**: the concatenated ciphertexts of all secrets, followed by random padding.
- **Entry**: one secret’s region of a current-scheme block — initialization vector, masked length, ciphertext and authentication tag.
- **Header**: an encrypted `start:length` pointer that locates one secret’s ciphertext within data.
- **KDF**: the caller-supplied key derivation function mapping a passphrase and salt to a 32-byte key.
- **Legacy mode**: a compatibility mode for blocks created before HKDF subkeys were introduced.
- **Secret**: a message and the passphrase that protects it (the current scheme pairs a message with a caller-supplied 256-bit key instead — see [src/utilities/fixedSizeEncryption.ts](../src/utilities/fixedSizeEncryption.ts)).

## Current scheme

New blocks are encrypted using the current scheme — AES-256-GCM only, headerless and keyed by the caller. The remaining sections specify the legacy scheme.

### Format

A block is a single buffer of the caller-requested size. Each secret occupies one entry; entries are concatenated from the start of the block and unused space is filled with random padding, so a block reveals nothing about how many secrets it holds or where they sit.

| Field           | Size           | Content                                                                  |
| --------------- | -------------- | ------------------------------------------------------------------------ |
| `iv`            | 12 bytes       | Random; initialization vector for AES-256-GCM.                           |
| `masked length` | 2 bytes        | Ciphertext length, masked by XOR with a PRF of the length subkey and iv. |
| `ciphertext`    | message length | AES-256-GCM-encrypted message.                                           |
| `tag`           | 16 bytes       | AES-256-GCM authentication tag.                                          |

An entry occupies its message length plus 30 bytes of overhead (`secretOverhead`); messages may be at most 65535 bytes. Encryption fails loudly when entries exceed the block size, and the `getDataLength` helper returns the space a message occupies (its length plus `secretOverhead`) so callers can measure before encrypting. Superbacked sets the block size to 768 bytes, bounded by QR code capacity (see [src/utilities/block.ts](../src/utilities/block.ts)).

### Key derivation

The scheme does not bundle a KDF — the caller supplies a 256-bit key per secret, and its strength is the caller’s responsibility. Superbacked derives keys from passphrases using Argon2d followed by the backup type’s HKDF domain key (see the [block technical documentation](block-technical-documentation.md)).

Two subkeys are derived from each secret’s key using HKDF-SHA256 with an empty salt: one with info `length` keying the length mask, one with info `data` keying AES-256-GCM — so the two primitives never share a key. The info strings are frozen format constants. Subkeys depend only on the secret’s key, so decryption derives them once, not per scanned offset.

### Length masking

The ciphertext length is masked by XOR with the first 2 bytes of the HMAC-SHA256 of the initialization vector under the length subkey, making it indistinguishable from random without the key while sparing decryption a search over lengths.

### Encryption

For each secret:

1. Derive the length and data subkeys from its key (see [Key derivation](#key-derivation)).
2. Encrypt the message using AES-256-GCM with the data subkey and a fresh random 12-byte initialization vector.
3. Mask the ciphertext length (see [Length masking](#length-masking)).
4. Append the entry — initialization vector, masked length, ciphertext, authentication tag — to the block.

Entries are concatenated and the block is padded to the requested size with random bytes.

### Decryption

Decryption takes a single key, derives its subkeys once and slides over every byte offset of the block: unmask the candidate length at the offset, bounds-check it and attempt authenticated decryption — the authentication tag rejects false candidates, costing O(block size) cheap attempts worst case. A wrong key and an absent secret fail identically (`Secret not found`) — the error does not reveal whether there was anything to find.

### Security properties

- **Authenticated encryption**: every secret carries an AES-256-GCM authentication tag — a tampered ciphertext or a wrong key fails to decrypt, it does not decrypt to garbage.
- **Plausible deniability**: a block has no headers — every byte is an initialization vector, masked length, ciphertext, authentication tag or random padding, all indistinguishable from random, so a block reveals nothing about how many secrets it holds beyond the first, which is always present.
- **Size uniformity**: every block is padded to the same size, so its size reveals nothing about how much it holds.
- **Key separation**: the length mask and the cipher use independent HKDF subkeys, and each secret has its own caller-supplied key.

### Known limitations

- The block is not authenticated as a whole: each secret’s entry is protected by its authentication tag, but padding is not. Tampering cannot forge or alter a secret, but it can make one unrecoverable — keep copies of a block if availability matters.
- Plausible deniability has a floor and a direction: every block provably holds at least one secret, so only the secrets beyond the first are deniable — and disclosing a later secret’s passphrase reveals, through its entry’s position (recoverable with its key), that one or more secrets precede it. Deniability is strongest when only the first secret is ever disclosed.
- Deniability covers the block, not its handling: passphrase management and the decision of what to disclose remain with the user.
- The KDF is injected, so the cost of brute-forcing passphrases is set by the caller’s choice, not by fixed-size encryption.

## Block format

| Field     | Size                                                   | Content                                                                                                                                                               |
| --------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `salt`    | 16 bytes                                               | Random; passed to the KDF alongside each passphrase.                                                                                                                  |
| `iv`      | 16 bytes                                               | Random; initialization vector for header encryption.                                                                                                                  |
| `headers` | `headersLength` bytes (multiple of 16, defaults to 64) | One AES-256-CBC-encrypted header per secret, padded to `headersLength` with random bytes.                                                                             |
| `data`    | `dataLength` bytes (multiple of 16)                    | One AES-256-GCM-encrypted message per secret, followed by its 12-byte initialization vector and 16-byte authentication tag, padded to `dataLength` with random bytes. |

The lengths set a block’s capacity: each encrypted header occupies 16 bytes (32 when its `start:length` pointer runs past 15 characters), so the default 64-byte headers hold up to four secrets (Superbacked uses 48-byte headers, holding up to three). When `dataLength` is not set, it defaults to twice the length the first secret occupies in data, rounded up to the next multiple of 64 bytes — a block holding one secret reserves room for more, so its size does not disclose that nothing is hidden. Encryption fails loudly when secrets exceed either length. The `getDataLength` helper returns the length a message will occupy in data so callers can determine `dataLength` before encrypting.

## Key derivation

Fixed-size encryption does not bundle a KDF — the caller supplies one with the signature `(passphrase, salt) → 32-byte key`, and its strength (memory-hardness, parameters) is the caller’s responsibility. Superbacked supplies Argon2d (see the [block technical documentation](block-technical-documentation.md)).

For each secret, the KDF derives a key from its passphrase and the block’s salt (base64-encoded). Two subkeys are then derived from it using HKDF-SHA256: one with info `headers` encrypting the secret’s header, one with info `data` encrypting the secret’s message — so header and data ciphertexts never share a key. In legacy mode the KDF output is used directly as both keys.

## Encryption

For each secret:

1. Derive the header and data keys from its passphrase (see [Key derivation](#key-derivation-1)).
2. Encrypt the message using AES-256-GCM with the data key and a fresh random 12-byte initialization vector.
3. Append the secret’s data entry — ciphertext, initialization vector, authentication tag — to data.
4. Encrypt the pointer `start:length` (the ciphertext’s offset within data and its length) using AES-256-CBC with the header key and the block’s initialization vector, and append it to headers.

Headers and data are then padded to their configured lengths with random bytes, and the block — salt, initialization vector, headers, data — is returned.

## Decryption

Decryption takes a single passphrase and scans for a header it can decrypt: every contiguous byte range of headers is tried until one decrypts — under the passphrase’s header key — to a plaintext matching `start:length`. No slot index or count is stored anywhere; a header is found by successfully decrypting it, or it does not exist as far as that passphrase can tell.

The pointer locates the secret’s ciphertext within data, the initialization vector and authentication tag follow it and the message is decrypted and verified using AES-256-GCM. A wrong passphrase and an absent secret fail identically (`Header not found`) — the error does not reveal whether there was anything to find.

## Security properties

- **Authenticated encryption**: every secret carries an AES-256-GCM authentication tag — a tampered ciphertext or a wrong key fails to decrypt, it does not decrypt to garbage.
- **Plausible deniability**: headers, data and padding are mutually indistinguishable, so a block reveals nothing about how many secrets it holds beyond the first, which is always present. Revealing a secret’s passphrase proves nothing about any secret that follows it; a later secret’s position reveals only that one or more secrets precede it.
- **Size uniformity**: headers and data are padded to fixed lengths, and the default `dataLength` reserves headroom beyond the first secret — size discloses neither count nor content.
- **Key separation**: header and data ciphertexts use independent HKDF subkeys, and each secret’s keys derive from its own passphrase.

## Known limitations

- The block is not authenticated as a whole: each secret’s data is protected by its authentication tag, but headers and padding are not. Tampering cannot forge or alter a secret, but it can make one unrecoverable — keep copies of a block if availability matters.
- Plausible deniability has a floor and a direction: every block provably holds at least one secret, so only the secrets beyond the first are deniable — and disclosing a later secret’s passphrase reveals, through its position, that one or more secrets precede it. Deniability is strongest when only the first secret is ever disclosed.
- Deniability covers the block, not its handling: passphrase management and the decision of what to disclose remain with the user.
- The KDF is injected, so the cost of brute-forcing passphrases is set by the caller’s choice, not by fixed-size encryption.
