import assert from "assert"
import { suite, test } from "node:test"

import {
  legacyKdfProfile,
  v2ParanoidKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"
import zxcvbn, {
  minimumPassphraseStrength,
} from "@/src/shared/utilities/zxcvbn"

// Reference vectors freeze the estimation scheme — entropy, both displayed
// attack times and the gate verdict for three representative inputs (see
// the reference vectors section of
// docs/passphrase-strength-technical-documentation.md). Times and
// strength alike price the profile the passphrase will stretch under
// (the v2 standard profile by default) — the gate holds the attack time
// constant across profiles, not the entropy. Estimator-driven values can
// shift when zxcvbn dependencies update — a break here is the
// scoring-regression review the freeze demands, not a test to update
// blindly.

suite("zxcvbn", () => {
  test("passes seven large wordlist words (reference vector)", () => {
    const result = zxcvbn(
      "trace synopsis retake enlarging liftoff snazzy chastity"
    )
    // 7 × log2(7776) = 90.47 — deterministic, and past the growth era, so
    // the two displayed times sit exactly 1,000× apart: 8 × 535 billion
    // years crosses the trillion-year display cap
    assert.strictEqual(result.entropy, 90)
    assert.strictEqual(result.entropyDeterministic, true)
    assert.strictEqual(result.slowKey, "overTrillionYears")
    assert.strictEqual(result.slowBase, 0)
    assert.strictEqual(result.fastKey, "billionYears")
    assert.strictEqual(result.fastBase, 4)
    assert.strictEqual(result.strength, 100)
    assert.ok(result.strength >= minimumPassphraseStrength)
  })

  test("rejects five short wordlist words (reference vector)", () => {
    const result = zxcvbn("blast dance visor jog broil")
    // 5 × log2(1296) = 51.70 — the generator-aware attack (1296⁵) is
    // cheaper than zxcvbn’s estimate and prices the gate. Strength equals
    // the displayed slow years — one calibration, so the meter and the
    // text can never disagree
    assert.strictEqual(result.entropy, 52)
    assert.strictEqual(result.entropyDeterministic, true)
    assert.strictEqual(result.slowKey, "years")
    assert.strictEqual(result.slowBase, 35)
    assert.strictEqual(result.fastKey, "years")
    assert.strictEqual(result.fastBase, 5)
    assert.strictEqual(result.strength, 35)
    assert.ok(result.strength < minimumPassphraseStrength)
  })

  test("passes sixteen random characters at the gate boundary (reference vector)", () => {
    // Generated with KeePassXC (~105 bits over the 95-symbol printable
    // set) — zxcvbn charges brute force ten guesses per character (10¹⁶)
    // and no generator-aware path exists for character passwords. At the
    // v2 profile the estimate lands exactly on the fifty-year requirement
    const result = zxcvbn("+^D*_d@R(p8LS[va")
    assert.strictEqual(result.entropy, 53)
    assert.strictEqual(result.entropyDeterministic, false)
    assert.strictEqual(result.slowKey, "years")
    assert.strictEqual(result.slowBase, 50)
    assert.strictEqual(result.fastKey, "years")
    assert.strictEqual(result.fastBase, 8)
    assert.strictEqual(result.strength, 50)
    assert.ok(result.strength >= minimumPassphraseStrength)
  })

  test("scales the gate with the profile", () => {
    // The requirement is fifty years at a million-dollar budget, however
    // they are bought: at the legacy anchor rate five short words hold 24
    // years and fail harder, while under Paranoid mode the same words
    // hold beyond a century and pass — a deliberate, user-owned trade
    const anchored = zxcvbn("blast dance visor jog broil", legacyKdfProfile)
    assert.strictEqual(anchored.slowKey, "years")
    assert.strictEqual(anchored.slowBase, 24)
    assert.strictEqual(anchored.fastKey, "year")
    assert.strictEqual(anchored.fastBase, 1)
    assert.strictEqual(anchored.strength, 24)
    const paranoid = zxcvbn("blast dance visor jog broil", v2ParanoidKdfProfile)
    assert.strictEqual(paranoid.slowKey, "years")
    assert.strictEqual(paranoid.slowBase, 117)
    assert.strictEqual(paranoid.fastKey, "years")
    assert.strictEqual(paranoid.fastBase, 13)
    assert.strictEqual(paranoid.strength, 100)
    assert.ok(paranoid.strength >= minimumPassphraseStrength)
  })

  test("prices near matches like wordlist words (one edit per word)", () => {
    // liftoff truncated to liftof — an attacker runs the wordlist through
    // mangling rules, so the wordlist bound still applies, now as an
    // estimate (tilde) rather than exact
    const result = zxcvbn(
      "trace synopsis retake enlarging liftof snazzy chastity"
    )
    assert.strictEqual(result.entropy, 90)
    assert.strictEqual(result.entropyDeterministic, false)
    assert.strictEqual(result.slowKey, "overTrillionYears")
    assert.strictEqual(result.slowBase, 0)
    assert.ok(result.strength >= minimumPassphraseStrength)
    // Mid-word typo — snazzy as snezzy — is one substitution, the same
    // single edit
    const typo = zxcvbn(
      "trace synopsis retake enlarging liftoff snezzy chastity"
    )
    assert.strictEqual(typo.entropy, 90)
    assert.strictEqual(typo.entropyDeterministic, false)
    // Stray spaces are trim variants — the bound applies, as an estimate
    const padded = zxcvbn(
      " trace synopsis retake enlarging liftoff snazzy chastity "
    )
    assert.strictEqual(padded.entropy, 90)
    assert.strictEqual(padded.entropyDeterministic, false)
  })

  test("gates near matches by the wordlist bound", () => {
    // broil truncated to broi — five near-short-wordlist words fall below
    // the gate exactly like their exact counterparts
    const result = zxcvbn("blast dance visor jog broi")
    assert.strictEqual(result.entropy, 52)
    assert.strictEqual(result.entropyDeterministic, false)
    assert.ok(result.strength < minimumPassphraseStrength)
  })

  test("uses smallest matching wordlist", () => {
    // All seven words sit in the short wordlist, so entropy is
    // 7 × log2(1296) = 72.38 — not 7 × log2(7776)
    const result = zxcvbn("acid acorn acre acts afar affix aged")
    assert.strictEqual(result.entropy, 72)
    assert.strictEqual(result.entropyDeterministic, true)
  })

  test("gates repeated wordlist words by the cheaper zxcvbn estimate", () => {
    const result = zxcvbn("abacus abacus abacus abacus abacus abacus abacus")
    // Displayed entropy assumes uniform selection — the gate does not
    assert.strictEqual(result.entropy, 90)
    assert.strictEqual(result.entropyDeterministic, true)
    assert.ok(result.strength < minimumPassphraseStrength)
  })

  test("prices product context as known", () => {
    // superbacked is fed to zxcvbn as a user input — an attacker tries
    // product context before anything else
    const result = zxcvbn("superbacked master 2026")
    assert.ok(result.strength < minimumPassphraseStrength)
  })

  test("falls back to zxcvbn entropy estimate", () => {
    const result = zxcvbn("abacus abdomen Superbacked")
    assert.strictEqual(
      result.entropy,
      Math.round(result.guessesLog10 * Math.log2(10))
    )
    assert.strictEqual(result.entropyDeterministic, false)
  })
})
