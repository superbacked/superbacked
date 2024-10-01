const wordlist = window.api.wordlist()

export const mnemonicWordRegExp = new RegExp(
  `(${wordlist.join("|")})(?![a-z])`,
  "g"
)

export const mnemonicRemainderRegExp = new RegExp(
  `^( (${wordlist.join("|")})){5}(( (${wordlist.join(
    "|"
  )})){6})?(( (${wordlist.join("|")})){12})?(?![a-z])`
)

export const totpUriRegExp = new RegExp(
  // See https://github.com/google/google-authenticator/wiki/Key-Uri-Format
  /otpauth:\/\/totp\/((.+)(:|%3A))?(.+)\?secret=([a-zA-Z2-7]+)&issuer=([^&\s]+)(&algorithm=(SHA1))?(&digits=(6))?(&period=(30))?/g
)

export type ExtractionType = "validBip39Mnemonic" | "totpUri"

interface ResultBase {
  string: string
  start: number
  end: number
}

interface Bip39MnemonicResult extends ResultBase {
  type: "validBip39Mnemonic"
  properties: {
    words: string[]
  }
}

interface TotpUriResult extends ResultBase {
  type: "totpUri"
  properties: {
    label: string
    username: string
    secret: string
    issuer: string
    algorithm: string
    digits: string
    period: string
  }
}

type Result = Bip39MnemonicResult | TotpUriResult

export const extract = (secret: string) => {
  const results: Result[] = []
  // Extract valid BIP39 mnemonics
  let mnemonicWordExecArray: RegExpExecArray
  let lastWordIndex: number
  while ((mnemonicWordExecArray = mnemonicWordRegExp.exec(secret))) {
    const firstWord = mnemonicWordExecArray[0]
    const firstWordIndex = mnemonicWordExecArray.index
    if (lastWordIndex && firstWordIndex < lastWordIndex) {
      continue
    }
    const remainder = secret.substring(mnemonicWordRegExp.lastIndex)
    const mnemonicRemainderExecArray = mnemonicRemainderRegExp.exec(remainder)
    if (mnemonicRemainderExecArray) {
      const mnemonic = `${firstWord}${mnemonicRemainderExecArray[0]}`
      const valid = window.api.validateMnemonic(mnemonic)
      if (valid === true) {
        lastWordIndex = firstWordIndex + mnemonic.length
        results.push({
          string: mnemonic,
          type: "validBip39Mnemonic",
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
  let totpUriExecArray: RegExpExecArray
  while ((totpUriExecArray = totpUriRegExp.exec(secret))) {
    const properties = {
      label: totpUriExecArray[2]
        ? decodeURIComponent(totpUriExecArray[2])
        : undefined,
      username: totpUriExecArray[4]
        ? decodeURIComponent(totpUriExecArray[4])
        : undefined,
      secret: totpUriExecArray[5],
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
  return results.sort((a, b) => (a.start > b.start ? 1 : -1))
}
