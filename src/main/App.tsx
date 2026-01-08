import { Global, css } from "@emotion/react"
import { MantineProvider, darken } from "@mantine/core"
import { MantineEmotionProvider, emotionTransform } from "@mantine/emotion"
import { Notifications, notifications } from "@mantine/notifications"
import { Fragment, useEffect, useState } from "react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { emotionCache } from "@/emotion-cache"
import { setLocale } from "@/src/i18n"
import About from "@/src/main/components/About"
import Disclaimer from "@/src/main/components/Disclaimer"
import MenuEvents, {
  MenuEventsContextConsumer,
} from "@/src/main/components/MenuEvents"
import SelectionAsQrCode from "@/src/main/components/SelectionAsQrCode"
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
import "@mantine/notifications/styles.css"

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
    const removeListener = window.api.events.systemLocaleChange((locale) => {
      notifications.clean()
      void setLocale(locale)
    })
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
            Button: {
              styles: {
                root: {
                  "&[data-variant='signatureGradient']": {
                    background:
                      "linear-gradient(45deg, #fdc0ee 0%, #fbd6cd 100%)",
                    color: "#ffffff",
                    "&:disabled": {
                      color: darken("#ffffff", 0.25),
                      backgroundImage: `linear-gradient(45deg, ${darken(
                        "#fdc0ee",
                        0.25
                      )} 0%, ${darken("#fbd6cd", 0.25)} 100%)`,
                    },
                  },
                  "&[data-variant='signatureTextGradient']": {
                    background: "transparent",
                    backgroundImage:
                      "linear-gradient(45deg, #fdc0ee 0%, #fbd6cd 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    "&:disabled": {
                      backgroundImage: `linear-gradient(45deg, ${darken(
                        "#fdc0ee",
                        0.25
                      )} 0%, ${darken("#fbd6cd", 0.25)} 100%)`,
                    },
                  },
                },
              },
            },
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
            Notification: {
              styles: {
                root: {
                  "&::before": { display: "none" },
                },
              },
            },
            Text: {
              styles: {
                root: {
                  "&[data-variant='signatureGradient']": {
                    backgroundImage:
                      "linear-gradient(45deg, #fdc0ee 0%, #fbd6cd 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  },
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
        <Notifications containerWidth={400} />
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
                    <SelectionAsQrCode />
                    <About />
                  </Fragment>
                )
              }}
            </MenuEventsContextConsumer>
          </MenuEvents>
        </MemoryRouter>
        <Disclaimer />
      </MantineProvider>
    </MantineEmotionProvider>
  )
}

export default App
