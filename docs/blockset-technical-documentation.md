# Blockset technical documentation

## Abstract

A blockset splits a secret across several blocks using Shamir Secret Sharing (the open-source [sss](https://github.com/dsprenkels/sss-cli) tool), so any threshold of them reconstructs it while fewer reveal nothing. Each block is an ordinary block — encrypted using [Blockcrypt](https://github.com/superbacked/blockcrypt) and specified in the [block technical documentation](block-technical-documentation.md) — so a blockset keeps every property of a block while adding threshold recovery. This document covers the Superbacked-level design of a blockset.

## Introduction

Some secrets need to outlive you. A blockset splits a secret among the people you trust — a set of blocks — so no single person can recover it alone, but together the right group can recover what matters, even without you.

Any threshold of the blocks reconstructs the secret — for example, any two of three — while any smaller number reveals nothing. Each block is an ordinary block (see the [block technical documentation](block-technical-documentation.md)); a blockset distributes one share of the secret to each. Store the blocks in separate locations or hand them to separate people you trust — no single block, and no group below the threshold, can recover the secret.

## Terminology

- **Share**: one part of a secret produced by Shamir Secret Sharing; any `threshold` shares reconstruct the secret and any fewer reveal nothing.
- **Blockset**: a set of blocks that each carry one share of every secret, enabling threshold recovery.
- **Threshold**: the number of blocks required to reconstruct a secret (for example, 2 in a 2-of-3 blockset).
- **Shamir Secret Sharing**: a threshold scheme that splits a secret into `n` shares such that any `t` reconstruct it and any `t − 1` reveal nothing.

Block, secret and passphrase carry the same meaning as in the [block technical documentation](block-technical-documentation.md).

## How a blockset is created

When you create a blockset, the app:

1. Splits each secret into `n` shares with a recovery threshold of `t`, using Shamir Secret Sharing.
2. Assembles one block per share — block `i` carries the `i`-th share of every secret.
3. Encrypts and prints each block exactly like a single block (see the [block technical documentation](block-technical-documentation.md)).

The app offers three presets — 2-of-3, 3-of-5 and 4-of-7 (threshold-of-shares).

## Composition

The Shamir layer is Superbacked’s; the encryption of each block is Blockcrypt’s. For each secret, the app splits the message into `n` shares. It then assembles one block per share index: block `i` carries the `i`-th share of every secret, marked so restoration recognizes it as a share and encrypted under that secret’s passphrase like any other secret in a block.

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

The result is `n` blocks, each an ordinary block with the same plausible deniability as a single block. A block on its own carries one share per secret, which reveals nothing about any secret below the threshold — no secret can be reconstructed from fewer than `threshold` blocks, because Shamir shares below the threshold carry no information about the secret. There is no separate linking metadata to protect; the binding is a property of the shares themselves.

## Restoration

Each block is decrypted exactly as a single block (see [Restoration workflow](block-technical-documentation.md#restoration-workflow) in the block technical documentation). For a blockset, the decrypted message is a share rather than the secret. The app collects the share and, once a threshold of shares for that secret has been gathered from successive blocks, reconstructs the secret using Shamir Secret Sharing.

Below the threshold, reconstruction fails and you are prompted for the next block; a single block never yields the secret.

## Creation workflow

With the app in create mode:

1. Enter one or more secrets, each with its own passphrase and an optional label.
2. Select a blockset preset (2-of-3, 3-of-5 or 4-of-7).
3. Click the create button.
4. The app splits each secret, builds one block per share and prints each block.

## Restoration workflow

With the app in create mode:

1. Scan a block.
2. Enter a passphrase.
3. Click the restore button.
4. The app prompts for further blocks until a threshold has been scanned, then reconstructs and displays the secret.
