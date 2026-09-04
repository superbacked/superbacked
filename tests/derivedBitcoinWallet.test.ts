import assert from "assert"
import { createHmac, hkdfSync } from "crypto"
import { suite, test } from "node:test"

import { entropyToMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import { validateMnemonic } from "@/src/utilities/crypto/bip39"
import {
  derivationPath,
  deriveAddresses,
  deriveExtendedPrivateKey,
  deriveExtendedPublicKey,
  deriveMnemonic,
} from "@/src/utilities/crypto/derivedBitcoinWallet"
import {
  computeChallenge,
  computeMasterKey,
  deriveKey,
} from "@/src/utilities/crypto/derivedKey"

// Reference vectors freeze the rendering scheme — changing any constant
// or construction in the module breaks them, as does any change to the
// derived key scheme beneath it (see tests/derivedKey.test.ts). A
// mnemonic can guard funds, so unlike a password it can never be rotated
// away from a mistake: these vectors are the recovery contract.
// Derivation always mixes in a YubiKey response, so composed tests pin
// against a fixed response-shaped salt (computeDerivedBitcoinWallet
// itself requires hardware and is exercised through its parts)
const derivedKey = Buffer.alloc(32, 1)
const testSalt = Buffer.alloc(20, 4)

const mnemonic24 =
  "clay knife lonely captain palace usual tissue laugh ring sponsor resemble dismiss fish acid bless juice cool frost surge chair rely fun armed toddler"
const mnemonic12 =
  "fiber buffalo require crunch garage stage grief begin hover amount rose thank"

suite("derivedBitcoinWallet", () => {
  test("freezes derivation path", () => {
    assert.strictEqual(derivationPath, "m/84'/0'/0'")
  })

  test("derives 24-word mnemonic", () => {
    assert.strictEqual(deriveMnemonic(derivedKey, 24), mnemonic24)
    assert.strictEqual(validateMnemonic(mnemonic24), true)
  })

  test("derives same mnemonic for same inputs", () => {
    assert.strictEqual(
      deriveMnemonic(derivedKey, 24),
      deriveMnemonic(derivedKey, 24)
    )
  })

  test("derives mnemonic from simulated YubiKey response", () => {
    // The two-factor composition of the derivedKey suite carried through
    // to the mnemonic layer — the YubiKey computes HMAC-SHA1 keyed with
    // the slot secret, simulated in software with a known secret
    const masterKey = Buffer.alloc(32, 1)
    const slotSecret = Buffer.alloc(20, 3)
    const response = createHmac("sha1", slotSecret)
      .update(computeChallenge(masterKey, "github"))
      .digest()
    assert.strictEqual(
      deriveMnemonic(deriveKey(masterKey, response), 24),
      "clinic local loan drive sphere feel knife pulse comic olive clinic illegal pistol foot bronze help meat layer yellow stone lady language nest speed"
    )
    // A different response derives a different wallet — the hardware is
    // a factor of the wallet itself
    assert.notStrictEqual(
      deriveMnemonic(deriveKey(masterKey, testSalt), 24),
      deriveMnemonic(deriveKey(masterKey, response), 24)
    )
  })

  test("derives 12-word mnemonic independent of the 24-word one", () => {
    assert.strictEqual(deriveMnemonic(derivedKey, 12), mnemonic12)
    assert.strictEqual(validateMnemonic(mnemonic12), true)
    // The word count is part of the HKDF info — without it the 12-word
    // entropy would be a prefix of the 24-word entropy, making one
    // wallet a truncation of the other
    assert.notStrictEqual(
      mnemonic24.split(" ").slice(0, 11).join(" "),
      mnemonic12.split(" ").slice(0, 11).join(" ")
    )
  })

  test("verifies mnemonic construction independently", () => {
    // Raw crypto recomputation pins the frozen context string and the
    // word-count binding
    for (const [words, length] of [
      [12, 16],
      [24, 32],
    ] as const) {
      assert.strictEqual(
        deriveMnemonic(derivedKey, words),
        entropyToMnemonic(
          Buffer.from(
            hkdfSync(
              "sha256",
              derivedKey,
              Buffer.alloc(0),
              Buffer.from(`superbacked-derived-mnemonic-${words}`, "utf8"),
              length
            )
          ),
          wordlist
        )
      )
    }
  })

  test("fails to derive mnemonic using invalid word count", () => {
    // @ts-expect-error invalid word count
    assert.throws(() => deriveMnemonic(derivedKey, 18), {
      message: "Words must be 12 or 24",
    })
  })

  test("derives extended public key", () => {
    // SLIP-132 native segwit labeling — the zpub of the fixed path
    assert.strictEqual(
      deriveExtendedPublicKey(mnemonic24),
      "zpub6s2TkKXmvFkJxU4LnPNWJa1UDELaaCpcRR7rubjrswtxsb14iBscNDvPdHi7rKsqLPLYYyGjQpLcd1XUhPFv5m1U9ExYVGyZ6iXqDMnHAKZ"
    )
  })

  test("derives extended private key", () => {
    // Pasting the zprv into a wallet imports the entire account — the
    // Electrum path
    assert.strictEqual(
      deriveExtendedPrivateKey(mnemonic24),
      "zprvAe37Lozt5tC1jyysgMqVwS4jfCW6Ak6m4CCG7DLFKcMyznfvAeZMpRbun12zU2k2nA17q2BKcUt1i5uHfgXVDaLk9zrZquX6MHyMgrNyo78"
    )
  })

  test("derives receive addresses", () => {
    assert.deepStrictEqual(deriveAddresses(mnemonic24, 3), [
      "bc1q76v00ytsk3j6ztfyxy0nzhmmffle745794yeql",
      "bc1q6suyhrrr6x0c4vn64p7m9rvz3fd9pakwavns26",
      "bc1qndwuu2sheyc8fdljsznlave5ydngus6jvtjg6y",
    ])
  })

  test("fails to derive addresses using invalid count", () => {
    for (const count of [0, -1, 1.5]) {
      assert.throws(() => deriveAddresses(mnemonic24, count), {
        message: "Count must be a positive integer",
      })
    }
  })

  test("computes derived Bitcoin wallet of composed derivation (reference vector)", async () => {
    // The full pipeline — master passphrase to wallet — over the frozen
    // standard master key vector (see tests/derivedKey.test.ts) against
    // the fixed response-shaped salt
    const mnemonic = deriveMnemonic(
      deriveKey(
        await computeMasterKey("lip gift name net sixth", "github", false),
        testSalt
      ),
      24
    )
    assert.strictEqual(
      mnemonic,
      "latin embrace horn peanut plastic across cigar angry jar fetch gasp napkin slight lava blue trial beyond peasant dizzy heart speak twice country faculty"
    )
    assert.strictEqual(
      deriveExtendedPublicKey(mnemonic),
      "zpub6riKn74K8rCdNac6iZVFqLAbaRiEeDnHx6989W59W3yn883RM35FAumPwmBrs6uYDf94BFerujUHvTgYUZYBjFktiGYPbFvAuWer3BAjiFN"
    )
    // The wallet the reference master passphrase derives — first receive
    // address and account private key, importable into any wallet
    assert.deepStrictEqual(deriveAddresses(mnemonic, 1), [
      "bc1qc9prheeuy9yh4qwzw6tnu39wwdejsywupy47j9",
    ])
    assert.strictEqual(
      deriveExtendedPrivateKey(mnemonic),
      "zprvAdiyNbXRJUeLA6XdcXxFUCDs2PskEm4SasDXM7fXwiSoFKiGoVkzd7Sv6VmTETq9Xf5crQgN4ZW2VER1BfqYMmdKrAtjzRRKjUdeuDokYcF"
    )
  })

  test("computes derived Bitcoin wallet under Paranoid mode (reference vector)", async () => {
    // The mode is a domain input — chained from the frozen paranoid
    // master key vector (see tests/derivedKey.test.ts), and a different
    // wallet than the standard derivation of the same inputs
    const mnemonic = deriveMnemonic(
      deriveKey(
        await computeMasterKey("lip gift name net sixth", "github", true),
        testSalt
      ),
      24
    )
    assert.strictEqual(
      mnemonic,
      "damage onion kingdom close proud addict sponsor draw sound defense chunk paddle vicious omit any captain illegal print affair alarm decade truck elder garbage"
    )
  })
})
