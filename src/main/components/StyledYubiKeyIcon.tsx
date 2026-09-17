import styled from "@emotion/styled"
import { Fragment, FunctionComponent } from "react"

import YubiKeyIcon from "@/src/main/yubikey.svg"

const gradientId = "sb-yubikey-gradient"

const AnimatedYubiKeyIcon = styled(YubiKeyIcon)`
  @keyframes bounce {
    0%,
    20%,
    53%,
    80%,
    100% {
      animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
      transform: translate3d(0, 0, 0);
    }
    40%,
    43% {
      animation-timing-function: cubic-bezier(0.755, 0.05, 0.855, 0.06);
      transform: translate3d(0, -10px, 0);
    }
    70% {
      animation-timing-function: cubic-bezier(0.755, 0.05, 0.855, 0.06);
      transform: translate3d(0, -5px, 0);
    }
    90% {
      transform: translate3d(0, -1px, 0);
    }
  }
  animation-name: bounce;
  transform-origin: center bottom;
  animation-duration: 1.5s;
  animation-fill-mode: both;
  animation-iteration-count: infinite;
  height: 120px;
  path {
    fill: url(#${gradientId}) !important;
  }
`

// SVG fills cannot reference CSS gradients, so the signature gradient is
// declared once as an SVG gradient (top-left to bottom-right, matching the
// 135deg --sb-gradient) and referenced by the icon paths
const StyledYubiKeyIcon: FunctionComponent = () => {
  return (
    <Fragment>
      <svg aria-hidden height={0} style={{ position: "absolute" }} width={0}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop
              offset="0%"
              style={{ stopColor: "var(--mantine-color-gradient-9)" }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "var(--mantine-color-gradient-0)" }}
            />
          </linearGradient>
        </defs>
      </svg>
      <AnimatedYubiKeyIcon />
    </Fragment>
  )
}

export default StyledYubiKeyIcon
