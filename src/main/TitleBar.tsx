import { FunctionComponent, useEffect, useState } from "react"
import { styled } from "styled-components"

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
    const removeListener = window.api.enteredFullScreen(() => {
      setFullscreen(true)
    })
    return () => {
      removeListener()
    }
  }, [])
  useEffect(() => {
    const removeListener = window.api.leftFullScreen(() => {
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
          window.api.toggleMaximize()
        }}
      />
    )
  } else {
    return null
  }
}

export default TitleBar
