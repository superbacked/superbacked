import React, {
  FunctionComponent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { useLocation, useNavigate } from "react-router"

// Triggering a route is navigation, or a restart of the view when the
// route is the current one — the File menu (through the IPC event) and
// the in-window navigation menu (see src/main/components/NavigationMenu.tsx)
// share the rule, so the two menus behave alike
const MenuEventsContext = createContext<{
  key: number
  trigger: (to: string) => void
}>({
  key: 0,
  trigger: () => {
    // Without a provider there is nothing to trigger
  },
})

export const MenuEventsContextConsumer = MenuEventsContext.Consumer

export const useMenuTrigger = () => {
  return useContext(MenuEventsContext).trigger
}

interface MenuEventsProps {
  children?: React.ReactNode
}

const MenuEvents: FunctionComponent<MenuEventsProps> = function (props) {
  const location = useLocation()
  const navigate = useNavigate()
  const [key, setKey] = useState(0)

  const trigger = useCallback(
    (to: string) => {
      if (to === location.pathname) {
        setKey((prev) => prev + 1)
      } else {
        void navigate(to)
      }
    },
    [location.pathname, navigate]
  )

  useEffect(() => {
    const removeListener = window.api.events.menuTriggeredRoute(trigger)
    return () => {
      removeListener()
    }
  }, [trigger])

  return (
    <MenuEventsContext.Provider value={{ key: key, trigger: trigger }}>
      {props.children}
    </MenuEventsContext.Provider>
  )
}

export default MenuEvents
