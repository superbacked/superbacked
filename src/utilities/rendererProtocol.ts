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

type ContentSecurityPolicyDirective =
  | "base-uri"
  | "connect-src"
  | "default-src"
  | "font-src"
  | "form-action"
  | "frame-ancestors"
  | "img-src"
  | "media-src"
  | "object-src"
  | "script-src"
  | "style-src"
  | "worker-src"

// Everything a page may load, locked to its own origin: scripts, fonts,
// the pdfjs worker and the audio cue. Images add data: for the QR codes
// and thumbnails the app generates in memory. Styles allow inline
// because Mantine sets style attributes and Emotion inserts rules at
// runtime, neither of which a nonce can cover — inline styles run no
// code and the request filter leaves them no network to reach. Served
// as a header on every page (see src/index.ts); development adds what
// its dev server needs (see webpack.renderer.development.config.ts).
const contentSecurityPolicyDirectives: Record<
  ContentSecurityPolicyDirective,
  string[]
> = {
  "base-uri": ["'none'"],
  "connect-src": ["'self'"],
  "default-src": ["'none'"],
  "font-src": ["'self'"],
  "form-action": ["'none'"],
  "frame-ancestors": ["'none'"],
  "img-src": ["'self'", "data:"],
  "media-src": ["'self'"],
  "object-src": ["'none'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "worker-src": ["'self'"],
}

export const buildContentSecurityPolicy = (
  additions: Partial<Record<ContentSecurityPolicyDirective, string[]>> = {}
): string => {
  const directives: string[] = []
  for (const [directive, sources] of Object.entries(
    contentSecurityPolicyDirectives
  )) {
    const added = additions[directive as ContentSecurityPolicyDirective] ?? []
    directives.push(`${directive} ${[...sources, ...added].join(" ")}`)
  }
  return directives.join("; ")
}

export const contentSecurityPolicy = buildContentSecurityPolicy()

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
  headers: Record<string, string>
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
  const headers: Record<string, string> = { "Content-Type": contentType }
  if (contentType.startsWith("text/html") === true) {
    headers["Content-Security-Policy"] = contentSecurityPolicy
  }
  return { headers: headers, path: path }
}
