import {
  Dropzone as MantineDropzone,
  DropzoneFullScreenProps as MantineDropzoneFullScreenProps,
} from "@mantine/dropzone"
import { FunctionComponent } from "react"

type DropzoneProps = Omit<MantineDropzoneFullScreenProps, "styles" | "zIndex">

const Dropzone: FunctionComponent<DropzoneProps> = (props) => {
  return (
    <MantineDropzone.FullScreen
      {...props}
      styles={{
        root: {
          "&[data-idle]": {
            backgroundColor: "transparent",
            border: "none",
          },
          "&[data-accept]": {
            backgroundImage: "linear-gradient(45deg, #fdc0ee 0%, #fbd6cd 100%)",
            border: "none",
          },
          "&[data-reject]": {
            backgroundColor: "transparent",
            border: "none",
          },
        },
        fullScreen: {
          backgroundColor: "transparent",
          padding: 0,
        },
      }}
      zIndex={200}
    />
  )
}

export default Dropzone
