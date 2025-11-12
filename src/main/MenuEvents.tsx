import React, {
  FunctionComponent,
  createContext,
  useEffect,
  useState,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"

const MenuEventsContext = createContext({
  key: 0,
})

export const MenuEventsContextConsumer = MenuEventsContext.Consumer

interface MenuEventsProps {
  children?: React.ReactNode
}

const MenuEvents: FunctionComponent<MenuEventsProps> = function (props) {
  const location = useLocation()
  const navigate = useNavigate()
  const [key, setKey] = useState(0)

  useEffect(() => {
    const removeListener = window.api.menuTriggeredRoute((to: string) => {
      setKey((prev) => prev + 1)
      if (to !== location.pathname) {
        void navigate(to)
      }
    })
    return () => {
      removeListener()
    }
  }, [location.pathname, navigate])

  return (
    <MenuEventsContext.Provider value={{ key }}>
      {props.children}
    </MenuEventsContext.Provider>
  )
}

export default MenuEvents
