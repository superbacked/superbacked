import assert from "assert"
import { suite, test } from "node:test"

import {
  legacyKdfProfile,
  v2ParanoidKdfProfile,
  v2StandardKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"

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
  test("freezes v2 profile", () => {
    assert.deepStrictEqual(v2StandardKdfProfile, {
      memoryKiB: 65536,
      passes: 80,
      parallelism: 4,
    })
  })
  test("freezes v2 paranoid profile", () => {
    assert.deepStrictEqual(v2ParanoidKdfProfile, {
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
