import assert from "assert"
import { suite, test } from "node:test"

import { isPermissionAllowed } from "@/src/utilities/permissions"

// The session permission table (see src/index.ts) — the renderer gets
// the camera, window capture and clipboard writes and nothing else

suite("isPermissionAllowed", () => {
  test("grants the camera, window capture and clipboard writes", () => {
    assert.strictEqual(isPermissionAllowed("media", ["video"]), true)
    assert.strictEqual(isPermissionAllowed("display-capture", []), true)
    assert.strictEqual(
      isPermissionAllowed("clipboard-sanitized-write", []),
      true
    )
  })

  test("denies the microphone, alone or alongside the camera", () => {
    assert.strictEqual(isPermissionAllowed("media", ["audio"]), false)
    assert.strictEqual(isPermissionAllowed("media", ["video", "audio"]), false)
    assert.strictEqual(isPermissionAllowed("media", ["unknown"]), false)
    assert.strictEqual(isPermissionAllowed("media", []), false)
  })

  test("denies everything else", () => {
    for (const permission of [
      "clipboard-read",
      "fullscreen",
      "geolocation",
      "hid",
      "notifications",
      "openExternal",
      "pointerLock",
      "serial",
      "usb",
      "unknown",
    ]) {
      assert.strictEqual(isPermissionAllowed(permission, ["video"]), false)
    }
  })
})
