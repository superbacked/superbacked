// The permissions the app needs, and therefore the only ones a page may
// be granted:
//
// - media, video only: the camera, for the QR scanner (nothing uses the
//   microphone, so a request that includes audio is refused)
// - display-capture: window capture, for scanning a QR code shown in
//   another window
// - clipboard-sanitized-write: copying secrets (see
//   src/main/utilities/clipboard.ts)
//
// Everything else is refused. The list is a cap on the renderer itself,
// not a trust decision about who asks, so a compromised renderer cannot
// turn on the microphone or request device access. Whether the request
// comes from the renderer at all is checked by the caller (see
// src/index.ts).
export const isPermissionAllowed = (
  permission: string,
  mediaTypes: string[]
): boolean => {
  if (permission === "media") {
    return mediaTypes.length > 0 && mediaTypes.every((type) => type === "video")
  }
  return (
    permission === "display-capture" ||
    permission === "clipboard-sanitized-write"
  )
}
