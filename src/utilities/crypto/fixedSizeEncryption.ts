import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "crypto"

// Fixed-size encryption — encrypts one or more secrets, each using its own
// 256-bit key, into a block of the requested size. AES-256-GCM only, no
// headers: each secret occupies iv (12 bytes), masked ciphertext length
// (2 bytes), ciphertext and authentication tag (16 bytes) — 30 bytes of
// overhead — and unused space is filled with random padding, so a block
// reveals nothing about how many secrets it holds or where they sit.
//
// Two HKDF-SHA256 subkeys are derived from each secret’s key — one keying
// the length mask, one keying AES-256-GCM — so the two primitives never
// share a key. The length is masked by XOR with a PRF of the length subkey
// and iv (HMAC-SHA256), making it indistinguishable from random data
// without the key while sparing decryption a search over lengths:
// decryption slides over every byte offset, unmasks the candidate length,
// bounds-checks it and attempts authenticated decryption — the tag rejects
// false candidates, costing O(block size) cheap attempts worst case.
//
// The format is frozen — blocks in the wild must decrypt forever.

export type Message = Buffer | string

export interface Secret {
  key: Buffer
  message: Message
}

const keyLength = 32
const ivLength = 12
const maskedLengthLength = 2
const tagLength = 16

// Space a secret occupies beyond its message: iv, masked length and tag
export const secretOverhead = ivLength + maskedLengthLength + tagLength

const maximumMessageLength = 0xffff

// Independent subkeys for the length mask and the ciphertext (the legacy
// scheme’s HKDF subkey pattern) — subkeys depend only on the secret’s key,
// so decryption derives them once, not per scanned offset
const deriveSubkeys = (key: Buffer): { lengthKey: Buffer; dataKey: Buffer } => {
  return {
    lengthKey: Buffer.from(hkdfSync("sha256", key, "", "length", 32)),
    dataKey: Buffer.from(hkdfSync("sha256", key, "", "data", 32)),
  }
}

// PRF masking the ciphertext length — 2 bytes of HMAC-SHA256(lengthKey, iv)
const lengthMask = (lengthKey: Buffer, iv: Buffer): number =>
  createHmac("sha256", lengthKey).update(iv).digest().readUInt16BE(0)

const validateKey = (key: Buffer): void => {
  if (Buffer.isBuffer(key) === false || key.length !== keyLength) {
    throw new Error(`Key must be ${keyLength} bytes`)
  }
}

/**
 * Get length message occupies in block
 * @param message message
 * @returns length in bytes
 */
export const getDataLength = (message: Message): number => {
  return Buffer.from(message).length + secretOverhead
}

/**
 * Encrypt secrets into block of given size
 * @param secrets secrets (each a 256-bit key and message)
 * @param blockSize block size in bytes
 * @returns block
 */
export const encrypt = (secrets: Secret[], blockSize: number): Buffer => {
  if (!(secrets instanceof Array) || secrets.length === 0) {
    throw new Error("Invalid secrets")
  }
  if (Number.isInteger(blockSize) === false || blockSize < secretOverhead) {
    throw new Error("Invalid block size")
  }
  for (const secret of secrets) {
    validateKey(secret.key)
  }
  // Decryption returns the first entry a key authenticates, so a
  // duplicate key would leave every later secret sharing it unreachable —
  // written but permanently lost. Rejected at creation, the only moment
  // the loss is preventable
  for (const [index, secret] of secrets.entries()) {
    for (const other of secrets.slice(index + 1)) {
      if (secret.key.equals(other.key)) {
        throw new Error("Duplicate key")
      }
    }
  }
  const entries: Buffer[] = []
  let entriesLength = 0
  for (const secret of secrets) {
    const message = Buffer.from(secret.message)
    if (message.length > maximumMessageLength) {
      throw new Error("Message too long")
    }
    const { lengthKey, dataKey } = deriveSubkeys(secret.key)
    const iv = randomBytes(ivLength)
    const cipher = createCipheriv("aes-256-gcm", dataKey, iv)
    const ciphertext = Buffer.concat([cipher.update(message), cipher.final()])
    const maskedLength = Buffer.alloc(maskedLengthLength)
    maskedLength.writeUInt16BE(ciphertext.length ^ lengthMask(lengthKey, iv))
    const entry = Buffer.concat([
      iv,
      maskedLength,
      ciphertext,
      cipher.getAuthTag(),
    ])
    entries.push(entry)
    entriesLength += entry.length
  }
  if (entriesLength > blockSize) {
    throw new Error("Secrets too long for block size")
  }
  entries.push(randomBytes(blockSize - entriesLength))
  return Buffer.concat(entries)
}

/**
 * Decrypt secret of block
 * @param key 256-bit key
 * @param block block
 * @returns message
 */
export const decrypt = (key: Buffer, block: Buffer): Buffer => {
  validateKey(key)
  const { lengthKey, dataKey } = deriveSubkeys(key)
  for (let offset = 0; offset + secretOverhead <= block.length; offset++) {
    const iv = block.subarray(offset, offset + ivLength)
    const ciphertextLength =
      block.readUInt16BE(offset + ivLength) ^ lengthMask(lengthKey, iv)
    const ciphertextStart = offset + ivLength + maskedLengthLength
    const tagStart = ciphertextStart + ciphertextLength
    if (tagStart + tagLength > block.length) {
      continue
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", dataKey, iv)
      decipher.setAuthTag(block.subarray(tagStart, tagStart + tagLength))
      const message = Buffer.concat([
        decipher.update(block.subarray(ciphertextStart, tagStart)),
        decipher.final(),
      ])
      return message
    } catch {
      // Authentication failed — not this key’s secret at this offset
    }
  }
  throw new Error("Secret not found")
}
