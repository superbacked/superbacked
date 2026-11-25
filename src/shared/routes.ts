import { TranslationKey } from "@/src/shared/types/i18n"

// The routes the app offers, in the order and the groups the File menu
// lists them — the one list behind the File menu (see src/menu.ts), the
// home view (see src/main/routes/Home.tsx) and the in-window navigation
// menu (see src/main/components/NavigationMenu.tsx), so the three cannot
// drift. Shared because the File menu is built in the main process:
// nothing here may touch the window

export type RouteId = "create" | "duplicate" | "provisionYubiKey" | "restore"

// What a menu needs to take the window somewhere — a route or the home
// view
export type Destination = {
  // The name, as the File menu shows it
  labelKey: TranslationKey
  // The letter of the File menu accelerator
  shortcutKey: string
  to: string
}

export type Route = Destination & {
  // The File menu separates the block routes from the YubiKey one — the
  // home view and the in-window menu mark the same boundary (see
  // startsGroup below)
  group: "block" | "yubikey"
  id: RouteId
}

export const routes: Route[] = [
  {
    group: "block",
    id: "create",
    labelKey: "menu.file.create",
    shortcutKey: "C",
    to: "/create",
  },
  {
    group: "block",
    id: "restore",
    labelKey: "menu.file.restore",
    shortcutKey: "R",
    to: "/restore",
  },
  {
    group: "block",
    id: "duplicate",
    labelKey: "menu.file.duplicate",
    shortcutKey: "D",
    to: "/duplicate",
  },
  {
    group: "yubikey",
    id: "provisionYubiKey",
    labelKey: "menu.file.provisionYubiKey",
    shortcutKey: "Y",
    to: "/provision-yubikey",
  },
]

// The home view — the view the routes are chosen from, listed first and
// set apart in both menus
export const home: Destination = {
  labelKey: "menu.file.home",
  shortcutKey: "H",
  to: "/",
}

// Whether the route at this index opens a new group — where a menu draws
// its separator and the home view widens its gap
export const startsGroup = (index: number) => {
  const route = routes[index]
  const previousRoute = routes[index - 1]
  return (
    route !== undefined &&
    previousRoute !== undefined &&
    previousRoute.group !== route.group
  )
}
