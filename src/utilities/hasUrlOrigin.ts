import { URL } from "url"

// Compare parsed origins so a hostname prefix or URL userinfo cannot
// make an unrelated destination pass a network allowlist.
export const hasUrlOrigin = (value: string, origin: string): boolean => {
  try {
    return new URL(value).origin === origin
  } catch {
    return false
  }
}
