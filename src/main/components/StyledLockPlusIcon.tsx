import { IconLockPlus } from "@tabler/icons-react"
import { Fragment, FunctionComponent } from "react"

const gradientId = "sb-lock-plus-gradient"

// SVG strokes cannot reference CSS gradients, so the signature gradient is
// declared once as an SVG gradient (top-left to bottom-right, matching the
// 135deg --sb-gradient) and referenced by the icon stroke — same pattern
// as StyledYubiKeyIcon, whose icon is fill-based. Units are userSpaceOnUse
// over the 24×24 Tabler viewBox: bounding-box units render as none on the
// plus sign, whose straight-line paths have zero-area bounding boxes
const StyledLockPlusIcon: FunctionComponent = () => {
  return (
    <Fragment>
      <svg aria-hidden height={0} style={{ position: "absolute" }} width={0}>
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={gradientId}
            x1="0"
            x2="24"
            y1="0"
            y2="24"
          >
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
      <IconLockPlus size={18} style={{ stroke: `url(#${gradientId})` }} />
    </Fragment>
  )
}

export default StyledLockPlusIcon
