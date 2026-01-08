import {
  Box,
  Button,
  Center,
  Group,
  Popover,
  ScrollArea,
  Space,
} from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { notifications } from "@mantine/notifications"
import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { CreateArchiveResult } from "@/src/handlers/archive"
import ActionBadge from "@/src/main/components/ActionBadge"
import CreateStandaloneArchiveModal from "@/src/main/components/CreateStandaloneArchiveModal"
import Dropzone, { FileWithPath } from "@/src/main/components/Dropzone"
import ErrorModal, { ErrorState } from "@/src/main/components/ErrorModal"
import FileList from "@/src/main/components/FileList"
import Overlay from "@/src/main/components/Overlay"
import RestoreStandaloneArchiveModal from "@/src/main/components/RestoreStandaloneArchiveModal"
import { ValidateTranslationKeys } from "@/src/shared/types/i18n"
import CustomError from "@/src/shared/utilities/CustomError"

const deduplicateFiles = (files: FileWithAbsolutePath[]) => {
  return files.filter(
    (file, index, array) =>
      array.findIndex(
        (currentFile) => currentFile.absolutePath === file.absolutePath
      ) === index
  )
}

type FileManagerErrorMessage = ValidateTranslationKeys<
  | "components.fileManager.couldNotHandleDroppedFiles"
  | "components.fileManager.couldNotCreateStandaloneArchive"
  | "components.fileManager.couldNotRestoreStandaloneArchive"
>

class FileManagerError extends CustomError<FileManagerErrorMessage> {
  constructor(message: FileManagerErrorMessage) {
    super(message)
    this.name = "FileManagerError"

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FileManagerError)
    }
  }
}

export interface FileWithAbsolutePath extends Pick<
  FileWithPath,
  "name" | "size" | "type"
> {
  absolutePath: string
}

export interface FileManagerRef {
  removeFile: (file: FileWithAbsolutePath) => void
}

type FileManagerProps = {
  mode?: "detached" | "standalone"
  handleFiles: (files: FileWithAbsolutePath[]) => void
}

