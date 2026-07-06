import { Global, css } from "@emotion/react"
import styled from "@emotion/styled"
import { MantineProvider } from "@mantine/core"
import { MantineEmotionProvider, emotionTransform } from "@mantine/emotion"
import { TFunction } from "i18next"
import { FunctionComponent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { emotionCache } from "@/emotion-cache"
import QRCode from "@/src/block/components/QRCode"
import Logo from "@/src/block/logo.svg"
import { BlockApi } from "@/src/block/preload"
import { Data } from "@/src/handlers/create"
import { setLocale } from "@/src/i18n"
import pdfToJpeg from "@/src/shared/utilities/pdfToJpeg"
import "@fontsource/roboto-mono/latin-400.css"
import "@fontsource/roboto-mono/latin-700.css"
import "@mantine/core/styles.css"

await setLocale(window.blockApi.invokeSync.getLocale())

declare global {
  interface Window {
    blockApi: BlockApi
  }
}

// 4x6-inch block card, pinned to the top-left of its container: the page for
// the clean preview/save render, or the BlockFrame for the carrier print
// layout (which centers it on a larger sheet with trim marks).
const Card = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 4in;
  height: 6in;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  padding: 0.34in;
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

// Print layout: the page is sized to the 4x6 block plus its trim mark bleed
// (0.25in per side) — smaller than any imageable area — and scaled by the
// calibration factor so the printed block can be measured against true size.
const trimBleed = 0.25 // in, trim mark extent beyond the 4x6 block
const printPageWidth = 4 + 2 * trimBleed // in
const printPageHeight = 6 + 2 * trimBleed // in

const PrintPage = styled.div`
  position: relative;
`

// Media-sized page that centers the print block (with white margin around the
// trim marks) so the print lands centered on the sheet.
const MediaPage = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
`

const BlockFrame = styled.div`
  position: relative;
  width: 4in;
  height: 6in;
  overflow: visible;
`

// Trim mark geometry (matches Superbacked iOS): 0.25in marks, 5pt gap from
// the block corner, 0.5pt stroke.
const markLength = 0.25
const markGap = 5 / 72
const markStroke = 0.5 / 72

const TrimMarks: FunctionComponent = () => {
  const width = 4
  const height = 6
  const gap = markGap
  const mark = markLength
  const lines: [number, number, number, number][] = [
    // Top-left corner
    [-mark, 0, -gap, 0],
    [0, -mark, 0, -gap],
    // Top-right corner
    [width + gap, 0, width + mark, 0],
    [width, -mark, width, -gap],
    // Bottom-left corner
    [-mark, height, -gap, height],
    [0, height + gap, 0, height + mark],
    // Bottom-right corner
    [width + gap, height, width + mark, height],
    [width, height + gap, width, height + mark],
  ]
  return (
    <svg
      width="4in"
      height="6in"
      viewBox="0 0 4 6"
      style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}
    >
      {lines.map(([x1, y1, x2, y2]) => (
        <line
          key={`${x1},${y1},${x2},${y2}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="black"
          strokeWidth={markStroke}
        />
      ))}
    </svg>
  )
}

const BlockContent: FunctionComponent<{ data: Data; t: TFunction }> = ({
  data,
  t,
}) => (
  <>
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
  </>
)

const App = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<null | Data>(null)
  useEffect(() => {
    const dataChangeListener = window.blockApi.events.dataChange(setData)
    const pdfToJpegListener = window.blockApi.events.pdfToJpeg(
      async (pdfBuffer) => {
        const jpeg = await pdfToJpeg(pdfBuffer)
        return jpeg
      }
    )
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
    const printScale = data.printScale
    const printMedia = data.printMedia
    // The block + trim marks, scaled by printScale and centered on the sheet.
    const printBlock = (
      <PrintPage
        style={{
          width: `${printPageWidth}in`,
          height: `${printPageHeight}in`,
          transform: `scale(${printScale ?? 1})`,
          transformOrigin: "center",
        }}
      >
        <BlockFrame
          style={{
            position: "absolute",
            top: `${trimBleed}in`,
            left: `${trimBleed}in`,
          }}
        >
          <Card>
            <BlockContent data={data} t={t} />
          </Card>
          <TrimMarks />
        </BlockFrame>
      </PrintPage>
    )
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
                  size: ${printMedia
                    ? `${printMedia.width}in ${printMedia.height}in`
                    : "4in 6in"};
                }
              }
              body {
                margin: 0;
                user-select: none;
              }
            `}
          />
          {printMedia ? (
            <MediaPage
              style={{
                width: `${printMedia.width}in`,
                height: `${printMedia.height}in`,
              }}
            >
              {printBlock}
            </MediaPage>
          ) : (
            <Card>
              <BlockContent data={data} t={t} />
            </Card>
          )}
        </MantineProvider>
      </MantineEmotionProvider>
    )
  }
  return null
}

export default App
