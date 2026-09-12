import assert from "assert"
import { createDecipheriv, createHmac, hkdfSync, randomBytes } from "crypto"
import { suite, test } from "node:test"

import {
  Secret,
  decrypt,
  encrypt,
  getDataLength,
  secretOverhead,
} from "@/src/utilities/crypto/fixedSizeEncryption"

const blockSize = 512

const newSecret = (message: Buffer | string): Secret => {
  return {
    key: randomBytes(32),
    message: message,
  }
}

// Reference vector pins the format — this exact block must decrypt forever
// (generated once with encrypt([{ key: Buffer.alloc(32, 1), message: "yo" }],
// 64))
const referenceKey = Buffer.alloc(32, 1)
const referenceBlockHex =
  "3b94efe4bd521643551f13c2005e1a8b50f27eeafd091738dc4733e94137925fe93c953727f5230e15fbb322368e63189e231774eafa9b501d6a17ff09c383de"

suite("fixedSizeEncryption", () => {
  test("freezes secret overhead", () => {
    assert.strictEqual(secretOverhead, 30)
  })

  test("gets data length of message as string", () => {
    assert.strictEqual(getDataLength("yo"), 2 + secretOverhead)
  })

  test("gets data length of message as buffer", () => {
    assert.strictEqual(getDataLength(Buffer.from("yo")), 2 + secretOverhead)
  })

  test("encrypts secret and decrypts it", () => {
    const secret = newSecret("this is a test\nyo")
    const block = encrypt([secret], blockSize)
    assert.strictEqual(block.length, blockSize)
    assert.strictEqual(
      decrypt(secret.key, block).toString(),
      secret.message.toString()
    )
  })

  test("encrypts empty message and decrypts it", () => {
    const secret = newSecret(Buffer.alloc(0))
    const block = encrypt([secret], blockSize)
    assert.deepStrictEqual(decrypt(secret.key, block), Buffer.alloc(0))
  })

  test("encrypts secrets and decrypts each using its own key", () => {
    const secrets = [
      newSecret(
        "trust vast puppy supreme public course output august glimpse reunion kite rebel virus tail pass enhance divorce whip edit skill dismiss alpha divert ketchup"
      ),
      newSecret("this is a test\nyo"),
      newSecret(Buffer.from("yo")),
    ]
    const block = encrypt(secrets, blockSize)
    assert.strictEqual(block.length, blockSize)
    for (const secret of secrets) {
      assert.deepStrictEqual(
        decrypt(secret.key, block),
        Buffer.from(secret.message)
      )
    }
  })

  test("packs as many secrets as fit in block size", () => {
    const message = "yo"
    const count = Math.floor(blockSize / getDataLength(message))
    const secrets: Secret[] = []
    for (let index = 0; index < count; index++) {
      secrets.push(newSecret(message))
    }
    const block = encrypt(secrets, blockSize)
    assert.strictEqual(block.length, blockSize)
    for (const secret of secrets) {
      assert.strictEqual(decrypt(secret.key, block).toString(), message)
    }
  })

  test("fails to encrypt no secrets", () => {
    assert.throws(() => encrypt([], blockSize), { message: "Invalid secrets" })
  })

  test("fails to encrypt secret using invalid key", () => {
    assert.throws(
      () => encrypt([{ key: randomBytes(16), message: "yo" }], blockSize),
      { message: "Key must be 32 bytes" }
    )
  })

  test("fails to encrypt secrets using invalid block size", () => {
    assert.throws(() => encrypt([newSecret("yo")], 16), {
      message: "Invalid block size",
    })
  })

  test("fails to encrypt secrets using non-integer block size", () => {
    assert.throws(() => encrypt([newSecret("yo")], 512.5), {
      message: "Invalid block size",
    })
  })

  test("fails to encrypt secret using non-buffer key", () => {
    assert.throws(
      // @ts-expect-error invalid key shape
      () => encrypt([{ key: "0".repeat(64), message: "yo" }], blockSize),
      { message: "Key must be 32 bytes" }
    )
  })

  test("fails to encrypt secrets sharing a key", () => {
    const key = randomBytes(32)
    assert.throws(
      () =>
        encrypt(
          [
            { key: key, message: "yo" },
            { key: key, message: "lo" },
          ],
          blockSize
        ),
      { message: "Duplicate key" }
    )
  })

  test("fails to encrypt secrets that do not fit in block size", () => {
    const secrets = [newSecret(randomBytes(256)), newSecret(randomBytes(256))]
    assert.throws(() => encrypt(secrets, blockSize), {
      message: "Secrets too long for block size",
    })
  })

  test("fails to encrypt message that is too long", () => {
    assert.throws(() => encrypt([newSecret(randomBytes(65536))], 131072), {
      message: "Message too long",
    })
  })

  test("encrypts maximum length message and decrypts it", () => {
    const secret = newSecret(randomBytes(65535))
    const block = encrypt([secret], 65535 + secretOverhead)
    assert.deepStrictEqual(decrypt(secret.key, block), secret.message)
  })

  test("fails to decrypt tampered block", () => {
    const secret = newSecret("this is a test\nyo")
    const block = encrypt([secret], blockSize)
    // Flip one ciphertext byte — authenticated encryption must reject the
    // block, not decrypt it to garbage
    block.writeUInt8(block.readUInt8(14) ^ 0x01, 14)
    assert.throws(() => decrypt(secret.key, block), {
      message: "Secret not found",
    })
  })

  test("fails to decrypt using wrong key", () => {
    const secret = newSecret("this is a test\nyo")
    const block = encrypt([secret], blockSize)
    assert.throws(() => decrypt(randomBytes(32), block), {
      message: "Secret not found",
    })
  })

  test("fails to decrypt using invalid key", () => {
    const secret = newSecret("yo")
    const block = encrypt([secret], blockSize)
    assert.throws(() => decrypt(randomBytes(16), block), {
      message: "Key must be 32 bytes",
    })
  })

  test("decrypts secrets regardless of position in block", () => {
    const secrets: [Secret, Secret, Secret] = [
      newSecret(randomBytes(64)),
      newSecret(randomBytes(1)),
      newSecret(randomBytes(128)),
    ]
    const block = encrypt(secrets, blockSize)
    for (const secret of secrets) {
      assert.deepStrictEqual(
        decrypt(secret.key, block),
        Buffer.from(secret.message)
      )
    }
  })

  test("decrypts reference block", () => {
    assert.strictEqual(
      decrypt(referenceKey, Buffer.from(referenceBlockHex, "hex")).toString(),
      "yo"
    )
  })

  test("verifies reference block construction independently", () => {
    // Re-derives the subkeys, unmasks the length and decrypts using raw
    // crypto calls — independent of the module’s own construction, so the
    // reference vector pins the format itself, not just the implementation
    const block = Buffer.from(referenceBlockHex, "hex")
    const lengthKey = Buffer.from(
      hkdfSync("sha256", referenceKey, "", "length", 32)
    )
    const dataKey = Buffer.from(
      hkdfSync("sha256", referenceKey, "", "data", 32)
    )
    const iv = block.subarray(0, 12)
    const mask = createHmac("sha256", lengthKey)
      .update(iv)
      .digest()
      .readUInt16BE(0)
    const ciphertextLength = block.readUInt16BE(12) ^ mask
    assert.strictEqual(ciphertextLength, 2)
    const decipher = createDecipheriv("aes-256-gcm", dataKey, iv)
    decipher.setAuthTag(block.subarray(16, 32))
    const message = Buffer.concat([
      decipher.update(block.subarray(14, 16)),
      decipher.final(),
    ])
    assert.strictEqual(message.toString(), "yo")
  })
})
