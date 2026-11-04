import assert from "assert"
import { suite, test } from "node:test"

import {
  legacyKdfProfile,
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/kdfProfiles"

// Profiles are append-only and frozen forever — artifacts never store
// parameters, so editing a row silently changes the key of every
// artifact created with it. These assertions exist to fail that edit.
suite("kdfProfiles", () => {
  test("freezes legacy profile", () => {
    assert.deepStrictEqual(legacyKdfProfile, {
      memoryKiB: 65536,
      passes: 10,
      parallelism: 2,
    })
  })
  test("freezes standard profile", () => {
    assert.deepStrictEqual(standardKdfProfile, {
      memoryKiB: 65536,
      passes: 80,
      parallelism: 4,
    })
  })
  test("freezes paranoid profile", () => {
    assert.deepStrictEqual(paranoidKdfProfile, {
      memoryKiB: 1048576,
      passes: 50,
      parallelism: 4,
    })
  })
  test("rejects mutation", () => {
    assert.throws(() => {
      // @ts-expect-error frozen contract
      legacyKdfProfile.passes = 11
    })
  })
})