const FileManager = forwardRef<FileManagerRef, FileManagerProps>(
  (props, ref) => {
    const { t } = useTranslation()

    const [overlayOpened, overlayHandlers] = useDisclosure(false)
    const [popoverOpened, popoverHandlers] = useDisclosure(false)
    const [archiveModalOpened, archiveModalHandlers] = useDisclosure(false)
    const [passphraseModalOpened, passphraseModalHandlers] =
      useDisclosure(false)

    const { open: showOverlay, close: hideOverlay } = overlayHandlers
    const { close: closePopover, toggle: togglePopover } = popoverHandlers
    const { open: openArchiveModal, close: closeArchiveModal } =
      archiveModalHandlers
    const { open: openPassphraseModal, close: closePassphraseModal } =
      passphraseModalHandlers

    const [selectedFiles, setSelectedFiles] = useState<FileWithAbsolutePath[]>(
      []
    )
    const [isCreatingArchive, setIsCreatingArchive] = useState(false)
    const [isRestoringArchive, setIsRestoringArchive] = useState(false)

    const [archiveError, setArchiveError] =
      useState<null | FileManagerErrorMessage>(null)
    const [restoreError, setRestoreError] =
      useState<null | FileManagerErrorMessage>(null)
    const [error, setError] =
      useState<null | ErrorState<FileManagerErrorMessage>>(null)

    const { handleFiles } = props

    useEffect(() => {
      if (overlayOpened) {
        const activeElement = document.activeElement as HTMLElement
        activeElement?.blur()
      }
    }, [overlayOpened])

    const reset = useCallback(() => {
      setSelectedFiles([])
      handleFiles([])
    }, [handleFiles])

    const removeFile = useCallback(
      (fileToRemove: FileWithAbsolutePath) => {
        setSelectedFiles((prev) => {
          const files = prev.filter(
            (file) => file.absolutePath !== fileToRemove.absolutePath
          )
          if (files.length === 0) {
            hideOverlay()
            closePopover()
            reset()
          }
          handleFiles(files)
          return files
        })
      },
      [hideOverlay, closePopover, reset, handleFiles]
    )

    const createArchive = useCallback(
      async (
        filename: string,
        passphrase: string
      ): Promise<void | CreateArchiveResult> => {
        setIsCreatingArchive(true)
        const filePaths = selectedFiles.map((file) => file.absolutePath)
        try {
          const saveDialogReturnValue = await window.api.invoke.chooseDirectory(
            t("handlers.createArchive.chooseWhereToSaveArchive", {
              count: 1,
            })
          )
          if (saveDialogReturnValue.canceled) {
            return
          }
          const archivePath = `${saveDialogReturnValue.filePath}/${filename}.superbacked`
          const result = await window.api.invoke.createArchive(
            filePaths,
            archivePath,
            { passphrase }
          )
          if (result?.success === false && result.error) {
            throw new FileManagerError(
              "components.fileManager.couldNotCreateStandaloneArchive"
            )
          }
          return result
        } finally {
          setIsCreatingArchive(false)
        }
      },
      [selectedFiles, t]
    )

    const restoreArchive = useCallback(
      async (passphrase: string) => {
        if (
          !selectedFiles[0] ||
          selectedFiles[0].name.endsWith(".superbacked") === false
        ) {
          throw new Error("Invalid files array")
        }
        const filePath = selectedFiles[0].absolutePath

        const saveDialogReturnValue = await window.api.invoke.chooseDirectory(
          t("handlers.restoreArchive.chooseWhereToSaveArchiveContent")
        )
        if (saveDialogReturnValue.canceled) {
          return
        }
        const outputDir = saveDialogReturnValue.filePath
        if (!outputDir) {
          throw new Error("Could not get output directory")
        }

        const result = await window.api.invoke.restoreArchive(
          filePath,
          outputDir,
          { passphrase }
        )
        if (result?.success === false && result.error) {
          throw new FileManagerError(
            "components.fileManager.couldNotRestoreStandaloneArchive"
          )
        }
        return result
      },
      [selectedFiles, t]
    )

    useImperativeHandle(
      ref,
      () => ({
        removeFile,
      }),
      [removeFile]
    )

    return (
      <Fragment>
        <Dropzone
          onDrop={async (files) => {
            try {
              const droppedFiles: FileWithAbsolutePath[] = []
              for (const file of files) {
                // const totalSize = Array.from(selectedFiles).reduce(
                //   (sum, currentFile) => sum + currentFile.size,
                //   0
                // )
                // if (totalSize + file.size > 1024 * 1024 ** 2) {
                //   throw new FileManagerError(
                //     "components.fileManager.totalSizeExceeded"
                //   )
                // }
                const fileManagerFile: FileWithAbsolutePath = {
                  absolutePath: window.api.getPathForFile(file),
                  name: file.name,
                  size: file.size,
                  type: file.type,
                }
                droppedFiles.push(fileManagerFile)
              }
              const deduplicatedFiles = deduplicateFiles([
                ...selectedFiles,
                ...droppedFiles,
              ])
              setSelectedFiles(deduplicatedFiles)
              handleFiles(deduplicatedFiles)
              if (props.mode === "standalone") {
                const isSuperbackedArchive =
                  deduplicatedFiles.length === 1 &&
                  deduplicatedFiles[0]?.name.endsWith(".superbacked")
                showOverlay()
                if (isSuperbackedArchive) {
                  openPassphraseModal()
                }
              }
            } catch (onDropError) {
              if (onDropError instanceof FileManagerError) {
                setError({ message: onDropError.message })
              } else {
                // This should never occur but handling edge case
                setError({
                  message: "components.fileManager.couldNotHandleDroppedFiles",
                })
              }
            }
          }}
        />
        {overlayOpened ? (
          <Fragment>
            <Overlay zIndex={200} />
            <Center
              styles={{
                root: {
                  inset: 0,
                  position: "fixed",
                  zIndex: 300,
                },
              }}
            >
              <Box>
                <Button.Group>
                  <Button onClick={openArchiveModal} variant="default">
                    {t("components.fileManager.createStandaloneArchive")}
                  </Button>
                  <Button
                    onClick={() => {
                      hideOverlay()
                      reset()
                    }}
                    variant="default"
                  >
                    {t("common.cancel")}
                  </Button>
                </Button.Group>
                <Space h="xl" />
                <Group align="center" justify="center">
                  <Popover
                    onChange={closePopover}
                    opened={popoverOpened}
                    width={"440px"}
                    withArrow
                  >
                    <Popover.Target>
                      <Button
                        color="dark"
                        disabled={selectedFiles.length === 0}
                        onClick={togglePopover}
                        size="xs"
                        variant="filled"
                      >
                        {t("components.fileManager.showFiles", {
                          count: selectedFiles.length,
                        })}{" "}
                        ({selectedFiles.length})
                      </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <ScrollArea.Autosize
                        mah={150}
                        scrollHideDelay={0}
                        type="scroll"
                      >
                        <FileList
                          files={selectedFiles}
                          onRemoveFile={(file) => {
                            removeFile(file)
                          }}
                        />
                      </ScrollArea.Autosize>
                    </Popover.Dropdown>
                  </Popover>
                </Group>
                <ActionBadge>
                  {t("components.fileManager.dragAndDropFiles")}
                </ActionBadge>
              </Box>
            </Center>
            <CreateStandaloneArchiveModal
              error={archiveError}
              isLoading={isCreatingArchive}
              opened={archiveModalOpened}
              onClose={closeArchiveModal}
              onReset={() => setArchiveError(null)}
              onSubmit={async (values) => {
                setArchiveError(null)
                try {
                  const result = await createArchive(
                    values.filename,
                    values.passphrase
                  )
                  if (result?.success) {
                    notifications.show({
                      message: t(
                        "components.fileManager.standaloneArchiveCreated"
                      ),
                    })
                    closeArchiveModal()
                    hideOverlay()
                    reset()
                  }
                } catch (onSubmitError) {
                  if (onSubmitError instanceof FileManagerError) {
                    setArchiveError(onSubmitError.message)
                  } else {
                    setArchiveError(
                      "components.fileManager.couldNotCreateStandaloneArchive"
                    )
                  }
                }
              }}
            />
            <RestoreStandaloneArchiveModal
              opened={passphraseModalOpened}
              onAddToArchive={() => {
                closePassphraseModal()
              }}
              onClose={() => {
                closePassphraseModal()
                hideOverlay()
                reset()
              }}
              onReset={() => setRestoreError(null)}
              onSubmit={async (passphrase) => {
                setRestoreError(null)
                try {
                  setIsRestoringArchive(true)
                  const result = await restoreArchive(passphrase)
                  if (result?.success) {
                    notifications.show({
                      message: t(
                        "components.fileManager.standaloneArchiveRestored"
                      ),
                    })
                    closePassphraseModal()
                    hideOverlay()
                    reset()
                  }
                } catch (onSubmitError) {
                  if (onSubmitError instanceof FileManagerError) {
                    setRestoreError(onSubmitError.message)
                  } else {
                    setRestoreError(
                      "components.fileManager.couldNotRestoreStandaloneArchive"
                    )
                  }
                } finally {
                  setIsRestoringArchive(false)
                }
              }}
              isUnlocking={isRestoringArchive}
              error={restoreError}
            />
          </Fragment>
        ) : null}
        <ErrorModal error={error} onClose={() => setError(null)} />
      </Fragment>
    )
  }
)

FileManager.displayName = "FileManager"

export default FileManager
