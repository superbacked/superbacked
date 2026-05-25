import { Global, css } from "@emotion/react"
import {
  ActionIcon,
  Input,
  MantineProvider,
  MantineTheme,
  PasswordInput,
  Select,
  Textarea,
  getSize,
} from "@mantine/core"
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
        cssVariablesResolver={() => ({
          variables: {
            "--sb-border": "rgba(255,255,255,0.07)",
            "--sb-overlay-shadow": "0 2px 4px rgba(0,0,0,0.25)",
            "--sb-gradient":
              "linear-gradient(135deg, var(--mantine-color-gradient-9) 0%, var(--mantine-color-gradient-0) 100%)",
            "--sb-input-height-xs": "32px",
            "--sb-input-height-sm": "40px",
            "--sb-input-height-md": "48px",
            "--sb-input-height-lg": "56px",
            "--sb-input-height-xl": "64px",
            "--sb-input-padding-y-xs": "6px",
            "--sb-input-padding-y-sm": "8px",
            "--sb-input-padding-y-md": "12px",
            "--sb-input-padding-y-lg": "16px",
            "--sb-input-padding-y-xl": "20px",
          },
          dark: {
            "--mantine-color-body": "var(--mantine-color-dark-9)",
            "--mantine-color-dark-filled-hover": "var(--mantine-color-dark-8)",
            "--mantine-color-text": "var(--mantine-color-gradient-0)",
          },
          light: {},
        })}
        theme={{
          colors: {
            dark: [
              "#d5d7e0",
              "#b3b1c4",
              "#8d8aa8",
              "#6b678e",
              "#4d4f66",
              "#343149",
              "#2b2c3d",
              "#1a1829",
              "#151321",
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
            gradient: [
              "#fbd6cd",
              "#fbd4d1",
              "#fbd1d4",
              "#fccfd8",
              "#fcccdc",
              "#fccadf",
              "#fcc7e3",
              "#fdc5e7",
              "#fdc2ea",
              "#fdc0ee",
            ],
          },
          components: {
            Combobox: {
              styles: {
                dropdown: {
                  backgroundColor: "var(--mantine-color-dark-7)",
                  borderColor: "var(--sb-border)",
                  borderWidth: 2,
                  boxShadow: "var(--sb-overlay-shadow)",
                },
                option: {
                  color: "var(--mantine-color-text)",
                  borderRadius: "var(--mantine-radius-sm)",
                  "&[data-combobox-selected]": {
                    backgroundImage: "var(--sb-gradient)",
                    color: "var(--mantine-color-dark-9)",
                  },
                },
              },
            },
            ActionIcon: ActionIcon.extend({
              // Targets `icon` selector directly because Mantine’s `color`
              // prop routes through --ai-color which is variant-dependent
              // and not consistently picked up by the SVG.
              styles: {
                icon: {
                  color: "var(--mantine-color-text)",
                },
              },
            }),
            CloseButton: {
              styles: {
                root: {
                  color: "var(--mantine-color-text)",
                },
              },
            },
            ButtonGroup: {
              // Mantine’s adjacent-edge rule is calc(--button-border-width
              // / 2) per side, so 2px here yields a 2px visible separator
              // (matches our default-variant 2px outer border).
              styles: {
                group: {
                  "--button-border-width": "2px",
                },
              },
            },
            Button: {
              defaultProps: {
                loaderProps: { color: "currentColor" },
              },
              styles: (theme: MantineTheme) => ({
                root: {
                  "&[data-variant='default']": {
                    backgroundColor: "var(--mantine-color-dark-7)",
                    borderColor: "var(--sb-border)",
                    borderWidth: 2,
                    color: "var(--mantine-color-text)",
                  },
                  "&[data-variant='signatureGradient']": {
                    background: "var(--sb-gradient)",
                    color: theme.colors.dark[9],
                    "&:disabled": {
                      background: "var(--sb-gradient)",
                      color: theme.colors.dark[9],
                      opacity: 0.5,
                    },
                  },
                  "&[data-variant='signatureTextGradient']": {
                    background: "transparent",
                    backgroundImage: "var(--sb-gradient)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    "&:disabled": {
                      opacity: 0.5,
                    },
                  },
                },
              }),
            },
            Input: Input.extend({
              // Default props.size to "sm" because Mantine’s getSize() returns
              // undefined for undefined size — leaving --input-padding-y unset
              // and forcing CSS fallback to 0, which is why TextInput vs
              // PasswordInput visually diverged when no `size` was passed.
              // --input-placeholder-color is the only knob that reaches both
              // Input (.m_8fb7ebe7::placeholder) and PasswordInput’s inner
              // input (.m_f2d85dd2::placeholder).
              vars: (_theme, props) => {
                const size = props.size ?? "sm"
                return {
                  wrapper: {
                    "--input-height": getSize(size, "sb-input-height"),
                    "--input-padding-y": getSize(size, "sb-input-padding-y"),
                    "--input-padding": getSize(size, "sb-input-padding-y"),
                    "--input-line-height": "var(--mantine-line-height)",
                    "--input-placeholder-color": "var(--mantine-color-dark-4)",
                    "--input-section-color": "var(--mantine-color-dark-4)",
                    "--input-bd": "var(--sb-border)",
                  },
                }
              },
              styles: {
                input: {
                  backgroundColor: "var(--mantine-color-dark-7)",
                  borderWidth: 2,
                  color: "var(--mantine-color-text)",
                  caretColor: "var(--mantine-color-text)",
                  fontSize: "var(--input-fz, var(--mantine-font-size-sm))",
                },
              },
            }),
            PasswordInput: PasswordInput.extend({
              defaultProps: {
                visibilityToggleButtonProps: {
                  variant: "transparent",
                },
              },
              styles: (_theme, props) => {
                // Default props.size to "sm" so getSize() never returns
                // undefined — see the same comment on Input.extend above.
                // PasswordInput’s `vars` typing is restricted to --psi-*, so
                // we set the Input-level variables via `styles.wrapper`.
                // The inner input is `position: absolute; inset: 0` and has
                // no padding-block in its CSS module — apply vertical padding
                // there so it visually matches TextInput.
                const size = props.size ?? "sm"
                return {
                  wrapper: {
                    "--input-height": getSize(size, "sb-input-height"),
                    "--input-padding-y": getSize(size, "sb-input-padding-y"),
                    "--input-padding": getSize(size, "sb-input-padding-y"),
                    "--input-line-height": "var(--mantine-line-height)",
                    "--input-placeholder-color": "var(--mantine-color-dark-4)",
                  },
                  innerInput: {
                    paddingBlock: getSize(size, "sb-input-padding-y"),
                  },
                }
              },
            }),
            InputWrapper: {
              styles: {
                label: {
                  color: "var(--mantine-color-text)",
                  marginBottom: 8,
                },
              },
            },
            Modal: {
              defaultProps: {
                padding: "lg",
              },
              styles: {
                content: {
                  backgroundColor: "var(--mantine-color-dark-7)",
                },
                header: {
                  backgroundColor: "var(--mantine-color-dark-7)",
                },
                title: {
                  fontWeight: "bold",
                  backgroundImage: "var(--sb-gradient)",
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
                title: {
                  color: "var(--mantine-color-text)",
                },
                description: {
                  color: "var(--mantine-color-text)",
                },
                closeButton: {
                  "&:hover": {
                    backgroundColor: "var(--mantine-color-dark-7)",
                  },
                },
              },
            },
            Popover: {
              styles: {
                dropdown: {
                  backgroundColor: "var(--mantine-color-dark-7)",
                  borderColor: "var(--sb-border)",
                  borderWidth: 2,
                  boxShadow: "var(--sb-overlay-shadow)",
                },
                arrow: {
                  backgroundColor: "var(--mantine-color-dark-7)",
                  borderColor: "var(--sb-border)",
                  borderWidth: 2,
                },
              },
            },
            Tooltip: {
              styles: {
                tooltip: {
                  backgroundColor: "var(--mantine-color-dark-7)",
                  boxShadow: "var(--sb-overlay-shadow)",
                  color: "var(--mantine-color-text)",
                },
              },
            },
            Select: Select.extend({
              vars: (_theme, props) => {
                const size = props.size ?? "sm"
                return {
                  wrapper: {
                    "--input-height": getSize(size, "sb-input-height"),
                    "--input-padding-y": getSize(size, "sb-input-padding-y"),
                    "--input-padding": getSize(size, "sb-input-padding-y"),
                    "--input-line-height": "var(--mantine-line-height)",
                  },
                }
              },
              styles: {
                option: {
                  color: "var(--mantine-color-text)",
                  borderRadius: "var(--mantine-radius-sm)",
                  "&[data-combobox-selected]": {
                    backgroundImage: "var(--sb-gradient)",
                    color: "var(--mantine-color-dark-9)",
                  },
                },
              },
            }),
            Switch: {
              styles: {
                label: {
                  color: "var(--mantine-color-text)",
                },
              },
            },
            Text: {
              styles: {
                root: {
                  "&[data-variant='signatureGradient']": {
                    backgroundImage: "var(--sb-gradient)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  },
                },
              },
            },
            Title: {
              styles: {
                root: {
                  "&[data-variant='signatureGradient']": {
                    backgroundImage: "var(--sb-gradient)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  },
                },
              },
            },
            Textarea: Textarea.extend({
              vars: (_theme, props) => {
                const size = props.size ?? "sm"
                return {
                  wrapper: {
                    "--input-padding-y": getSize(size, "sb-input-padding-y"),
                    "--input-padding": getSize(size, "sb-input-padding-y"),
                    "--input-placeholder-color": "var(--mantine-color-dark-4)",
                    "--input-bd": "var(--sb-border)",
                  },
                }
              },
              styles: {
                input: {
                  backgroundColor: "var(--mantine-color-dark-7)",
                  borderWidth: 2,
                  color: "var(--mantine-color-text)",
                  caretColor: "var(--mantine-color-text)",
                },
              },
            }),
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
            html,
            body {
              background-color: var(--mantine-color-body);
            }
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
