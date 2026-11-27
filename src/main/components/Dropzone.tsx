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
      // A drop leaves keyboard focus with the file manager, so a field
      // the drop handler goes on to focus would show a caret while
      // keystrokes land elsewhere — ask for the window first, on every
      // drop (accepted or rejected, the user is now working here; see
      // src/handlers/focusWindow.ts for what each platform makes of it)
      onDropAny={(files, fileRejections) => {
        void window.api.invoke.focusWindow()
        if (props.onDropAny !== undefined) {
          props.onDropAny(files, fileRejections)
        }
      }}
      styles={{
        fullScreen: {
          padding: 0,
        },
        root: {
          backgroundImage: "var(--sb-gradient)",
          border: "none",
        },
      }}
      zIndex={2000}
    />
  )
}

export default Dropzone
