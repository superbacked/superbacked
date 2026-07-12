# Blockset technical documentation

## Abstract

This document covers the Superbacked-level design of a blockset. A blockset encrypts a secret using a random encryption key — the Shamir key — and splits that key, not the secret, across several blocks using Shamir Secret Sharing (via [sss](https://github.com/dsprenkels/sss-cli)), so enough blocks reconstruct the secret while fewer reveal nothing. Each block is then encrypted (again) using [Blockcrypt](https://github.com/superbacked/blockcrypt), like the single block backup type (see the [block technical documentation](block-technical-documentation.md)) — so a blockset keeps every property of a block while adding threshold recovery.

## Introduction

Some secrets need to outlive you. A blockset splits a secret among the people you trust — a set of blocks — so no single person can recover it alone, but together the right group can recover what matters, even without you.

A blockset never splits the secret itself. The app creates a new random key — the Shamir key — encrypts the secret using it, and splits the key one share per block. Each block — carrying the whole encrypted secret and one share — is then encrypted again using Blockcrypt, exactly like any other block (see the [block technical documentation](block-technical-documentation.md)). Enough blocks — for example, any two of three — rebuild the key and unlock the secret, while any smaller number reveals nothing. Store the blocks in separate locations or hand them to separate people you trust — no single block, and no combination of blocks below the threshold, can recover the secret.

## Terminology

- **Blockset**: a set of blocks that each carry, for every secret, the encrypted secret and one share — enabling threshold recovery.
- **Shamir key**: the random encryption key that seals a secret (each secret of a blockset has its own) — Shamir Secret Sharing splits this key, not the secret.
- **Shamir Secret Sharing**: a scheme that splits a secret into a chosen number of shares, such that any threshold of them reconstructs it and any fewer reveal nothing.
- **Share**: one of the parts the Shamir key is split into — any threshold of shares rebuilds the key, and any fewer — even one short of the threshold — reveal nothing about it.
- **Threshold**: the number of blocks required to reconstruct a secret (for example, 2 in a 2-of-3 blockset).

Block, secret, hidden secret and passphrase carry the same meaning as in the [block technical documentation](block-technical-documentation.md).

## How a blockset is created

When you create a blockset, the app:

1. Encrypts each secret using a new random key — the Shamir key.
2. Splits the Shamir key into shares using Shamir Secret Sharing.
3. Assembles one block per share — each block carries, for every secret, the encrypted secret together with one share.
4. Encrypts and outputs each block exactly like a single block (see the [block technical documentation](block-technical-documentation.md)).

The app offers three blockset backup types — 2-of-3, 3-of-5 and 4-of-7 (threshold-of-blocks).

## Composition

Two layers of encryption wrap every secret in a blockset — like the layers of an onion, applied one after the other:

1. **sss encrypts the secret and splits the key.** sss creates a new random key — the Shamir key — encrypts the secret using it and splits the key into shares, one per block.
2. **Blockcrypt encrypts every block.** Each block — carrying the encrypted secret and one share, marked so restoration knows it belongs to a blockset — is encrypted under the secret’s passphrase, exactly like a single block.

When a blockset holds several secrets, each block carries the encrypted secret and one share of every secret.

```typescript
for (const secret of secrets) {
  const shares = await generateShares(secret.message, numberOfShares, threshold)
  for (const [index, share] of shares.entries()) {
    shamirBlockcryptSecrets[index] ??= []
    shamirBlockcryptSecrets[index].push({
      message: Buffer.concat([Buffer.from("shamir:"), share]),
      passphrase: secret.passphrase,
    })
  }
}
```

Encrypting twice is what gives a blockset its guarantees. Blocks and blocksets yield blocks that are indistinguishable from each other: the outer layer is always Blockcrypt, so from the outside nothing tells a block of a blockset apart from any other block. And recovery is gated twice: a valid passphrase opens a block, and when the block belongs to a blockset, the secret stays sealed until enough blocks meet the threshold and rebuild the Shamir key — a requirement enforced by the encryption itself, not by policy. There is no separate linking metadata to protect — what binds the blocks of a blockset together is the shares themselves.

## Restoration

Restoration peels the two layers in reverse order. Each block is decrypted exactly as a single block (see [Restoration workflow](block-technical-documentation.md#restoration-workflow) in the block technical documentation): the passphrase opens the block and yields the encrypted secret and one share rather than the secret itself. The app collects shares block by block; once the threshold is met, they are used to rebuild the Shamir key and the app decrypts the secret.

Below the threshold, reconstruction fails and you are prompted for the next block; a single block never yields the secret.

## Creation workflow

With the app in create mode:

1. Select a blockset backup type (2-of-3, 3-of-5 or 4-of-7).
2. Enter a secret, its passphrase and an optional label.
3. Optionally, click the add hidden secret button to add a second or third secret, each with its own passphrase.
4. Click the create button.
5. The app creates the shares, assembles one block per share and asks the user to print each block or save it as a JPG or PDF file.

## Restoration workflow

With the app in restore mode:

1. Scan a block.
2. Enter a passphrase.
3. Click the unlock button.
4. The app prompts for further blocks until the threshold is met, then reconstructs the secret and asks whether to copy or show it.
