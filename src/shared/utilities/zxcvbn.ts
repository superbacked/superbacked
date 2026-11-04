import { ZxcvbnResult, zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core"
import {
  adjacencyGraphs as languageCommonAdjacencyGraphs,
  dictionary as languageCommonDictionary,
} from "@zxcvbn-ts/language-common"
import { dictionary as languageEnDictionary } from "@zxcvbn-ts/language-en"

import {
  KdfProfile,
  legacyKdfProfile,
  standardKdfProfile,
} from "@/src/shared/kdfProfiles"
import effLargeWordlist from "@/wordlists/eff_large_wordlist.json"
import effShortWordlist1 from "@/wordlists/eff_short_wordlist_1.json"
import effShortWordlist20 from "@/wordlists/eff_short_wordlist_2_0.json"

// Configured once at module load — setOptions rebuilds the ranked
// dictionaries (tens of thousands of words), far too heavy to re-run
// per evaluation while the strength popover re-prices every keystroke
zxcvbnOptions.setOptions({
  graphs: languageCommonAdjacencyGraphs,
  dictionary: {
    ...languageCommonDictionary,
    ...languageEnDictionary,
  },
})

const second = 1
const minute = second * 60
const hour = minute * 60
const day = hour * 24
// Gregorian mean year; the display month is a twelfth of it, so the
// units nest exactly
const year = day * 365.2425
const month = year / 12

// New passphrases must score a strength of at least 50 — fifty years
// against a million-dollar standing attack budget, priced at the KDF
// profile the passphrase will actually stretch under — wherever
// Superbacked accepts one, app modals and command-line interface alike,
// with no override, while restoration is never gated (see
// docs/technical-documentation/passphrase-strength.md).
// The requirement
// is the attack time, not an entropy quota: a stronger profile buys real
// years, so it admits proportionally weaker passphrases — a deliberate,
// user-owned trade under Paranoid mode. The threshold and the anchor
// calibration can never effectively rise (profiles only lower the
// entropy bar): derived passwords re-derive deterministically, so a
// raised bar would strand established master passphrases.
export const minimumPassphraseStrength = 50

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
  | "millionYears"
  | "billionYears"
  | "overTrillionYears"

export interface Result extends ZxcvbnResult {
  entropy: number
  entropyDeterministic: boolean
  fastBase: number
  fastKey: ZxcvbnTranslationKey
  slowBase: number
  slowKey: ZxcvbnTranslationKey
  strength: number
}

// Passphrases whose words all come from a single shipped wordlist carry
// exactly length × log2(wordlist size) bits — zxcvbn special-cases its
// diceware dictionary (the EFF large list) at a fixed 3,888 guesses per
// word and prices short wordlist words by ordinary rank, so its estimate
// runs low on the large list and arbitrarily off on the short lists.
// Lists are tried smallest first: an attacker who knows the
// generator searches the smallest space containing every word. Words
// within one edit of a list member qualify too — wordlist plus mangling
// rules is standard cracking methodology, and single-character edits cost
// the attacker at most ~2⁹ variants per word, so pricing a near miss
// identically to an exact match understates attacker cost by at most
// ~9 bits per word, erring safe. Near matches are bounds, not exact by
// construction — they display with the tilde.
const wordlists = [effLargeWordlist, effShortWordlist1, effShortWordlist20]
  .map((list) => {
    // Length buckets narrow the near-match scan to candidates within one
    // edit’s length difference
    const wordsByLength = new Map<number, string[]>()
    for (const word of list) {
      const bucket = wordsByLength.get(word.length)
      if (bucket === undefined) {
        wordsByLength.set(word.length, [word])
      } else {
        bucket.push(word)
      }
    }
    return {
      bitsPerWord: Math.log2(list.length),
      words: new Set<string>(list),
      wordsByLength,
    }
  })
  .sort((a, b) => a.bitsPerWord - b.bitsPerWord)

// Levenshtein distance ≤ 1 without the DP table: scan to the first
// mismatch, then the suffixes must align under one substitution (equal
// length) or one insertion (length differs by one)
const withinOneEdit = (left: string, right: string): boolean => {
  if (left === right) {
    return true
  }
  const a = left.length <= right.length ? left : right
  const b = left.length <= right.length ? right : left
  if (b.length - a.length > 1) {
    return false
  }
  let index = 0
  while (index < a.length && a[index] === b[index]) {
    index++
  }
  if (a.length === b.length) {
    return a.slice(index + 1) === b.slice(index + 1)
  }
  return a.slice(index) === b.slice(index + 1)
}

const nearWordlist = (
  word: string,
  wordsByLength: Map<number, string[]>
): boolean => {
  for (let length = word.length - 1; length <= word.length + 1; length++) {
    const bucket = wordsByLength.get(length)
    if (bucket === undefined) {
      continue
    }
    for (const candidate of bucket) {
      if (withinOneEdit(word, candidate)) {
        return true
      }
    }
  }
  return false
}

const wordlistEntropy = (
  passphrase: string
): { bits: number; exact: boolean } | null => {
  const words = passphrase.split(" ").filter((word) => word !== "")
  if (words.length === 0) {
    return null
  }
  // Stray spaces — leading, trailing or doubled — cost an attacker a
  // handful of trim variants, so the wordlist bound still applies, though
  // as an estimate rather than an exact match
  const stray = words.join(" ") !== passphrase
  for (const wordlist of wordlists) {
    let exact = stray === false
    let matched = true
    for (const word of words) {
      if (wordlist.words.has(word)) {
        continue
      }
      exact = false
      if (nearWordlist(word, wordlist.wordsByLength)) {
        continue
      }
      matched = false
      break
    }
    if (matched) {
      return { bits: words.length * wordlist.bitsPerWord, exact }
    }
  }
  return null
}

// Budget calibration — attack times price the KDF at standing attack
// budgets. The anchor is the legacy profile: Argon2d at 64 MiB and 10
// passes is memory-bandwidth-bound at roughly 2–3 × 10³ guesses per
// second per ~$30k accelerator (about a gigabyte of memory traffic per
// guess against ~3 TB/s), so a billion dollars of current-generation
// hardware sustains about 10⁸ guesses per second (calibrated July 2026)
// — and rate scales linearly with capital, so a million dollars sustains
// 10⁵. The gate is defined through this calibration, so the anchor
// constants are frozen: recalibrating would move the gate and strand
// established passphrases. Both displayed times and strength scale off
// the anchor by the active profile (see profileRate), so the meter, the
// displayed years and the gate always speak the same number
const billionDollarGuessesPerSecond = 1e8
const millionDollarGuessesPerSecond = 1e5

// Attack rate for a profile — memory traffic per guess is memory × passes
// in the bandwidth-bound model, so the rate is the anchor scaled by the
// traffic ratio. Times and strength alike follow the profile the
// passphrase will actually stretch under — the gate holds the attack
// time constant across profiles, not the entropy
const profileRate = (guessesPerSecond: number, profile: KdfProfile): number => {
  return (
    (guessesPerSecond *
      (legacyKdfProfile.memoryKiB * legacyKdfProfile.passes)) /
    (profile.memoryKiB * profile.passes)
  )
}
// Compute per dollar doubles roughly every three years…
const annualComputeGrowth = 2 ** (1 / 3)
// …but not forever: total improvement is capped at 1000× (about thirty
// years of doublings), after which the attack proceeds flat at the final
// rate. The cap is physical, not just editorial caution — a guess moves
// about a gigabyte through memory (~0.04 J today) against a Landauer
// floor near 10⁻¹¹ J, so even a thermodynamically perfect machine caps
// the possible improvement near 10⁹ — 1000× is a conservative pick well
// inside that headroom
const maximumComputeGrowth = 1000

// Attack time accounts for the attacker reinvesting the same budget in
// improving hardware: within the growth era, time to G guesses solves
// ∫ r·gᵗ dt = G, capping time logarithmically — beyond the era, the
// attack proceeds flat at the final rate
const budgetSeconds = (guesses: number, guessesPerSecond: number): number => {
  const growth = Math.log(annualComputeGrowth)
  const eraSeconds = (year * Math.log(maximumComputeGrowth)) / growth
  const eraGuesses =
    (guessesPerSecond * year * (maximumComputeGrowth - 1)) / growth
  if (guesses <= eraGuesses) {
    return (
      (year * Math.log(1 + (guesses * growth) / (guessesPerSecond * year))) /
      growth
    )
  }
  return (
    eraSeconds +
    (guesses - eraGuesses) / (guessesPerSecond * maximumComputeGrowth)
  )
}

// One point of strength is one estimated year of attack at a
// million-dollar standing budget priced at the active profile, clamped
// to 1–100 — the meter, the displayed slow figure and the gate speak the
// same units and round to the same integer, so they can never disagree.
// The gate is fed the cheapest known
// attack — the smaller of zxcvbn’s estimate and the wordlist guess count
// (exact or within one edit): an attacker knows the shipped wordlists
// (five short-wordlist words cost at most 1296⁵ however rare the words
// are in English), while zxcvbn catches adversarial structure (repeated
// words) the wordlist bound assumes away
export const computeStrength = (guesses: number, profile: KdfProfile) => {
  return Math.min(
    Math.max(
      Math.round(
        budgetSeconds(
          guesses,
          profileRate(millionDollarGuessesPerSecond, profile)
        ) / year
      ),
      1
    ),
    100
  )
}

const computeBudgetDisplay = (
  guesses: number,
  guessesPerSecond: number
): { key: ZxcvbnTranslationKey; base: number } => {
  const seconds = budgetSeconds(guesses, guessesPerSecond)
  if (seconds < 1) {
    return { key: "ltSecond", base: 0 }
  }
  const scale = (
    value: number,
    singular: ZxcvbnTranslationKey,
    plural: ZxcvbnTranslationKey
  ): { key: ZxcvbnTranslationKey; base: number } => {
    const base = Math.round(value)
    return { key: base === 1 ? singular : plural, base }
  }
  if (seconds < minute) {
    return scale(seconds, "second", "seconds")
  }
  if (seconds < hour) {
    return scale(seconds / minute, "minute", "minutes")
  }
  if (seconds < day) {
    return scale(seconds / hour, "hour", "hours")
  }
  if (seconds < month) {
    return scale(seconds / day, "day", "days")
  }
  if (seconds < year) {
    return scale(seconds / month, "month", "months")
  }
  const years = seconds / year
  if (years < 1e6) {
    return scale(years, "year", "years")
  }
  if (years < 1e9) {
    return { key: "millionYears", base: Math.round(years / 1e6) }
  }
  if (years < 1e12) {
    return { key: "billionYears", base: Math.round(years / 1e9) }
  }
  return { key: "overTrillionYears", base: 0 }
}

// Product context an attacker tries before anything else — fed to zxcvbn
// as user inputs so passphrases built on it price accordingly
const userInputs = ["superbacked"]

// The profile defaults to the creation default (see
// src/shared/kdfProfiles.ts) — every surface that accepts a new
// passphrase stretches at it. Callers creating under another profile
// (Paranoid mode) pass their row, scaling the displayed times and the
// gate together — the requirement is fifty years, however they are bought
export default (
  passphrase: string,
  profile: KdfProfile = standardKdfProfile
): Result => {
  const result = zxcvbn(passphrase, userInputs) as Result
  const wordlistMatch = wordlistEntropy(passphrase)
  const entropy = wordlistMatch?.bits ?? result.guessesLog10 * Math.log2(10)
  // The wordlist bound drives the displayed guess count, keeping displayed
  // times consistent with the displayed bits — the gate reads the cheaper
  // of the two attacks (see computeStrength)
  const guesses =
    wordlistMatch === null ? result.guesses : 2 ** wordlistMatch.bits
  const slow = computeBudgetDisplay(
    guesses,
    profileRate(millionDollarGuessesPerSecond, profile)
  )
  const fast = computeBudgetDisplay(
    guesses,
    profileRate(billionDollarGuessesPerSecond, profile)
  )
  return {
    ...result,
    entropy: Math.round(entropy),
    entropyDeterministic: wordlistMatch?.exact ?? false,
    fastBase: fast.base,
    fastKey: fast.key,
    slowBase: slow.base,
    slowKey: slow.key,
    strength: computeStrength(Math.min(result.guesses, guesses), profile),
  }
}
