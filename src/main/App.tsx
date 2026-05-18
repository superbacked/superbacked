import { Global, css } from "@emotion/react"
import { MantineProvider, darken } from "@mantine/core"
import { MantineEmotionProvider, emotionTransform } from "@mantine/emotion"
import { Notifications, notifications } from "@mantine/notifications"
import { Fragment, useEffect } from "react"
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
        forceColorScheme="dark"
        stylesTransform={emotionTransform}
        cssVariablesResolver={(theme) => ({
          variables: {
            "--sb-border": "rgba(255,255,255,0.07)",
          },
          dark: {
            "--mantine-color-body": theme.colors.dark[9],
            "--mantine-color-dark-filled-hover": theme.colors.dark[8],
          },
          light: {},
        })}
        theme={{
          colors: {
            dark: [
              "#dad8e3",
              "#b8b4c6",
              "#9692a9",
              "#75708d",
              "#564f6e",
              "#3d3852",
              "#2a253c",
              "#1a1829",
              "#161523",
              "#0f0e19",
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
                    color: "#0f0e19",
                    "&:disabled": {
                      color: darken("#0f0e19", 0.25),
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
            Input: {
              styles: {
                input: {
                  backgroundColor: "var(--mantine-color-dark-7)",
                  borderColor: "var(--sb-border)",
                },
              },
            },
            Modal: {
              defaultProps: {
                padding: "xl",
              },
              styles: {
                title: {
                  fontWeight: "bold",
                  backgroundImage:
                    "linear-gradient(45deg, #fdc0ee 0%, #fbd6cd 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
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
            Textarea: {
              styles: {
                input: {
                  backgroundColor: "var(--mantine-color-dark-7)",
                  borderColor: "var(--sb-border)",
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
              background-color: var(--mantine-color-body);
              user-select: none;
            }
            /* The background-color-fix div fixes a background color inconsistency */
            #background-color-fix {
              position: fixed;
              inset: 0;
              z-index: -1;
              pointer-events: none;
              background-color: var(--mantine-color-body);
              transform: translateZ(0);
            }
          `}
        />
        <div id="background-color-fix" />
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
        <Notifications containerWidth={400} />
      </MantineProvider>
    </MantineEmotionProvider>
  )
}

export default App
