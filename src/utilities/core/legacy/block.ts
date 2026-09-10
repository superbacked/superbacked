import { legacyKdfProfile } from "@/src/shared/kdfProfiles"
import { Metadata } from "@/src/utilities/core/block"
import argon2 from "@/src/utilities/crypto/argon2"
import { decrypt } from "@/src/utilities/crypto/legacy/fixedSizeEncryption"

// The block scheme as shipped before version 2 — frozen forever and
// restoration-only, applying to blocks created with releases up to
// v1.12.1. A legacy block is a legacy fixed-size encryption payload
// (see src/utilities/crypto/legacy/fixedSizeEncryption.ts) whose iv and
// headers fields are how restoration tells the eras apart, and every
// one was created at legacy cost — the profile pin below is their
// compatibility contract, not a default. The scheme predates YubiKey
// protection, so no second factor exists to request. The current scheme
// lives in src/utilities/core/block.ts. Pinned against shipped
// artifacts by the legacy reference blocks (tests/fixtures/legacy/blocks).

// Legacy payloads carry iv and headers alongside salt and data — their
// presence is how restoration tells the formats apart (see
// src/handlers/restore.ts). The legacy block artifact’s wire format,
// parallel to Payload in src/utilities/core/block.ts
export interface LegacyPayload {
  salt: string
  iv: string
  headers: string
  data: string
  metadata: Metadata
}

/**
 * Decrypt one secret of a legacy block payload — headers locate secrets
 * and the key derivation function runs inside decryption, always at the
 * legacy profile. Subkey-mode decryption (v1.6.0 and later, blockcrypt
 * 0.0.1-beta.22) is tried first, falling back to legacy mode for blocks
 * created before HKDF subkeys (v1.5.1 and earlier)
 * @param passphrase memorized passphrase
 * @param salt block salt
 * @param iv header initialization vector
 * @param headers encrypted headers
 * @param data encrypted data
 * @returns message
 */
export const decryptLegacyBlock = async (
  passphrase: string,
  salt: Buffer,
  iv: Buffer,
  headers: Buffer,
  data: Buffer
): Promise<Buffer> => {
  const kdf = (kdfPassphrase: string, kdfSalt: string) =>
    argon2(kdfPassphrase, kdfSalt, legacyKdfProfile)
  return decrypt(passphrase, salt, iv, headers, data, kdf).catch(() =>
    // Try legacy mode (blocks created before HKDF subkeys)
    decrypt(passphrase, salt, iv, headers, data, kdf, true)
  )
}
