import { Global, css } from "@emotion/react"
import { MantineProvider } from "@mantine/core"
import { MantineEmotionProvider, emotionTransform } from "@mantine/emotion"
import { Fragment, useEffect, useState } from "react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { emotionCache } from "@/emotion-cache"
import { setLocale } from "@/src/i18n"
import About from "@/src/main/components/About"
import Disclaimer from "@/src/main/components/Disclaimer"
import Loading from "@/src/main/components/Loader"
import MenuEvents, {
  MenuEventsContextConsumer,
} from "@/src/main/components/MenuEvents"
import ShowSelectionAsQrCode from "@/src/main/components/ShowSelectionAsQrCode"
import TitleBar from "@/src/main/components/TitleBar"
import { Api } from "@/src/main/preload"
import Create from "@/src/main/routes/Create"
import Duplicate from "@/src/main/routes/Duplicate"
import Restore from "@/src/main/routes/Restore"
import { ColorScheme } from "@/src/utilities/config"

import "@fontsource/roboto-mono/latin-400.css"
import "@fontsource/roboto-mono/latin-700.css"
import "@mantine/core/styles.css"
import "@mantine/dropzone/styles.css"

await setLocale(window.api.invokeSync.getLocale())

declare global {
  interface Window {
    api: Api
  }
}

const App = () => {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(
    window.api.invokeSync.getColorScheme()
  )
  useEffect(() => {
    const removeListener =
      window.api.events.systemColorSchemeChange(setColorScheme)
    return () => {
      removeListener()
    }
  }, [])
  useEffect(() => {
    const removeListener = window.api.events.systemLocaleChange(setLocale)
    return () => {
      removeListener()
    }
  }, [])
  return (
    <MantineEmotionProvider cache={emotionCache}>
      <MantineProvider
        forceColorScheme={colorScheme}
        stylesTransform={emotionTransform}
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
          components: {
            Modal: {
              styles: {
                title: {
                  fontWeight: "bold",
                },
                overlay: {
                  backdropFilter: "blur(4px)",
                },
              },
            },
          },
          fontFamily: "'Roboto Mono', monospace",
          fontFamilyMonospace: "'Roboto Mono', monospace",
          headings: {
            fontFamily: "'Roboto Mono', monospace",
          },
          primaryColor: "pink",
        }}
      >
        <Global
          styles={css`
            body {
              user-select: none;
            }
          `}
        />
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
        <Loading />
        <Disclaimer />
      </MantineProvider>
    </MantineEmotionProvider>
  )
}

export default App
