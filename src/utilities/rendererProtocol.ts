import { extname, isAbsolute, relative, resolve } from "path"
import { URL } from "url"

// The packaged renderer’s origin. Pages load from a custom scheme served
// by the main process (see src/index.ts) rather than from file://, which
// Electron grants read access to the whole filesystem — a compromised
// page could fetch any file the user can read. On this origin a page can
// reach only the bundle, the IPC sender check has a real host to compare
// and the file protocol fuse can stay off (see builder.config.ts).
// Development serves the renderer from localhost instead.
export const rendererScheme = "app"
export const rendererHost = "superbacked"
export const rendererOrigin = `${rendererScheme}://${rendererHost}`

export const isRendererUrl = (value: string): boolean => {
  return value.startsWith(`${rendererOrigin}/`)
}

// Everything the renderer bundle ships — a request for any other
// extension is refused before the filesystem is consulted.
const contentTypes: Record<string, string> = {
  css: "text/css; charset=utf-8",
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  wav: "audio/wav",
  woff: "font/woff",
  woff2: "font/woff2",
}

export interface RendererFile {
  contentType: string
  path: string
}

// Map a request URL to a file in the renderer bundle, or null when it
// names none: another origin, an extension the bundle never ships or a
// path that escapes the bundle. The URL parser already removes dot
// segments, raw or percent-encoded, so the escape check is for what
// survives parsing — an encoded slash (“..%2f”) that only becomes a
// traversal once decoded. The check is lexical because the bundle lives
// inside app.asar, where realpath cannot follow.
export const resolveRendererFile = (
  rendererPath: string,
  url: string
): null | RendererFile => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (
    parsed.protocol !== `${rendererScheme}:` ||
    parsed.host !== rendererHost
  ) {
    return null
  }
  let pathname: string
  try {
    pathname = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
  if (pathname.includes("\0") === true) {
    return null
  }
  const contentType = contentTypes[extname(pathname).slice(1)]
  if (contentType === undefined) {
    return null
  }
  const path = resolve(rendererPath, `.${pathname}`)
  const relativePath = relative(rendererPath, path)
  if (
    relativePath === "" ||
    relativePath.startsWith("..") === true ||
    isAbsolute(relativePath) === true
  ) {
    return null
  }
  return { contentType: contentType, path: path }
}
