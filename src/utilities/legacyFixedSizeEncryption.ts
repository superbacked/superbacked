import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto"

// Legacy fixed-size encryption — encrypts one or more secrets, each using
// its own passphrase, into a fixed-size block whose encrypted headers,
// encrypted data and random padding are indistinguishable from one another,
// providing plausible deniability. Formerly published as the standalone
// blockcrypt package (vendored at 0.0.1-beta.24). The format is frozen —
// printed blocks in the wild must decrypt forever — and pinned by the
// reference vectors in tests/legacyFixedSizeEncryption.test.ts; the design
// is specified in docs/fixed-size-encryption-technical-documentation.md.
// Superseded for new blocks by fixedSizeEncryption.ts.

export type Message = Buffer | string

export interface Secret {
  message: Message
  passphrase: string
}

export type Kdf = (passphrase: string, salt: string) => Promise<Buffer>

export interface Block {
  salt: Buffer
  iv: Buffer
  headers: Buffer
  data: Buffer
}

const validateSecrets = (secrets: Secret[]) => {
  if (!(secrets instanceof Array) || secrets.length === 0) {
    return false
  }
  for (const secret of secrets) {
    if (!secret.message || !secret.passphrase) {
      return false
    }
  }
  return true
}

/**
 * Get data length of message
 * @param message message
 * @returns data length in bytes
 */
export const getDataLength = (message: Message) => {
  const key = randomBytes(32)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const enciphered = cipher.update(message)
  const encipheredFinal = Buffer.concat([enciphered, cipher.final()])
  const authTag = cipher.getAuthTag()
  const buffer = Buffer.concat([encipheredFinal, iv, authTag])
  return buffer.length
}

/**
 * Encrypt secrets into block
 * @param secrets secrets
 * @param kdf key derivation function
 * @param headersLength optional, headers length in increments of `16` bytes (defaults to `64`)
 * @param dataLength optional, data length in increments of `16` bytes (defaults to first secret ciphertext buffer length * 2 rounded to nearest upper increment of `64` bytes)
 * @param salt optional, salt used for deterministic unit tests
 * @param iv optional, initialization vector used for deterministic unit tests
 * @param legacyMode optional, disables use of HKDF subkeys (defaults to `false`)
 * @returns block
 */
export const encrypt = async (
  secrets: Secret[],
  kdf: Kdf,
  headersLength?: number | null,
  dataLength?: number | null,
  salt?: Buffer,
  iv?: Buffer,
  legacyMode?: boolean
): Promise<Block> => {
  if (!validateSecrets(secrets)) {
    throw new Error("Invalid secrets")
  }
  if (
    headersLength === undefined ||
    headersLength === null ||
    headersLength === 0
  ) {
    headersLength = 64
  } else if (headersLength % 16 !== 0) {
    throw new Error("Invalid headers length")
  }
  if (dataLength && dataLength % 16 !== 0) {
    throw new Error("Invalid data length")
  }
  salt ??= randomBytes(16)
  iv ??= randomBytes(16)
  const headersBuffers: Buffer[] = []
  const dataBuffers: Buffer[] = []
  let dataStart = 0
  for (const [index, secret] of secrets.entries()) {
    const key = await kdf(secret.passphrase, salt.toString("base64"))
    const dataKey =
      legacyMode === true
        ? key
        : Buffer.from(hkdfSync("sha256", key, "", "data", 32))
    const dataIv = randomBytes(12)
    const dataCipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(dataKey),
      dataIv
    )
    const dataEnciphered = dataCipher.update(secret.message)
    const dataEncipheredFinal = Buffer.concat([
      dataEnciphered,
      dataCipher.final(),
    ])
    const dataAuthTag = dataCipher.getAuthTag()
    const dataEncipheredFinalLength = dataEncipheredFinal.length
    const headersKey =
      legacyMode === true
        ? key
        : Buffer.from(hkdfSync("sha256", key, "", "headers", 32))
    const headersCipher = createCipheriv(
      "aes-256-cbc",
      Buffer.from(headersKey),
      iv
    )
    const headersEnciphered = headersCipher.update(
      `${dataStart}:${dataEncipheredFinalLength}`
    )
    const headersEncipheredFinal = Buffer.concat([
      headersEnciphered,
      headersCipher.final(),
    ])
    headersBuffers.push(headersEncipheredFinal)
    const dataBuffer = Buffer.concat([dataEncipheredFinal, dataIv, dataAuthTag])
    dataBuffers.push(dataBuffer)
    dataStart += dataBuffer.length
    if (!dataLength && index === 0) {
      dataLength = Math.ceil((dataBuffer.length * 2) / 64) * 64
    }
  }
  if (!dataLength) {
    throw new Error("Invalid data length")
  }
  let data = Buffer.concat(dataBuffers)
  const unpaddedDataLength = data.length
  if (unpaddedDataLength > dataLength) {
    throw new Error("Data too long for data length")
  }
  dataBuffers.push(randomBytes(dataLength - unpaddedDataLength))
  data = Buffer.concat(dataBuffers)
  let headers = Buffer.concat(headersBuffers)
  const unpaddedHeadersLength = headers.length
  if (unpaddedHeadersLength > headersLength) {
    throw new Error("Headers too long for headers length")
  }
  headersBuffers.push(randomBytes(headersLength - unpaddedHeadersLength))
  headers = Buffer.concat(headersBuffers)
  return {
    salt: salt,
    iv: iv,
    headers: headers,
    data: data,
  }
}

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
