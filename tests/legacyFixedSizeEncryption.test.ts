import assert from "assert"
import { createHmac } from "crypto"
import { suite, test } from "node:test"

import {
  Secret,
  decrypt,
  encrypt,
  getDataLength,
} from "@/src/utilities/crypto/legacyFixedSizeEncryption"

const secrets: [Secret, Secret, Secret] = [
  {
    message:
      "trust vast puppy supreme public course output august glimpse reunion kite rebel virus tail pass enhance divorce whip edit skill dismiss alpha divert ketchup",
    passphrase: "lip gift name net sixth",
  },
  {
    message: "this is a test\nyo",
    passphrase: "grunt daisy chow barge pants",
  },
  {
    message: Buffer.from("yo"),
    passphrase: "decor gooey wish kept pug",
  },
]

const insecureKdf = async (
  passphrase: string,
  salt: string
): Promise<Buffer> => {
  const hmac = createHmac("sha256", salt)
  const data = hmac.update(passphrase)
  return Buffer.from(data.digest("base64"), "base64")
}

const referenceSalt = Buffer.from("Com4/aFtBjaGdvbjgi5UNw==", "base64")
const referenceIv = Buffer.from("u05uhhQe3NDtCf39rsxnig==", "base64")
const referenceHeadersSignature = Buffer.from(
  "gqJZZMSiyzw4pohc+FJuRYEOYT+TaQr+lvch7mz8KwFyzPAL7Qjj8JI/3fSzal/Lw52Ah0rAvZTQ+ELZIhUFtA==",
  "base64"
)
const legacyReferenceHeadersSignature = Buffer.from(
  "UJO8m9woe0CrEkyHqOuLN9AN9x7wkTOprSYeFHMaMm29z6l7CmeXeO7IlcUorqytXy2zChcJdDN0z6ulBCXs+g==",
  "base64"
)

