import { ActionIcon, Menu, Text } from "@mantine/core"
import { IconMenu2 } from "@tabler/icons-react"
import { Fragment, FunctionComponent } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"

import { useMenuTrigger } from "@/src/main/components/MenuEvents"
import {
  home,
  routes,
  shortcut,
  shortcutFontFamily,
  startsGroup,
} from "@/src/main/utilities/routes"

// The File menu mirrored in the window — home first, then the routes in
// the same groups, triggered through the same rule (see
// src/main/components/MenuEvents.tsx) — reachable from any step of any
// route, where people look for a menu: the top right. The app’s bordered
// icon button, round, at the xs input height, inset 24px from the top
// and the right edges of the window. Hidden on the home view, whose rows
// are this menu. Leaving a route midway discards its state without
// confirmation, as the File menu already does. The button sits below
// overlays and modals (≥200), so a route’s modal keeps the focus
const NavigationMenu: FunctionComponent = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const trigger = useMenuTrigger()
  if (location.pathname === home.to) {
    return null
  }
  const shortcutHint = (key: string) => {
    return (
      <Text c="dimmed" ff={shortcutFontFamily} size="xs" span>
        {shortcut(key)}
      </Text>
    )
  }
  return (
    <Menu offset={8} position="bottom-end">
      <Menu.Target>
        <ActionIcon
          aria-label={t("components.navigationMenu.menu")}
          radius="xl"
          size="input-xs"
          style={{
            position: "fixed",
            right: 24,
            top: 24,
            zIndex: 100,
          }}
          variant="default"
        >
          <IconMenu2 size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          onClick={() => {
            trigger(home.to)
          }}
          rightSection={shortcutHint(home.shortcutKey)}
        >
          {t(home.labelKey)}
        </Menu.Item>
        <Menu.Divider />
        {routes.map((route, index) => {
          return (
            <Fragment key={route.to}>
              {startsGroup(index) === true ? <Menu.Divider /> : null}
              <Menu.Item
                onClick={() => {
                  trigger(route.to)
                }}
                rightSection={shortcutHint(route.shortcutKey)}
              >
                {t(route.labelKey)}
              </Menu.Item>
            </Fragment>
          )
        })}
      </Menu.Dropdown>
    </Menu>
  )
}

export default NavigationMenu
