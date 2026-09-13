import assert from "assert"
import { suite, test } from "node:test"

import { matchesUrlOrigin } from "@/src/utilities/matchesUrlOrigin"

// Network origin matching for the request allowlist (see src/index.ts) —
// lookalike hosts and deceptive userinfo must never admit another origin.

const origin = "https://superbacked.com"

suite("matchesUrlOrigin", () => {
  test("matches HTTPS URLs with the default port", () => {
    for (const value of [
      "https://superbacked.com",
      "https://superbacked.com/docs?language=en#intro",
      "https://superbacked.com:443/",
    ]) {
      assert.strictEqual(matchesUrlOrigin(value, origin), true)
    }
  })

  test("fails to match lookalike domains and deceptive userinfo", () => {
    for (const value of [
      "https://superbacked.com.attacker.invalid/",
      "https://superbacked.com@attacker.invalid/",
      "https://sub.superbacked.com/",
      "https://attacker.invalid/?url=https://superbacked.com",
    ]) {
      assert.strictEqual(matchesUrlOrigin(value, origin), false)
    }
  })

  test("fails to match different protocols, ports and malformed URLs", () => {
    for (const value of [
      "http://superbacked.com/",
      "ws://superbacked.com/",
      "https://superbacked.com:8443/",
      "file:///superbacked.com",
      "//superbacked.com/",
      "not a URL",
      "",
    ]) {
      assert.strictEqual(matchesUrlOrigin(value, origin), false)
    }
  })

  test("matches development URLs only at the exact localhost port", () => {
    for (const protocol of ["http", "ws"]) {
      const developmentOrigin = `${protocol}://localhost:3000`
      assert.strictEqual(
        matchesUrlOrigin(`${developmentOrigin}/assets`, developmentOrigin),
        true
      )
      for (const value of [
        `${protocol}://localhost:30001/`,
        `${protocol}://localhost:3000@attacker.invalid/`,
      ]) {
        assert.strictEqual(matchesUrlOrigin(value, developmentOrigin), false)
      }
    }
  })
})