suite("legacyFixedSizeEncryption", () => {
  test("gets data length of secret 1 as string", async () => {
    const dataLength = getDataLength(secrets[0].message)
    assert.strictEqual(dataLength, 184)
  })

  test("gets data length of secret 1 as buffer", async () => {
    const dataLength = getDataLength(Buffer.from(secrets[0].message))
    assert.strictEqual(dataLength, 184)
  })

  test("confirms block matches reference", async () => {
    const block = await encrypt(
      secrets,
      insecureKdf,
      null,
      null,
      referenceSalt,
      referenceIv
    )
    assert.deepStrictEqual(block.salt, referenceSalt)
    assert.deepStrictEqual(block.iv, referenceIv)
    assert.strictEqual(block.headers.length, 64)
    assert.strictEqual(
      Buffer.compare(
        block.headers.subarray(0, 32),
        referenceHeadersSignature.subarray(0, 32)
      ),
      0
    )
    assert.strictEqual(block.data.length, 384)
  })

  test("confirms legacy block matches legacy reference", async () => {
    const block = await encrypt(
      secrets,
      insecureKdf,
      null,
      null,
      referenceSalt,
      referenceIv,
      true
    )
    assert.deepStrictEqual(block.salt, referenceSalt)
    assert.deepStrictEqual(block.iv, referenceIv)
    assert.strictEqual(block.headers.length, 64)
    assert.strictEqual(
      Buffer.compare(
        block.headers.subarray(0, 32),
        legacyReferenceHeadersSignature.subarray(0, 32)
      ),
      0
    )
    assert.strictEqual(block.data.length, 384)
  })

  test("fails to encrypt no secrets", async () => {
    await assert.rejects(encrypt([], insecureKdf), {
      message: "Invalid secrets",
    })
  })

  test("fails to encrypt invalid secrets", async () => {
    await assert.rejects(
      // @ts-expect-error invalid secret shape
      encrypt([{ foo: "bar" }], insecureKdf),
      { message: "Invalid secrets" }
    )
  })

  test("fails to encrypt secrets using invalid headers length", async () => {
    await assert.rejects(encrypt(secrets, insecureKdf, 127), {
      message: "Invalid headers length",
    })
  })

  test("fails to encrypt secrets using headers length that is too short for headers", async () => {
    await assert.rejects(encrypt(secrets, insecureKdf, 32), {
      message: "Headers too long for headers length",
    })
  })

  test("fails to encrypt secrets using default headers length that is too short for headers", async () => {
    await assert.rejects(
      encrypt(
        [
          ...secrets,
          {
            message: "foo",
            passphrase: "mousy ditch pull prize stall",
          },
          {
            message: "bar",
            passphrase: "lurk entry clip tidal cinch",
          },
        ],
        insecureKdf
      ),
      { message: "Headers too long for headers length" }
    )
  })

  test("encrypts secrets using unusual but valid headers length", async () => {
    const headersLength = 128
    const block = await encrypt(secrets, insecureKdf, headersLength)
    assert.strictEqual(block.headers.length, headersLength)
  })

  test("fails to encrypt secret 1 using invalid data length", async () => {
    const secret1 = secrets[0]
    const dataLength = getDataLength(secret1.message)
    await assert.rejects(
      encrypt([secret1], insecureKdf, null, dataLength - 1),
      {
        message: "Invalid data length",
      }
    )
  })

  test("fails to encrypt secret 1 using minimum required data length minus 8", async () => {
    const secret1 = secrets[0]
    const dataLength = getDataLength(secret1.message)
    await assert.rejects(encrypt([secret1], insecureKdf, 128, dataLength - 8), {
      message: "Data too long for data length",
    })
  })

  test("fails to encrypt secrets using data length that is too short for data", async () => {
    await assert.rejects(encrypt(secrets, insecureKdf, null, 256), {
      message: "Data too long for data length",
    })
  })

  test("fails to encrypt secrets using auto data length that is too short for data", async () => {
    await assert.rejects(
      encrypt(
        [
          ...secrets,
          {
            message:
              "apple detail zoo peanut plastic reject payment renew box coconut ivory media gold antique scorpion settle trip gaze rain slender sunny hidden mule old",
            passphrase: "tart equal payer early axis",
          },
          {
            message:
              "leaf spawn guitar immune diagram height flag once giant tell pepper sugar sphere stomach coach erase fatigue lens tunnel love range flight embark control",
            passphrase: "mate cedar brook flop snowy",
          },
        ],
        insecureKdf
      ),
      { message: "Data too long for data length" }
    )
  })

  test("encrypts secret 1 using minimum required data length", async () => {
    const secret1 = secrets[0]
    const dataLength = Math.ceil(getDataLength(secret1.message) / 16) * 16
    const block = await encrypt([secret1], insecureKdf, null, dataLength)
    assert.strictEqual(block.data.length, dataLength)
  })

  test("encrypts secrets using larger than required data length", async () => {
    const dataLength = 1024
    const block = await encrypt(secrets, insecureKdf, null, dataLength)
    assert.strictEqual(block.data.length, dataLength)
  })

  test("encrypts secrets and fails to decrypt secret 1 using wrong passphrase", async () => {
    const block = await encrypt(secrets, insecureKdf)
    await assert.rejects(
      decrypt(
        "foo",
        block.salt,
        block.iv,
        block.headers,
        block.data,
        insecureKdf
      ),
      { message: "Header not found" }
    )
  })

  test("encrypts secrets and decrypts secret 1", async () => {
    const block = await encrypt(secrets, insecureKdf)
    const secret = await decrypt(
      secrets[0].passphrase,
      block.salt,
      block.iv,
      block.headers,
      block.data,
      insecureKdf
    )
    assert.strictEqual(secret.toString(), secrets[0].message)
  })

  test("encrypts secrets and decrypts secret 2", async () => {
    const block = await encrypt(secrets, insecureKdf)
    const secret = await decrypt(
      secrets[1].passphrase,
      block.salt,
      block.iv,
      block.headers,
      block.data,
      insecureKdf
    )
    assert.strictEqual(secret.toString(), secrets[1].message)
  })

  test("encrypts secrets and decrypts secret 3", async () => {
    const block = await encrypt(secrets, insecureKdf)
    const secret = await decrypt(
      secrets[2].passphrase,
      block.salt,
      block.iv,
      block.headers,
      block.data,
      insecureKdf
    )
    assert.deepStrictEqual(secret, secrets[2].message)
  })

  test("encrypts secrets in legacy mode and decrypts each secret in legacy mode", async () => {
    const block = await encrypt(
      secrets,
      insecureKdf,
      null,
      null,
      undefined,
      undefined,
      true
    )
    for (const secret of secrets) {
      const message = await decrypt(
        secret.passphrase,
        block.salt,
        block.iv,
        block.headers,
        block.data,
        insecureKdf,
        true
      )
      assert.deepStrictEqual(message, Buffer.from(secret.message))
    }
  })
})
