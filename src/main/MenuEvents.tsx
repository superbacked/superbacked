import React, {
  FunctionComponent,
  createContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { NavigateFunction, useLocation, useNavigate } from "react-router-dom"

const MenuEventsContext = createContext({
  key: Date.now(),
})

export const MenuEventsContextConsumer = MenuEventsContext.Consumer

interface MenuEventsProps {
  children?: React.ReactNode
}

const MenuEvents: FunctionComponent<MenuEventsProps> = function (props) {
  const location = useLocation()
  const currentPathname = useRef<string>(null)
  const navigateFunction = useRef<NavigateFunction>(null)
  const [key, setKey] = useState(Date.now())
  navigateFunction.current = useNavigate()
  useEffect(() => {
    currentPathname.current = location.pathname
  }, [location.pathname])
  useEffect(() => {
    const removeListener = window.api.menuTriggeredRoute((to: string) => {
      setKey(Date.now())
      if (to !== currentPathname.current) {
        navigateFunction.current(to)
      }
    })
    return () => {
      removeListener()
    }
  }, [])
  return (
    <MenuEventsContext.Provider
      value={{
        key: key,
      }}
    >
      {props.children}
    </MenuEventsContext.Provider>
  )
}

export default MenuEvents
