import {
  Overlay as MantineOverlay,
  OverlayProps as MantineOverlayProps,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core"
import { FunctionComponent } from "react"

type OverlayProps = Pick<MantineOverlayProps, "zIndex">

const Overlay: FunctionComponent<OverlayProps> = (props) => {
  const theme = useMantineTheme()
  const { colorScheme } = useMantineColorScheme()
  return (
    <MantineOverlay
      backgroundOpacity={0.85}
      blur={4}
      color={colorScheme === "dark" ? theme.colors.dark[7] : "#fff"}
      zIndex={props.zIndex}
    />
  )
}

export default Overlay
