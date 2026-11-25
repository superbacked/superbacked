import { Route, RouteId, routes as sharedRoutes } from "@/src/shared/routes"
import { TranslationKey } from "@/src/shared/types/i18n"

export { home, startsGroup } from "@/src/shared/routes"

// The shared route list (see src/shared/routes.ts) with what only the
// window needs: the home view’s descriptions and the shortcut rendering

export type DescribedRoute = Route & {
  descriptionKey: TranslationKey
}

// Keyed by id, so a route added to the shared list without a description
// fails to type-check here
const descriptionKeys: Record<RouteId, TranslationKey> = {
  create: "routes.home.createDescription",
  duplicate: "routes.home.duplicateDescription",
  provisionYubiKey: "routes.home.provisionYubiKeyDescription",
  restore: "routes.home.restoreDescription",
}

export const routes: DescribedRoute[] = sharedRoutes.map((route) => {
  return { ...route, descriptionKey: descriptionKeys[route.id] }
})

const runningMacOS = window.api.platform === "darwin"

// Rendered the way the File menu shows its accelerators (see
// src/menu.ts), so the in-window menu teaches the shortcut that reaches
// each item — buttons show no shortcuts, as a menu is where people
// expect to learn them
export const shortcut = (key: string) => {
  return runningMacOS === true ? `⇧⌘${key}` : `Shift+Ctrl+${key}`
}

// Roboto Mono has no glyphs for the modifier symbols, so a fallback font
// draws them at another size — the system font draws the shortcut the
// way the menu bar does. The other platforms spell the modifiers out,
// which Roboto Mono covers
export const shortcutFontFamily =
  runningMacOS === true ? "-apple-system, system-ui, sans-serif" : undefined
