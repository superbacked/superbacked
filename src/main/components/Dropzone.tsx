import {
  Dropzone as MantineDropzone,
  DropzoneFullScreenProps as MantineDropzoneFullScreenProps,
  FileWithPath as MantineFileWithPath,
} from "@mantine/dropzone"
import { FunctionComponent } from "react"

export type FileWithPath = MantineFileWithPath

export type DropzoneProps = Omit<
  MantineDropzoneFullScreenProps,
  "getFilesFromEvent" | "styles" | "zIndex"
>

export const Dropzone: FunctionComponent<DropzoneProps> = (props) => {
  return (
    <MantineDropzone.FullScreen
      {...props}
      getFilesFromEvent={async (event) =>
        "dataTransfer" in event && event.dataTransfer
          ? Array.from(event.dataTransfer.files)
          : []
      }
      styles={{
        fullScreen: {
          padding: 0,
        },
        root: {
          backgroundImage: "linear-gradient(45deg, #fdc0ee 0%, #fbd6cd 100%)",
          border: "none",
        },
      }}
      zIndex={2000}
    />
  )
}

export default Dropzone
