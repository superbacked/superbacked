import assert from "assert"
import { suite, test } from "node:test"

import {
  bip39PassphraseLength,
  createExtractor,
} from "@/src/main/utilities/extraction"
import { validateMnemonic, wordlist } from "@/src/utilities/crypto/bip39"
import { characterClasses } from "@/src/utilities/crypto/derivedPassword"
import generatePassword from "@/src/utilities/crypto/password"

// The extraction pipeline the restore view and the create textarea
// lean on — built here with the real wordlist, validator and character
// classes, so what these tests recognize is exactly what the app
// recognizes. Mnemonics validate by checksum, generated passphrases by
// the password generator’s contract (see
// src/utilities/crypto/password.ts) and only when a mnemonic gates
// them, TOTP URIs by shape.

const extract = createExtractor({
  characterClasses: [...characterClasses],
  validateMnemonic: validateMnemonic,
  wordlist: [...wordlist],
})

// Valid checksums — the canonical BIP39 test mnemonics
const mnemonic12 =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
const mnemonic24 =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"

// Generated once with the real generator and frozen so positions are
// deterministic — representative output, backslash included
const passphrase = "2#R<Dt\\*Cr]pX~23!a#;"

// Class-stripping transform — replaces every character of one class,
// yielding a 20-character run that looks generated but is not compliant
const withoutClass = (characterClass: string): string =>
  [...passphrase]
    .map((character) => (characterClass.includes(character) ? "a" : character))
    .join("")

const totpUri =
  "otpauth://totp/Proton:hello@example.com?secret=IXCLCM7KKJYWWFWINX2OTTWQTYBSJFPU&issuer=Proton&algorithm=SHA1&digits=6&period=30"

suite("extraction", () => {
  test("freezes generated passphrase length", () => {
    assert.strictEqual(bip39PassphraseLength, 20)
  })

  test("extracts 12- and 24-word mnemonics wherever they sit", () => {
    for (const mnemonic of [mnemonic12, mnemonic24]) {
      for (const secret of [
        mnemonic,
        `mnemonic 👉 ${mnemonic}`,
        `${mnemonic} is the mnemonic`,
      ]) {
        const results = extract(secret)
        assert.strictEqual(results.length, 1)
        const result = results[0]
        assert.ok(result?.type === "bip39Mnemonic")
        assert.strictEqual(result.string, mnemonic)
        assert.strictEqual(secret.substring(result.start, result.end), mnemonic)
        assert.deepStrictEqual(result.properties.words, mnemonic.split(" "))
      }
    }
  })

  test("extracts multiple mnemonics", () => {
    const results = extract(`${mnemonic12} and ${mnemonic24}`)
    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0]?.string, mnemonic12)
    assert.strictEqual(results[1]?.string, mnemonic24)
  })

  test("fails to extract word runs with an invalid checksum", () => {
    // The final word carries the checksum — swapping it for another
    // wordlist word keeps the shape and breaks the validation
    const invalid = mnemonic12.replace(/about$/, "abandon")
    assert.strictEqual(extract(invalid).length, 0)
  })

  test("extracts TOTP URIs with their properties", () => {
    const results = extract(`token 👉 ${totpUri}`)
    assert.strictEqual(results.length, 1)
    const result = results[0]
    assert.ok(result?.type === "totpUri")
    assert.strictEqual(result.string, totpUri)
    assert.strictEqual(
      result.properties.secret,
      "IXCLCM7KKJYWWFWINX2OTTWQTYBSJFPU"
    )
    assert.strictEqual(result.properties.issuer, "Proton")
    assert.strictEqual(result.properties.algorithm, "SHA1")
  })

  test("extracts generated passphrases only when a mnemonic gates them", async () => {
    // The scanner must recognize exactly what the generator emits —
    // fresh output, not just the frozen sample
    const generated = await generatePassword()
    for (const candidate of [passphrase, generated]) {
      const secret = `passphrase 👉 ${candidate}`
      assert.strictEqual(extract(secret).length, 0)
      const results = extract(secret, true)
      assert.strictEqual(results.length, 1)
      const result = results[0]
      assert.ok(result?.type === "bip39Passphrase")
      assert.strictEqual(result.properties.passphrase, candidate)
      assert.strictEqual(secret.substring(result.start, result.end), candidate)
    }
  })

  test("fails to extract passphrase runs of the wrong length", () => {
    // Maximality — a compliant shape inside a longer run never matches,
    // so TOTP URI fragments and concatenations stay out
    assert.strictEqual(extract(`${passphrase}!`, true).length, 0)
    assert.strictEqual(extract(`a${passphrase}`, true).length, 0)
    assert.strictEqual(extract(passphrase.substring(1), true).length, 0)
  })

  test("fails to extract passphrase runs missing a character class", () => {
    // Uppercase, digits and specials each stripped in turn (stripping
    // lowercase would leave none to replace with)
    for (const characterClass of characterClasses.slice(1)) {
      assert.strictEqual(extract(withoutClass(characterClass), true).length, 0)
    }
  })

  test("fails to extract passphrases overlapping other extractions", () => {
    // A TOTP URI is one long run of password characters — never a
    // passphrase, even gated
    const results = extract(totpUri, true)
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0]?.type, "totpUri")
  })

  test("sorts results by position across extractors", () => {
    const secret = `${passphrase} then ${mnemonic12} then ${totpUri}`
    const results = extract(secret, true)
    assert.deepStrictEqual(
      results.map((result) => result.type),
      ["bip39Passphrase", "bip39Mnemonic", "totpUri"]
    )
  })
})
