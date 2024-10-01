import { zxcvbn, zxcvbnOptions, ZxcvbnResult } from "@zxcvbn-ts/core"
import {
  adjacencyGraphs as languageCommonAdjacencyGraphs,
  dictionary as languageCommonDictionary,
} from "@zxcvbn-ts/language-common"
import { dictionary as languageEnDictionary } from "@zxcvbn-ts/language-en"

const second = 1
const minute = second * 60
const hour = minute * 60
const day = hour * 24
const month = day * 31
const year = month * 12

export type ZxcvbnTranslationKey =
  | "ltSecond"
  | "second"
  | "seconds"
  | "minute"
  | "minutes"
  | "hour"
  | "hours"
  | "day"
  | "days"
  | "month"
  | "months"
  | "year"
  | "years"
  | "centuries"

export interface Result extends ZxcvbnResult {
  base: number
  crackTimesDisplay: {
    onlineThrottling100PerHour: ZxcvbnTranslationKey
    onlineNoThrottling10PerSecond: ZxcvbnTranslationKey
    offlineSlowHashing1e4PerSecond: ZxcvbnTranslationKey
    offlineFastHashing1e10PerSecond: ZxcvbnTranslationKey
  }
  strength: number
}

export const computeStrength = (seconds: number) => {
  return Math.min(Math.max(seconds / year, 1), 100)
}

export default (passphrase: string): Result => {
  const options = {
    graphs: languageCommonAdjacencyGraphs,
    dictionary: {
      ...languageCommonDictionary,
      ...languageEnDictionary,
    },
  }
  zxcvbnOptions.setOptions(options)
  const result = zxcvbn(passphrase) as Result
  const display = result.crackTimesDisplay.offlineSlowHashing1e4PerSecond
  const seconds = result.crackTimesSeconds.offlineSlowHashing1e4PerSecond
  let base: number
  if (display.match(/^second(s)?$/)) {
    base = Math.round(seconds / second)
  } else if (display.match(/^minute(s)?$/)) {
    base = Math.round(seconds / minute)
  } else if (display.match(/^hour(s)?$/)) {
    base = Math.round(seconds / hour)
  } else if (display.match(/^day(s)?$/)) {
    base = Math.round(seconds / day)
  } else if (display.match(/^month(s)?$/)) {
    base = Math.round(seconds / month)
  } else if (display.match(/^year(s)?$/)) {
    base = Math.round(seconds / year)
  }
  return {
    base: base,
    ...result,
    strength: computeStrength(seconds),
  }
}
