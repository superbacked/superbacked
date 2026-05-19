import {
  Overlay as MantineOverlay,
  OverlayProps as MantineOverlayProps,
  useMantineTheme,
} from "@mantine/core"
import { FunctionComponent } from "react"

type OverlayProps = Pick<MantineOverlayProps, "zIndex">

const Overlay: FunctionComponent<OverlayProps> = (props) => {
  const theme = useMantineTheme()
  return (
    <MantineOverlay
      backgroundOpacity={0.85}
      blur={4}
      color={theme.colors.dark[9]}
      fixed
      zIndex={props.zIndex}
    />
  )
}

export default Overlay
