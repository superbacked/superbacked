import { createDecipheriv, hkdfSync } from "crypto"

// Legacy fixed-size encryption — the scheme blocks were built on before
// the current one, frozen forever and restoration-only: printed blocks
// in the wild must decrypt forever, and nothing creates new ones. It
// applies to blocks created with releases up to v1.12.1 — subkey mode
// from v1.6.0 (blockcrypt 0.0.1-beta.22) and legacy mode up to v1.5.1
// (blockcrypt 0.0.1-beta.21 and earlier, before HKDF subkeys). A block
// holds one or more secrets, each under its own passphrase, whose
// encrypted headers, encrypted data and random padding are
// indistinguishable from one another, providing plausible deniability.
// Formerly published as the standalone blockcrypt package (vendored at
// 0.0.1-beta.24, creation paths since removed). Pinned by the frozen
// blocks in tests/legacy/fixedSizeEncryption.test.ts and the published
// legacy reference blocks (tests/fixtures/legacy/blocks); the format is
// specified in docs/technical-documentation/legacy/fixed-size-encryption.md.

export type Kdf = (passphrase: string, salt: string) => Promise<Buffer>

/**
 * Decrypt secret of block
 * @param passphrase passphrase
 * @param salt salt
 * @param iv initialization vector
 * @param headers headers
 * @param data data
 * @param kdf key derivation function
 * @param legacyMode optional, disables use of HKDF subkeys (defaults to `false`)
 * @returns message
 */
export const decrypt = async (
  passphrase: string,
  salt: Buffer,
  iv: Buffer,
  headers: Buffer,
  data: Buffer,
  kdf: Kdf,
  legacyMode?: boolean
): Promise<Buffer> => {
  const key = await kdf(passphrase, salt.toString("base64"))
  let headerStart = 0
  let header: string | null = null
  while (headerStart < headers.length) {
    for (let headerEnd = headers.length; headerEnd > headerStart; headerEnd--) {
      try {
        const headersKey =
          legacyMode === true
            ? key
            : Buffer.from(hkdfSync("sha256", key, "", "headers", 32))
        const headersDecipher = createDecipheriv(
          "aes-256-cbc",
          Buffer.from(headersKey),
          iv
        )
        const headersDeciphered = headersDecipher.update(
          headers.subarray(headerStart, headerEnd)
        )
        const headerDecipheredFinal = Buffer.concat([
          headersDeciphered,
          headersDecipher.final(),
        ])
        const string = headerDecipheredFinal.toString()
        if (string.match(/^[0-9]+:[0-9]+$/)) {
          header = string
        }
        if (header) {
          break
        }
      } catch {
        // Not a decryptable header at this byte range — keep scanning
      }
    }
    if (header) {
      break
    }
    headerStart++
  }
  if (!header) {
    throw new Error("Header not found")
  }
  const [dataEncipheredFinalStart, dataEncipheredFinalLength] = header.split(
    ":"
  ) as [string, string]
  const dataEncipheredFinalEnd =
    parseInt(dataEncipheredFinalStart) + parseInt(dataEncipheredFinalLength)
  const dataEncipheredFinal = data.subarray(
    parseInt(dataEncipheredFinalStart),
    dataEncipheredFinalEnd
  )
  const dataKey =
    legacyMode === true
      ? key
      : Buffer.from(hkdfSync("sha256", key, "", "data", 32))
  const dataIvStart = dataEncipheredFinalEnd
  const dataIvEnd = dataIvStart + 12
  const dataIv = data.subarray(dataIvStart, dataIvEnd)
  const dataAuthTagStart = dataIvEnd
  const dataAuthTag = data.subarray(dataAuthTagStart, dataAuthTagStart + 16)
  const dataDecipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(dataKey),
    dataIv
  )
  dataDecipher.setAuthTag(dataAuthTag)
  const dataDeciphered = dataDecipher.update(dataEncipheredFinal)
  const dataDecipheredFinal = Buffer.concat([
    dataDeciphered,
    dataDecipher.final(),
  ])
  return dataDecipheredFinal
}
