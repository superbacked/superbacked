import assert from "assert"
import { createHmac } from "crypto"
import { suite, test } from "node:test"

import {
  computeChallenge,
  computeDerivedPassword,
  computeMasterKey,
  derivePassword,
  maximumPasswordLength,
  minimumPasswordLength,
  noYubiKeySalt,
} from "@/src/utilities/derivedPassword"

// Reference vectors freeze the derivation scheme — changing any constant,
// cost parameter or construction in the module breaks them. Vectors were
// computed independently: HKDF and HMAC stages with a separate
// implementation validated against RFC 5869 test case 1, Argon2id stages by
// invoking the reference binary in bin/ directly
const masterKey = Buffer.alloc(32, 1)
const otherMasterKey = Buffer.alloc(32, 2)

suite("derivedPassword", () => {
  test("freezes no-YubiKey salt", () => {
    assert.strictEqual(
      noYubiKeySalt.toString("hex"),
      "f965dbf385adb208eec3a6b495ef1e239278a34a1d92627146a96253cf205498"
    )
    // A real YubiKey response is 20 bytes, so the two modes can never share a
    // salt
    assert.strictEqual(noYubiKeySalt.length, 32)
  })

  test("computes challenge", () => {
    assert.strictEqual(
      computeChallenge(masterKey, "github").toString("hex"),
      "2a20b29c4a813025db05dd8e97584d82fa07581ae0e6a42a42a400fb59676576"
    )
  })

  test("computes distinct challenges for distinct labels", () => {
    assert.notDeepStrictEqual(
      computeChallenge(masterKey, "github"),
      computeChallenge(masterKey, "proton")
    )
  })

  test("verifies challenge construction independently", () => {
    // Raw crypto recomputation pins the frozen context string, not just the
    // output value
    assert.deepStrictEqual(
      computeChallenge(masterKey, "github"),
      createHmac("sha256", masterKey)
        .update("superbacked-derived-password-challenge-github", "utf8")
        .digest()
    )
  })

  test("derives password", () => {
    assert.strictEqual(
      derivePassword(masterKey, "github", noYubiKeySalt, 16),
      "9Zc<jbudaV_>SYod"
    )
  })

  test("derives same password for same inputs", () => {
    assert.strictEqual(
      derivePassword(masterKey, "github", noYubiKeySalt, 16),
      derivePassword(masterKey, "github", noYubiKeySalt, 16)
    )
  })

  test("derives password at minimum length", () => {
    assert.strictEqual(
      derivePassword(masterKey, "github", noYubiKeySalt, minimumPasswordLength),
      "9Zc<jbud"
    )
  })

  test("derives password at maximum length", () => {
    assert.strictEqual(
      derivePassword(masterKey, "github", noYubiKeySalt, maximumPasswordLength),
      "EmemDC<$vt^x$XZM9Zc<jbudaV_>SYodu6m?!8WbADW3N/_yGy:B)Cs]#;:cE57v[{uTF,ho@nxRE+N,,C*b&Rhxg?xjemd8L<rL\\{]<YycNko;\\N3wUb39Bpo8{nG,:"
    )
  })

  test("derives password containing all character classes", () => {
    const password = derivePassword(
      masterKey,
      "github",
      noYubiKeySalt,
      minimumPasswordLength
    )
    assert.match(password, /[a-z]/)
    assert.match(password, /[A-Z]/)
    assert.match(password, /[0-9]/)
    assert.match(password, /[^a-zA-Z0-9]/)
  })

  test("derives password from unambiguous printable characters only", () => {
    const password = derivePassword(
      masterKey,
      "github",
      noYubiKeySalt,
      maximumPasswordLength
    )
    assert.match(password, /^[\x21-\x7e]+$/)
    assert.doesNotMatch(password, /[01OlI|'"`]/)
  })

  test("derives password from empty label", () => {
    assert.strictEqual(
      derivePassword(masterKey, "", noYubiKeySalt, 16),
      "*/bJMG!%:85a-Yjf"
    )
  })

  test("derives distinct passwords for distinct labels", () => {
    assert.notStrictEqual(
      derivePassword(masterKey, "github", noYubiKeySalt, 16),
      derivePassword(masterKey, "proton", noYubiKeySalt, 16)
    )
  })

  test("derives distinct passwords for distinct salts", () => {
    assert.notStrictEqual(
      derivePassword(masterKey, "github", noYubiKeySalt, 16),
      derivePassword(masterKey, "github", Buffer.alloc(20, 3), 16)
    )
  })

  test("derives distinct passwords for distinct master keys", () => {
    assert.notStrictEqual(
      derivePassword(masterKey, "github", noYubiKeySalt, 16),
      derivePassword(otherMasterKey, "github", noYubiKeySalt, 16)
    )
  })

  test("fails to derive password using length below minimum", () => {
    assert.throws(
      () =>
        derivePassword(
          masterKey,
          "github",
          noYubiKeySalt,
          minimumPasswordLength - 1
        ),
      { message: "Length must be an integer between 8 and 128" }
    )
  })

  test("fails to derive password using length above maximum", () => {
    assert.throws(
      () =>
        derivePassword(
          masterKey,
          "github",
          noYubiKeySalt,
          maximumPasswordLength + 1
        ),
      { message: "Length must be an integer between 8 and 128" }
    )
  })

  test("fails to derive password using non-integer length", () => {
    assert.throws(
      () => derivePassword(masterKey, "github", noYubiKeySalt, 8.5),
      {
        message: "Length must be an integer between 8 and 128",
      }
    )
  })

  test("computes master key", async () => {
    const key = await computeMasterKey("lip gift name net sixth", "github")
    assert.strictEqual(
      key.toString("hex"),
      "e268a437bd0d5b576586a91fad8016e99255b981650b6b673789878c85ebd2a4"
    )
  })

  test("computes distinct master keys for distinct labels", async () => {
    assert.notDeepStrictEqual(
      await computeMasterKey("lip gift name net sixth", "github"),
      await computeMasterKey("lip gift name net sixth", "proton")
    )
  })

  test("computes derived password without YubiKey", async () => {
    const password = await computeDerivedPassword(
      "lip gift name net sixth",
      "github",
      { length: 16 }
    )
    assert.strictEqual(password, "A{e&p%R((}T%,s[3")
  })

  test("computes derived password equal to composed derivation", async () => {
    const composedMasterKey = await computeMasterKey(
      "lip gift name net sixth",
      "github"
    )
    assert.strictEqual(
      await computeDerivedPassword("lip gift name net sixth", "github", {
        length: 16,
      }),
      derivePassword(composedMasterKey, "github", noYubiKeySalt, 16)
    )
  })
})
