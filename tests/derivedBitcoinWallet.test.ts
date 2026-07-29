import assert from "assert"
import { createHmac, hkdfSync } from "crypto"
import { suite, test } from "node:test"

import { entropyToMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import { validateMnemonic } from "@/src/utilities/crypto/bip39"
import {
  computeDerivedBitcoinWallet,
  defaultDerivationPath,
  deriveAddresses,
  deriveExtendedPrivateKey,
  deriveExtendedPublicKey,
  deriveMnemonic,
} from "@/src/utilities/crypto/derivedBitcoinWallet"
import {
  computeChallenge,
  deriveKey,
  noYubiKeySalt,
} from "@/src/utilities/crypto/derivedKey"

// Reference vectors freeze the rendering scheme — changing any constant
// or construction in the module breaks them, as does any change to the
// derived key scheme beneath it (see tests/derivedKey.test.ts). A
// mnemonic can guard funds, so unlike a password it can never be rotated
// away from a mistake: these vectors are the recovery contract.
const derivedKey = Buffer.alloc(32, 1)

const mnemonic24 =
  "muscle crawl tiny snack note chunk cheese acquire ahead please reject sniff hair cactus loan torch uphold curious cousin spread become cotton abandon pig"
const mnemonic12 =
  "prefer special script soap option brisk this mass swap odor vote require"

suite("derivedBitcoinWallet", () => {
  test("freezes default derivation path", () => {
    assert.strictEqual(defaultDerivationPath, "m/84'/0'/0'")
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
      "fossil old ethics math swamp invest wagon hurry soccer inflict acid era tissue load account flight alpha dinosaur join cute cake acid hand logic"
    )
    // The single-factor wallet of the same master key is a different one
    // — the hardware is a factor of the wallet itself
    assert.strictEqual(
      deriveMnemonic(deriveKey(masterKey, noYubiKeySalt), 24),
      "combine stuff price popular proof sustain harsh deal stem cloth advance cup resist kind lake science stand detect airport stool october tourist obtain fly"
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
              Buffer.from(`superbacked-derived-mnemonic-v1-${words}`, "utf8"),
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

  test("derives extended public keys labeled by purpose", () => {
    // SLIP-132 — the emitted key is labeled by what the path derives
    assert.strictEqual(
      deriveExtendedPublicKey(mnemonic24, defaultDerivationPath),
      "zpub6qd8dzcv4EQxkzDVY9DiTSTQue7vCSL5U4kZbQiJ3H5j3wP8pg1AFUEfug3yNCvM5BqWTUK1p1bWHYhhWXpVypTToT9AqLnv9tENnFAGanv"
    )
    assert.strictEqual(
      deriveExtendedPublicKey(mnemonic24, "m/44'/0'/0'"),
      "xpub6CrFGVNzQKjushsv5sbXDNewLcmqCyPw466pmTjpte7oDUsuZvXdkfSDhEmW5NBqURoQ3dANX1zXjHYRjdb3DN8sYxtnpVyPzVdo9qVJQek"
    )
    assert.strictEqual(
      deriveExtendedPublicKey(mnemonic24, "m/49'/0'/0'"),
      "ypub6XTovTau868KAzSaTav3LikSECC3QnMKTbTs98rTgozNksYBgUMmNkoJD36WYTdLo8m9jdzP3o3ifPFLbnzK9kSxob4GKdNzdhdga5rhbDA"
    )
  })

  test("fails to derive extended public key using invalid path", () => {
    // The path shape is validated at the command line (see
    // parseDerivationPath in src/cli/derivedBitcoinWallet.ts) — the library
    // rejection is the module-level backstop
    assert.throws(() => deriveExtendedPublicKey(mnemonic24, "nonsense"))
  })

  test("derives extended private key", () => {
    // Pasting the zprv into a wallet imports the entire account — the
    // Electrum path
    assert.strictEqual(
      deriveExtendedPrivateKey(mnemonic24, defaultDerivationPath),
      "zprvAcdnEV62DrrfYW92S7gi6JWgMcHRnycE6qpxo2JgUwYkB93zH8guhfvC4NwepJTLoSAUYd6YxGbrj3xnggPMiva4i5xYfjizZ42D4FL1oh5"
    )
  })

  test("derives receive addresses", () => {
    assert.deepStrictEqual(
      deriveAddresses(mnemonic24, defaultDerivationPath, 3),
      [
        "bc1q0r0yn4ypkwau66kezl7gvxu5wwkmnt2crwjfhd",
        "bc1qvhyy8udjpfrhc7hh3cdpn465kcdf94asc3wlam",
        "bc1qaxy2929ehkvjykgygfssypk703e265lz6wfjqg",
      ]
    )
  })

  test("fails to derive addresses outside native segwit paths", () => {
    // Other purposes use other address encodings — an m/44' address is
    // not a bech32 one
    assert.throws(() => deriveAddresses(mnemonic24, "m/44'/0'/0'", 1), {
      message: "Addresses are supported for m/84' derivation paths only",
    })
  })

  test("fails to derive addresses using invalid count", () => {
    for (const count of [0, -1, 1.5]) {
      assert.throws(
        () => deriveAddresses(mnemonic24, defaultDerivationPath, count),
        {
          message: "Count must be a positive integer",
        }
      )
    }
  })

  test("computes derived Bitcoin wallet without YubiKey (reference vector)", async () => {
    // The full single-factor pipeline — master passphrase to wallet —
    // over the frozen master key vector (see tests/derivedKey.test.ts)
    const { extendedPublicKey, mnemonic } = await computeDerivedBitcoinWallet(
      "lip gift name net sixth",
      "github",
      { derivationPath: defaultDerivationPath, paranoid: false, words: 24 }
    )
    assert.strictEqual(
      mnemonic,
      "identify wrong reward climb violin color crater hunt cabin alter garage blue name unaware estate prison category reunion risk era cotton shoulder quit build"
    )
    assert.strictEqual(
      extendedPublicKey,
      "zpub6rEwfvDvu5GwPFPQSU7dnVYApL89sRCmsW4vbrTcEkgT52Nxug8cuLUm7CinwXxd7YszxhtLYHfdyixYSgppEg6ivBb6VMHhqPFr1vwcnk2"
    )
    // The wallet the reference master passphrase derives — first receive
    // address and account private key, importable into any wallet
    assert.deepStrictEqual(
      deriveAddresses(mnemonic, defaultDerivationPath, 1),
      ["bc1ql3yeg5y2zgqrq7pe00r047el72n8xkcq6ed3zp"]
    )
    assert.strictEqual(
      deriveExtendedPrivateKey(mnemonic, defaultDerivationPath),
      "zprvAdFbGQh34hieAmJwLSadRMbSGJHfTxUvWH9KoU3zgR9UCE3pN8pNMYAHFwojtSzuGY72xjFXhNggr2VHxVnYWcgwSJqN6WisX1enghbkXAG"
    )
  })

  test("computes derived Bitcoin wallet under Paranoid mode (reference vector)", async () => {
    // The mode is a domain input — chained from the frozen paranoid
    // master key vector (see tests/derivedKey.test.ts), and a different
    // wallet than the standard derivation of the same inputs
    const { mnemonic } = await computeDerivedBitcoinWallet(
      "lip gift name net sixth",
      "github",
      { derivationPath: defaultDerivationPath, paranoid: true, words: 24 }
    )
    assert.strictEqual(
      mnemonic,
      "spike dinner board novel arena orphan whale surge unknown copper police immune labor blind scissors fatal parade lady music crawl pulp define misery thing"
    )
  })
})
