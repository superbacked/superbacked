import styled from "@emotion/styled"
import { FunctionComponent, useEffect, useState } from "react"

const TitleBarContainer = styled.div`
  position: relative;
  height: 28px;
  z-index: 1000;
  -webkit-app-region: drag;
`

const TitleBar: FunctionComponent = () => {
  const [fullscreen, setFullscreen] = useState(false)
  const titleBar = window.api.platform === "darwin" ? true : false
  useEffect(() => {
    const removeListener = window.api.events.windowEnteredFullScreen(() => {
      setFullscreen(true)
    })
    return () => {
      removeListener()
    }
  }, [])
  useEffect(() => {
    const removeListener = window.api.events.windowLeftFullScreen(() => {
      setFullscreen(false)
    })
    return () => {
      removeListener()
    }
  }, [])
  if (fullscreen === false && titleBar === true) {
    return (
      <TitleBarContainer
        onDoubleClick={() => {
          window.api.invoke.toggleMaximize()
        }}
      />
    )
  } else {
    return null
  }
}

export default TitleBar
