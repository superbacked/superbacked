import "@fontsource/roboto-mono/latin-400.css"
import "@fontsource/roboto-mono/latin-700.css"
import { MantineProvider } from "@mantine/core"
import { useTranslation } from "react-i18next"
import { createGlobalStyle, styled } from "styled-components"
import { setLocale } from "../i18n"
import Logo from "./logo.svg"
import { BlockApi } from "./preload"
import QRCode from "./QRCode"

import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

setLocale(window.blockApi.locale())

const data = window.blockApi.data()

declare global {
  interface Window {
    blockApi: BlockApi
  }
}

const GlobalStyle = createGlobalStyle`
  html {
    @page {
      size: 4in 6in;
    }
  }
`

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
  // setTimeout required to fix font swap timing issue
  setTimeout(() => {
    window.blockApi.ready()
    window.blockApi.pdf(async (buffer) => {
      const doc = await getDocument(buffer).promise
      const page = await doc.getPage(1)
      const scale = 4
      const viewport = page.getViewport({ scale: scale })
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d")
      canvas.height = viewport.height
      canvas.width = viewport.width
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise
      const dataUrl = canvas.toDataURL("image/jpeg", 100)
      window.blockApi.jpg(dataUrl)
    })
  }, 100)
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
        colorScheme: "light",
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
      <GlobalStyle />
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
  )
}

export default App
