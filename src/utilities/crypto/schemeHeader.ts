import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

// The scheme header every v2 artifact carries under encryption:
// [magic (4 bytes)][version (1 byte)][reserved (3 bytes, zero)]. It never
// appears on disk in plaintext — blocks prepend it to the payload before
// encryption while standalone and detached archives encrypt it in a
// probe block — so artifacts stay indistinguishable from random.
// Decrypting it with a candidate key answers three questions at once:
// the key is correct, the profile that stretched it (if any) is the
// artifact's, and the version names the layout. Legacy v1 artifacts are
// simply the ones no candidate reveals a header in.

// Thrown when a decrypted header declares a version this build does not
// implement — the passphrase is correct and the artifact is intact, so
// the failure must never read as either
export class UnsupportedVersionError extends Error {}

// Frozen forever, and deliberately version-free: a constant magic is what
// lets an old app recognize an artifact from a newer version and report
// it as such instead of misreporting a wrong passphrase
export const schemeHeaderMagic = Buffer.from("sbck", "ascii")

export const schemeHeaderLength = 8

// Reserved bytes are zero until a future version assigns them — they can
// only ever carry post-decryption parameters (compression, layout
// tweaks), never KDF parameters, which the key needed to read them
// already implies
const reservedLength = 3

/**
 * Encode a scheme header
 * @param version scheme version (1-255)
 * @returns 8-byte header
 */
export const encodeSchemeHeader = (version: number): Buffer => {
  if (Number.isInteger(version) === false || version < 1 || version > 255) {
    throw new Error(`Invalid scheme version: ${version}`)
  }
  return Buffer.concat([
    schemeHeaderMagic,
    Buffer.from([version]),
    Buffer.alloc(reservedLength),
  ])
}

/**
 * Decode a scheme header
 * @param header candidate 8-byte header (typically just decrypted)
 * @returns scheme version, or `null` when the bytes are not a header —
 * wrong length, wrong magic or nonzero reserved bytes
 */
export const decodeSchemeHeader = (header: Buffer): null | number => {
  if (header.length !== schemeHeaderLength) {
    return null
  }
  if (header.subarray(0, 4).equals(schemeHeaderMagic) === false) {
    return null
  }
  const version = header.readUInt8(4)
  if (version === 0) {
    return null
  }
  if (header.subarray(5).equals(Buffer.alloc(reservedLength)) === false) {
    return null
  }
  return version
}

const probeIvLength = 12
const probeTagLength = 16

// [probe iv (12)][encrypted scheme header (8)][probe tag (16)]
export const probeBlockLength =
  probeIvLength + schemeHeaderLength + probeTagLength

/**
 * Encrypt the scheme header into a probe block
 * @param probeKey 32-byte probe key
 * @param version scheme version to declare
 * @returns probe block
 */
export const encodeProbeBlock = (probeKey: Buffer, version: number): Buffer => {
  const iv = randomBytes(probeIvLength)
  const cipher = createCipheriv("aes-256-gcm", probeKey, iv)
  const encryptedHeader = Buffer.concat([
    cipher.update(encodeSchemeHeader(version)),
    cipher.final(),
  ])
  return Buffer.concat([iv, encryptedHeader, cipher.getAuthTag()])
}

/**
 * Try a probe key against a probe block — the version trial at the heart
 * of restoration. A match simultaneously confirms the key and the
 * declared version; a miss is indistinguishable from random bytes, so
 * headerless v1 artifacts and wrong keys land in the same place
 * @param probeKey 32-byte candidate probe key
 * @param probeBlock candidate probe block
 * @returns declared scheme version, or `null` when the key reveals no
 * header
 */
export const decodeProbeBlock = (
  probeKey: Buffer,
  probeBlock: Buffer
): null | number => {
  if (probeBlock.length !== probeBlockLength) {
    return null
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      probeKey,
      probeBlock.subarray(0, probeIvLength)
    )
    decipher.setAuthTag(probeBlock.subarray(probeIvLength + schemeHeaderLength))
    const header = Buffer.concat([
      decipher.update(
        probeBlock.subarray(probeIvLength, probeIvLength + schemeHeaderLength)
      ),
      decipher.final(),
    ])
    return decodeSchemeHeader(header)
  } catch {
    return null
  }
}
