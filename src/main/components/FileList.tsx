import { CloseButton, Group, Stack, Text, Tooltip } from "@mantine/core"
import { FunctionComponent } from "react"

import { FileWithAbsolutePath } from "@/src/main/components/FileManager"

interface FileListProps {
  files: FileWithAbsolutePath[]
  onRemoveFile: (file: FileWithAbsolutePath) => void
}

const FileList: FunctionComponent<FileListProps> = (props) => {
  return (
    <Stack gap="xs">
      {props.files
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((file) => (
          <Tooltip
            key={file.absolutePath}
            color="dark"
            fz="xs"
            label={file.absolutePath}
            style={{
              maxWidth: "480px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <Group justify="space-between" gap="xs">
              <Text
                size="xs"
                style={{
                  cursor: "default",
                  flex: 1,
                  maxWidth: "400px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </Text>
              <CloseButton onClick={() => props.onRemoveFile(file)} size="xs" />
            </Group>
          </Tooltip>
        ))}
    </Stack>
  )
}

export default FileList
