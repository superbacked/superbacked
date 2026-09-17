// Pure secret extraction — BIP39 mnemonics, generated BIP39
// passphrases, TOTP URIs and YubiKey challenge-response secrets,
// recognized inside free-form secret text. Kept free of window and
// crypto imports so every extractor is testable (see
// tests/extraction.test.ts): the caller injects the wordlist, the
// mnemonic validator and the password character classes (see
// src/main/utilities/regexp.ts, which binds them through the bridge).

export const bip39PassphraseLength = 20

// Hexadecimal characters of a 20-byte HMAC-SHA1 slot secret — the size
// YubiKey provisioning programs (see src/cli/provisionYubikey.ts)
export const yubikeyChallengeResponseSecretLength = 40

export type ExtractionType =
  | "bip39Mnemonic"
  | "bip39Passphrase"
  | "totpUri"
  | "yubikeyChallengeResponseSecret"

interface ResultBase {
  string: string
  start: number
  end: number
}

export interface Bip39MnemonicResult extends ResultBase {
  type: "bip39Mnemonic"
  properties: {
    words: string[]
  }
}

export interface Bip39PassphraseResult extends ResultBase {
  type: "bip39Passphrase"
  properties: {
    passphrase: string
  }
}

export interface TotpUriResult extends ResultBase {
  type: "totpUri"
  properties: {
    label?: string
    username?: string
    secret: string
    issuer?: string
    algorithm: string
    digits: string
    period: string
  }
}

export interface YubiKeyChallengeResponseSecretResult extends ResultBase {
  type: "yubikeyChallengeResponseSecret"
  properties: {
    secret: string
  }
}

export type Result =
  | Bip39MnemonicResult
  | Bip39PassphraseResult
  | TotpUriResult
  | YubiKeyChallengeResponseSecretResult

export interface ExtractorOptions {
  characterClasses: string[]
  validateMnemonic: (mnemonic: string) => boolean
  wordlist: string[]
}

export const totpUriRegExp = new RegExp(
  // See https://github.com/google/google-authenticator/wiki/Key-Uri-Format
  /otpauth:\/\/totp\/((.+)(:|%3A))?(.+)\?secret=([a-zA-Z2-7]+)&issuer=([^&\s]+)(&algorithm=(SHA1))?(&digits=(6))?(&period=(30))?/g
)

// Exactly the provisioned secret length of hexadecimal characters,
// bounded by non-hex on both sides — the lookarounds keep longer hex (a
// SHA-256 for example) from matching through its substrings
export const yubikeyChallengeResponseSecretRegExp = new RegExp(
  `(?<![0-9a-fA-F])[0-9a-fA-F]{${yubikeyChallengeResponseSecretLength}}(?![0-9a-fA-F])`,
  "g"
)

/**
 * Create extractor bound to a wordlist, mnemonic validator and password
 * character classes — the challenge-response secret extractor needs no
 * binding (a fixed hexadecimal shape) but runs in the same pass
 * @param options wordlist, validator and character classes
 * @returns extract function
 */
