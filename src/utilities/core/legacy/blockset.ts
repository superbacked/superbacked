import { isUtf8 } from "buffer"

// The blockset scheme as shipped before version 2 — frozen forever and
// restoration-only, applying to blocksets created with releases up to
// v1.12.1. Legacy blockset shares are marked with a plaintext prefix
// inside the legacy fixed-size encryption message (see
// src/utilities/crypto/legacy/fixedSizeEncryption.ts) rather than a
// domain key — the convention this module classifies. The current
// scheme lives in src/utilities/core/blockset.ts, where shares are
// recognized by which key authenticates instead. Pinned against shipped
// artifacts by the legacy reference blockset
// (tests/fixtures/legacy/blocks/blockset).

// A share is a keyshare (33 bytes), ciphertext (at least 1 byte) and
// authentication tag (16 bytes) — anything shorter cannot be one
const minimumShareLength = 50

const shamirPrefix = Buffer.from("shamir:")

/**
 * Classify a message decrypted from a legacy block, where blockset
 * shares carry a “shamir:” prefix. The prefix alone cannot classify — a
 * plain secret may start with it. Plain messages are UTF-8-encoded
 * strings by contract while shares are effectively random bytes, so a
 * share must also be share-shaped: long enough and not valid UTF-8
 * @param message decrypted message
 * @returns the share, or `null` for a plain secret
 */
export const classifyPrefixedShare = (message: Buffer): null | Buffer => {
  if (
    Buffer.compare(message.subarray(0, shamirPrefix.length), shamirPrefix) !== 0
  ) {
    return null
  }
  const candidate = message.subarray(shamirPrefix.length)
  if (candidate.length < minimumShareLength || isUtf8(candidate) === true) {
    return null
  }
  return candidate
}
