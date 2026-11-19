import assert from "assert"
import { suite, test } from "node:test"
import { join } from "path"

import {
  isRendererUrl,
  rendererOrigin,
  resolveRendererFile,
} from "@/src/utilities/rendererProtocol"

// The packaged renderer’s origin (see src/index.ts for the handler) —
// a request must never resolve outside the bundle, to a file type the
// bundle never ships or from another origin.

const rendererPath = "/opt/Superbacked/resources/app.asar/.webpack/renderer"

suite("resolveRendererFile", () => {
  test("resolves bundle files with their content types", () => {
    const expectations: [string, string, string][] = [
      ["main_window/index.html", "main_window/index.html", "text/html"],
      ["block_window/index.js", "block_window/index.js", "text/javascript"],
      [
        "25cfce784f9260537c7c.mjs",
        "25cfce784f9260537c7c.mjs",
        "text/javascript",
      ],
      [
        "2ce87fa79bdaacfcc895.woff2",
        "2ce87fa79bdaacfcc895.woff2",
        "font/woff2",
      ],
      [
        "main_window/../main_window/index.js",
        "main_window/index.js",
        "text/javascript",
      ],
    ]
    for (const [pathname, relativePath, contentType] of expectations) {
      const file = resolveRendererFile(
        rendererPath,
        `${rendererOrigin}/${pathname}`
      )
      assert.notStrictEqual(file, null)
      assert.strictEqual(file?.path, join(rendererPath, relativePath))
      assert.strictEqual(file?.contentType.startsWith(contentType), true)
    }
  })

  test("keeps dot segments inside the bundle", () => {
    // The URL parser removes dot segments, raw or percent-encoded, and
    // clamps them at the root, so none reaches the resolver — the path
    // stays in the bundle and a missing file is refused when read
    const expectations: [string, string][] = [
      ["../main/index.js", "main/index.js"],
      ["../../../../etc/passwd.html", "etc/passwd.html"],
      ["%2e%2e/main/index.js", "main/index.js"],
      ["main_window/%2e%2e/%2e%2e/main/index.js", "main/index.js"],
    ]
    for (const [pathname, relativePath] of expectations) {
      const file = resolveRendererFile(
        rendererPath,
        `${rendererOrigin}/${pathname}`
      )
      assert.strictEqual(file?.path, join(rendererPath, relativePath))
    }
  })

  test("refuses encoded slashes that escape the bundle and null bytes", () => {
    // An encoded slash survives parsing inside one segment and only
    // becomes a traversal once decoded — the lexical check catches it
    for (const pathname of [
      "..%2fmain%2findex.js",
      "main_window%2f..%2f..%2fmain%2findex.js",
      "main_window/index.html%00.txt",
    ]) {
      assert.strictEqual(
        resolveRendererFile(rendererPath, `${rendererOrigin}/${pathname}`),
        null
      )
    }
  })

  test("refuses extensions the bundle never ships and the bare origin", () => {
    for (const url of [
      `${rendererOrigin}/main_window/index.json`,
      `${rendererOrigin}/id_ed25519`,
      `${rendererOrigin}/main_window/`,
      `${rendererOrigin}/`,
      rendererOrigin,
    ]) {
      assert.strictEqual(resolveRendererFile(rendererPath, url), null)
    }
  })

  test("refuses other origins and malformed URLs", () => {
    for (const url of [
      "app://superbacked.attacker.invalid/main_window/index.html",
      "app://attacker.invalid/main_window/index.html",
      "file:///opt/Superbacked/resources/app.asar/.webpack/renderer/main_window/index.html",
      "https://superbacked/main_window/index.html",
      "not a URL",
    ]) {
      assert.strictEqual(resolveRendererFile(rendererPath, url), null)
    }
  })
})

suite("isRendererUrl", () => {
  test("matches the renderer origin only", () => {
    assert.strictEqual(
      isRendererUrl(`${rendererOrigin}/main_window/index.html`),
      true
    )
    for (const url of [
      rendererOrigin,
      "app://superbacked.attacker.invalid/",
      "app://superbacked@attacker.invalid/",
      "file:///opt/Superbacked/resources/app.asar/.webpack/renderer/main_window/index.html",
    ]) {
      assert.strictEqual(isRendererUrl(url), false)
    }
  })
})
