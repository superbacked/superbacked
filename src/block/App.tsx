import { css, Global } from "@emotion/react"
import styled from "@emotion/styled"
import { MantineProvider } from "@mantine/core"
import { emotionTransform, MantineEmotionProvider } from "@mantine/emotion"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { emotionCache } from "@/emotion-cache"
import QRCode from "@/src/block/components/QRCode"
import Logo from "@/src/block/logo.svg"
import { BlockApi } from "@/src/block/preload"
import { Data } from "@/src/create"
import { setLocale } from "@/src/i18n"
import pdfToJpeg from "@/src/shared/utilities/pdfToJpeg"
import "@fontsource/roboto-mono/latin-400.css"
import "@fontsource/roboto-mono/latin-700.css"
import "@mantine/core/styles.css"

await setLocale(window.blockApi.locale())

declare global {
  interface Window {
    blockApi: BlockApi
  }
}

const Container = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 4in;
  height: 6in;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  padding: 0.5in;
`

const Hash = styled.div`
  font-size: 0.15625in;
  font-weight: bold;
  text-align: center;
  margin-top: 0.5in;
  overflow-wrap: break-word;
`

const Recover = styled.div`
  position: absolute;
  top: 3in;
  right: 0.125in;
  font-size: 0.09375in;
  text-align: center;
  transform: translateY(-50%) rotate(180deg);
  writing-mode: vertical-rl;
`

const Disclaimer = styled.div`
  position: absolute;
  right: 2in;
  bottom: 0.125in;
  width: 2.5in;
  font-size: 0.09375in;
  font-weight: bold;
  text-align: center;
  transform: translateX(50%);
`

const LogoContainer = styled.div`
  position: absolute;
  right: 0.125in;
  bottom: 0.125in;
  width: 0.5in;
  height: 0.5in;
`

const App = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<Data | null>(null)
  useEffect(() => {
    const dataChangeListener = window.blockApi.dataChange(setData)
    const pdfToJpegListener = window.blockApi.pdfToJpeg(async (pdfBuffer) => {
      const jpeg = await pdfToJpeg(pdfBuffer)
      return jpeg
    })
    return () => {
      dataChangeListener()
      pdfToJpegListener()
    }
  }, [])
  useEffect(() => {
    if (data) {
      void document.fonts.ready.then(() => {
        requestAnimationFrame(() => {
          window.blockApi.ready()
        })
      })
    }
  }, [data])
  if (data) {
    return (
      <MantineEmotionProvider cache={emotionCache}>
        <MantineProvider
          forceColorScheme="light"
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
              html {
                @page {
                  size: 4in 6in;
                }
              }
              body {
                user-select: none;
              }
            `}
          />
          <Container>
            <QRCode value={data.payloadText} />
            <Hash>
              {data.shortHash}
              {data.label ? ` ${data.label}` : null}
            </Hash>
            <Disclaimer>{t("block.importantDocumentDoNotDiscard")}</Disclaimer>
            <Recover>superbacked.com/recover</Recover>
            <LogoContainer>
              <Logo width="0.5in" height="0.5in" />
            </LogoContainer>
          </Container>
        </MantineProvider>
      </MantineEmotionProvider>
    )
  }
  return null
}

export default App
