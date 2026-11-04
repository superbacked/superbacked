import assert from "assert"
import { createHmac } from "crypto"
import { suite, test } from "node:test"

import { decrypt } from "@/src/utilities/crypto/legacy/fixedSizeEncryption"

// The scheme is frozen and restoration-only — creation paths were
// removed, so decryption is pinned by frozen blocks generated with the
// removed encrypt (subkey mode and legacy mode), each holding the same
// three secrets. The published legacy reference blocks pin the scheme
// against real shipped artifacts (see tests/referenceBlocks.test.ts) —
// these vectors pin it at the module level, under a fast deterministic
// key derivation function.

const secrets = [
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
    message: "yo",
    passphrase: "decor gooey wish kept pug",
  },
] as const

const insecureKdf = async (
  passphrase: string,
  salt: string
): Promise<Buffer> => {
  const hmac = createHmac("sha256", salt)
  const data = hmac.update(passphrase)
  return Buffer.from(data.digest("base64"), "base64")
}

// Frozen block in subkey mode — header and data ciphertexts under
// independent HKDF subkeys
const subkeyBlock = {
  salt: Buffer.from("HVpdZW2eJUmV4zXx1rARxA==", "base64"),
  iv: Buffer.from("frUygqm9zkZRNrrVLUzdQA==", "base64"),
  headers: Buffer.from(
    "/RPu/mnJzxcfEjSr59QDexkACk4VUp2Zqo9pAjCDwH/9jxeQp8BMuUTxHVJE744GeYysHc/YgUtvSPjQi5zwkg==",
    "base64"
  ),
  data: Buffer.from(
    "ePFRs4288mqRp4ZWg9S0UgLvicRHOmzRKyctJ8EBgljb0okEvqw8QVZYd0BC+R49a1hCEm/NBJb0T6pcKlh5nPRc6F57QCiSvtCy7lVwsnXdP7pKbb2Kl3xhwp95tTo+lpSQECCRn7/0M6Crjv7ISTMwoWe39x6IxcFrG7hTzWcjxCA1y+02ek1Ti3q0AKG6C+TxVxwxuAK2iscatAGVUOKXgJGNCJ+KVASdz23QcCrooWYcRVykF1imw87XeHB/Spmx3rSBggbIGvm/6jVsR0Kdgp2fcN2LLCIRD2m1VArQTJPv86gNb82lcbo2o+qNt2xXDj93zEU/ovDrK0X1SO7ElmAHvC8UXgF4ICRMb4sxwDHS8/bAFpqLPwPv2ssMxOfVcP/aouPzLIGzZ5uHR2sxJlKVq336Pu/+cOhisuk8gNcQNvkyOQw4SiLq93dTzTZaiboxtULImpsffhSUzELwB894apz1JY+7NbI0edD/H9PWli92AIlLuMQzKtXE",
    "base64"
  ),
}

// Frozen block in legacy mode — blocks created before HKDF subkeys,
// header and data ciphertexts sharing the raw key
const legacyModeBlock = {
  salt: Buffer.from("kUApWcfTxoYKgZUbHLx8uw==", "base64"),
  iv: Buffer.from("3hXKE9qZbCR2u1rOUKFg+w==", "base64"),
  headers: Buffer.from(
    "zikl69IcvZ8sVHNkvpDu2P20vORZykzwyKLRAHP3M9+usN2XAJjZiTi/5yDHv89GDStFac3YXWmCpxAfzOVhKw==",
    "base64"
  ),
  data: Buffer.from(
    "I4T+PIF8QmrkIggDaqhlBqsnevA2Tm5l8sB3BsZMxgy2pSIotjoaxMwZEoQ2CXXSQ80mTGOytlc6ZxvyxNykk2xomeaZj8xklzJDd3EmNqD0KICojuKWAF1OSN59zD6IBXZ7ciBL1cpctZNe6rqiKx+lyDeJe/Wm9qtA+YO3xi6XXpRJLdKuvzPzptBeli5AgcU7J5qxnF4c2HP9cZ2+JcPIjMw+b3K2VY0Lu7GnFNW1ZRb7+2yK8obNT4whO9YwAiz/Fx4UYCdGeXCnBRWFaDs0RfI6qT2oOfxqrkaxTJz2LOYK9knAsXw21aRiwvJuAfEDCx8Cki8tstmzT31eloczs1ScmZU8HYxlvacLN7CPa6YYhFKtMNvbqQn9a/urviLUdmNPbEo4e8Vw9YwX2H1edN25JFIlOngv2p1/Av/LNurCBMgzVko538ZctUT+xsHHCYja4hN3BXJ2UZFLgKotouxwkxG21BMiZL/bJcmXyGEkeVh6wNm7Cxhq+dmR",
    "base64"
  ),
}

suite("legacyFixedSizeEncryption", () => {
  test("decrypts every secret of the frozen block", async () => {
    for (const secret of secrets) {
      const message = await decrypt(
        secret.passphrase,
        subkeyBlock.salt,
        subkeyBlock.iv,
        subkeyBlock.headers,
        subkeyBlock.data,
        insecureKdf
      )
      assert.strictEqual(message.toString(), secret.message)
    }
  })

  test("decrypts every secret of the frozen legacy mode block", async () => {
    for (const secret of secrets) {
      const message = await decrypt(
        secret.passphrase,
        legacyModeBlock.salt,
        legacyModeBlock.iv,
        legacyModeBlock.headers,
        legacyModeBlock.data,
        insecureKdf,
        true
      )
      assert.strictEqual(message.toString(), secret.message)
    }
  })

  test("fails to decrypt using wrong passphrase", async () => {
    // A wrong passphrase and an absent secret fail identically — the
    // error does not reveal whether there was anything to find
    await assert.rejects(
      decrypt(
        "foo",
        subkeyBlock.salt,
        subkeyBlock.iv,
        subkeyBlock.headers,
        subkeyBlock.data,
        insecureKdf
      ),
      { message: "Header not found" }
    )
  })

  test("fails to decrypt subkey block in legacy mode and conversely", async () => {
    // The two key derivations never open each other’s blocks — mode
    // discovery works by trying both (see src/handlers/restore.ts)
    await assert.rejects(
      decrypt(
        secrets[0].passphrase,
        subkeyBlock.salt,
        subkeyBlock.iv,
        subkeyBlock.headers,
        subkeyBlock.data,
        insecureKdf,
        true
      ),
      { message: "Header not found" }
    )
    await assert.rejects(
      decrypt(
        secrets[0].passphrase,
        legacyModeBlock.salt,
        legacyModeBlock.iv,
        legacyModeBlock.headers,
        legacyModeBlock.data,
        insecureKdf
      ),
      { message: "Header not found" }
    )
  })
})