export const createExtractor = (options: ExtractorOptions) => {
  const { characterClasses, validateMnemonic, wordlist } = options
  const passwordCharacters = new Set(characterClasses.join(""))
  const mnemonicWordRegExp = new RegExp(`(${wordlist.join("|")})(?![a-z])`, "g")
  const mnemonicRemainderRegExp = new RegExp(
    `^( (${wordlist.join("|")})){5}(( (${wordlist.join(
      "|"
    )})){6})?(( (${wordlist.join("|")})){12})?(?![a-z])`
  )
  return (secret: string, bip39MnemonicPresent = false): Result[] => {
    const results: Result[] = []
    // Extract valid BIP39 mnemonics
    let mnemonicWordExecArray: null | RegExpExecArray
    let lastWordIndex: number = -1
    while ((mnemonicWordExecArray = mnemonicWordRegExp.exec(secret))) {
      const firstWord = mnemonicWordExecArray[0]
      const firstWordIndex = mnemonicWordExecArray.index
      if (lastWordIndex !== -1 && firstWordIndex < lastWordIndex) {
        continue
      }
      const remainder = secret.substring(mnemonicWordRegExp.lastIndex)
      const mnemonicRemainderExecArray = mnemonicRemainderRegExp.exec(remainder)
      if (mnemonicRemainderExecArray) {
        const mnemonic = `${firstWord}${mnemonicRemainderExecArray[0]}`
        const valid = validateMnemonic(mnemonic)
        if (valid === true) {
          lastWordIndex = firstWordIndex + mnemonic.length
          results.push({
            string: mnemonic,
            type: "bip39Mnemonic",
            start: firstWordIndex,
            end: lastWordIndex,
            properties: {
              words: mnemonic.split(" "),
            },
          })
        }
      }
    }
    // Extract TOTP URIs
    let totpUriExecArray: null | RegExpExecArray
    while ((totpUriExecArray = totpUriRegExp.exec(secret))) {
      const totpUriExecArraySecret = totpUriExecArray[5]
      if (!totpUriExecArraySecret) {
        continue
      }
      const properties = {
        label: totpUriExecArray[2]
          ? decodeURIComponent(totpUriExecArray[2])
          : undefined,
        username: totpUriExecArray[4]
          ? decodeURIComponent(totpUriExecArray[4])
          : undefined,
        secret: totpUriExecArraySecret,
        issuer: totpUriExecArray[6]
          ? decodeURIComponent(totpUriExecArray[6])
          : undefined,
        algorithm: totpUriExecArray[8] ?? "SHA1",
        digits: totpUriExecArray[10] ?? "6",
        period: totpUriExecArray[12] ?? "30",
      }
      results.push({
        string: totpUriExecArray[0],
        type: "totpUri",
        start: totpUriExecArray.index,
        end: totpUriExecArray.index + totpUriExecArray[0].length,
        properties: properties,
      })
    }
    // Extract YubiKey challenge-response secrets — the hex-run regexp
    // above, requiring at least one digit and one letter (a random
    // 20-byte secret virtually always has both, and the rule keeps long
    // decimal numbers and letter prose out); overlap with an extracted
    // URI disqualifies (a base32 TOTP secret can embed hex-only runs)
    let yubikeySecretExecArray: null | RegExpExecArray
    while (
      (yubikeySecretExecArray =
        yubikeyChallengeResponseSecretRegExp.exec(secret))
    ) {
      const run = yubikeySecretExecArray[0]
      const start = yubikeySecretExecArray.index
      const end = start + run.length
      if (/[0-9]/.test(run) === false || /[a-fA-F]/.test(run) === false) {
        continue
      }
      const overlaps = results.some(
        (result) => start < result.end && end > result.start
      )
      if (overlaps === false) {
        results.push({
          string: run,
          type: "yubikeyChallengeResponseSecret",
          start: start,
          end: end,
          properties: {
            secret: run,
          },
        })
      }
    }
    // Extract generated BIP39 passphrases — only when the secret holds a
    // BIP39 mnemonic (usually on another line, hence the caller-supplied
    // flag): a maximal run of password characters of exactly the
    // generated length (the password generator’s contract, see
    // src/utilities/crypto/password.ts) containing all four character
    // classes. Maximality and the class rule keep prose and TOTP URI
    // fragments out; overlap with an extracted mnemonic or URI
    // disqualifies
    if (bip39MnemonicPresent) {
      let runStart = -1
      for (let index = 0; index <= secret.length; index++) {
        const character = secret[index]
        if (character !== undefined && passwordCharacters.has(character)) {
          if (runStart === -1) {
            runStart = index
          }
          continue
        }
        if (runStart !== -1) {
          const run = secret.substring(runStart, index)
          const start = runStart
          const compliant =
            run.length === bip39PassphraseLength &&
            characterClasses.every((characterClass) =>
              [...run].some((runCharacter) =>
                characterClass.includes(runCharacter)
              )
            )
          const overlaps = results.some(
            (result) => start < result.end && index > result.start
          )
          if (compliant && overlaps === false) {
            results.push({
              string: run,
              type: "bip39Passphrase",
              start: start,
              end: index,
              properties: {
                passphrase: run,
              },
            })
          }
          runStart = -1
        }
      }
    }
    return results.sort((a, b) => (a.start > b.start ? 1 : -1))
  }
}
