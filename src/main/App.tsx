import "@fontsource/roboto-mono/latin-400.css"
import "@fontsource/roboto-mono/latin-700.css"
import { MantineProvider } from "@mantine/core"
import { Fragment, useEffect, useState } from "react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { setLocale } from "../i18n"
import About from "./About"
import Disclaimer from "./Disclaimer"
import MenuEvents, { MenuEventsContextConsumer } from "./MenuEvents"
import ShowSelectionAsQrCode from "./ShowSelectionAsQrCode"
import TitleBar from "./TitleBar"
import { Api } from "./preload"
import Create from "./routes/Create"
import Duplicate from "./routes/Duplicate"
import Restore from "./routes/Restore"

setLocale(window.api.locale())

declare global {
  interface Window {
    api: Api
  }
}

const App = () => {
  const [colorScheme, setColorScheme] = useState(window.api.colorScheme())
  const [showDisclaimer, setShowDisclaimer] = useState(true)
  useEffect(() => {
    const removeListener = window.api.colorSchemeChange((colorScheme) => {
      setColorScheme(colorScheme)
    })
    return () => {
      removeListener()
    }
  }, [])
  useEffect(() => {
    const removeListener = window.api.localeChange((locale) => {
      setLocale(locale)
    })
    return () => {
      removeListener()
    }
  }, [])
  return (
    <MantineProvider
      theme={{
        colors: {
          dark: [
            "#d5d7e0",
            "#acaebf",
            "#8c8fa3",
            "#666980",
            "#4d4f66",
            "#34354a",
            "#2b2c3d",
            "#1c1b24",
            "#1c1b24",
            "#1c1b24",
          ],
          pink: [
            "#fafafa",
            "#faf4f9",
            "#fbedf7",
            "#fbe7f6",
            "#fbe0f5",
            "#fcdaf3",
            "#fcd3f2",
            "#fccdf1",
            "#fdc6ef",
            "#fdc0ee",
          ],
        },
        colorScheme: colorScheme,
        fontFamily: "'Roboto Mono', monospace",
        fontFamilyMonospace: "'Roboto Mono', monospace",
        headings: {
          fontFamily: "'Roboto Mono', monospace",
        },
        primaryColor: "pink",
        globalStyles: () => ({
          body: {
            userSelect: "none",
          },
        }),
      }}
      withGlobalStyles
      withNormalizeCSS
    >
      <TitleBar />
      <MemoryRouter>
        <MenuEvents>
          <MenuEventsContextConsumer>
            {(context) => {
              return (
                <Fragment>
                  <Routes>
                    <Route path="/" element={<Create key={context.key} />} />
                    <Route
                      path="/duplicate"
                      element={<Duplicate key={context.key} />}
                    />
                    <Route
                      path="/restore"
                      element={<Restore key={context.key} />}
                    />
                  </Routes>
                  <ShowSelectionAsQrCode />
                  <About />
                </Fragment>
              )
            }}
          </MenuEventsContextConsumer>
        </MenuEvents>
      </MemoryRouter>
      {showDisclaimer === true ? (
        <Disclaimer
          close={() => {
            setShowDisclaimer(false)
          }}
        />
      ) : null}
    </MantineProvider>
  )
}

export default App
