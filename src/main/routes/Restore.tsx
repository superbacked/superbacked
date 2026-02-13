import styled from "@emotion/styled"
import {
  Button,
  Mark,
  Popover,
  PopoverProps,
  RingProgress,
  Space,
  Text,
  rgba,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core"
import { FileWithPath } from "@mantine/dropzone"
import { useDisclosure } from "@mantine/hooks"
import { notifications } from "@mantine/notifications"
import {
  Fragment,
  FunctionComponent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Payload } from "@/src/handlers/create"
import ActionBadge from "@/src/main/components/ActionBadge"
import Dropzone from "@/src/main/components/Dropzone"
import ErrorModal, { ErrorState } from "@/src/main/components/ErrorModal"
import Loading from "@/src/main/components/Loading"
import PassphraseModal from "@/src/main/components/PassphraseModal"
import Scanner, { ScannerRef } from "@/src/main/components/Scanner"
import { showNotificationWithButton } from "@/src/main/utilities/notificationWithButton"
import {
  Bip39MnemonicResult,
  TotpUriResult,
  extract,
} from "@/src/main/utilities/regexp"
import { TranslationKey } from "@/src/shared/types/i18n"

const Container = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  width: 100vw;
  min-height: 100vh;
  padding: 40px;
  user-select: text;
  z-index: 0;
`

interface SmartPopoverProps {
  dropdown: ReactNode
  target: ReactNode
  width: PopoverProps["width"]
}

const SmartPopover: FunctionComponent<SmartPopoverProps> = (props) => {
  const theme = useMantineTheme()
  const { colorScheme } = useMantineColorScheme()
  const [opened, { close, open }] = useDisclosure(false)
  return (
    <Popover opened={opened} position="bottom" width={props.width} withArrow>
      <Popover.Target>
        <Mark
          onMouseEnter={open}
          onMouseLeave={close}
          sx={{
            backgroundColor: rgba(theme.colors.pink[8], 0.35),
            color: colorScheme === "dark" ? theme.colors.dark[0] : "#000",
            cursor: "default",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
            transition: "background-color 0.15s",
            "&:hover": {
              backgroundColor: rgba(theme.colors.pink[8], 0.7),
            },
          }}
        >
          {props.target}
        </Mark>
      </Popover.Target>
      <Popover.Dropdown sx={{ pointerEvents: "none" }}>
        <Text size="sm" span ta="center">
          {props.dropdown}
        </Text>
      </Popover.Dropdown>
    </Popover>
  )
}

interface Bip39MnemonicAppletProps {
  words: Bip39MnemonicResult["properties"]["words"]
}

const Bip39MnemonicApplet: FunctionComponent<Bip39MnemonicAppletProps> = (
  props
) => {
  const nodes: ReactNode[] = []
  for (const [index, word] of props.words.entries()) {
    nodes.push(
      <Fragment key={`dropdown-node-${nodes.length}`}>
        <Text sx={{ display: "inline-block" }}>
          <Text c="dimmed" span>
            {index + 1}.{" "}
          </Text>
          {word}
        </Text>{" "}
      </Fragment>
    )
  }
  return nodes
}

interface TotpAppletProps {
  secret: TotpUriResult["properties"]["secret"]
}

const TotpApplet: FunctionComponent<TotpAppletProps> = (props) => {
  const getTimeRemaining = () => {
    const now = new Date()
    const seconds = now.getSeconds()
    const milliseconds = now.getMilliseconds()
    return (((seconds + milliseconds / 1000) % 30) / 30) * 100
  }
  const [token, setToken] = useState<string>(
    window.api.invokeSync.generateToken(props.secret)
  )
  const [timeRemaining, setTimeRemaining] = useState<number>(getTimeRemaining())
  useEffect(() => {
    let previousTimeRemaining: null | number = null
    const timer = setInterval(() => {
      const nextTimeRemaining = getTimeRemaining()
      if (previousTimeRemaining && previousTimeRemaining > nextTimeRemaining) {
        setToken(window.api.invokeSync.generateToken(props.secret))
      }
      setTimeRemaining(nextTimeRemaining)
      previousTimeRemaining = nextTimeRemaining
    }, 100)
    return () => {
      clearInterval(timer)
    }
  }, [props.secret])
  return (
    <Fragment>
      {token}{" "}
      <RingProgress
        sections={[
          { value: timeRemaining, color: "dimmed" },
          { value: 100 - timeRemaining, color: "pink" },
        ]}
        size={18}
        thickness={2}
        roundCaps
        sx={{
          display: "inline-block",
          verticalAlign: "text-top",
        }}
      />
    </Fragment>
  )
}

export type HandlePayload = (payload: Payload) => Promise<boolean>

interface RestoreProps {
  exportMode?: boolean
  handlePayload?: HandlePayload
}

const Restore: FunctionComponent<RestoreProps> = (props) => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const scannerRef = useRef<ScannerRef>(null)
  const passphraseRef = useRef<string>("")
  const codeRef = useRef<string>(null)
  const scannedCodesRef = useRef<Set<string>>(new Set())
  const [showPassphraseModal, setShowPassphraseModal] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [passphraseError, setPassphraseError] = useState<null | TranslationKey>(
    null
  )
  const [showScanNextBlockBadge, setShowScanNextBlockBadge] = useState(false)
  const [secret, setSecret] = useState<null | string>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [detachedArchiveEncryptionKey, setDetachedArchiveEncryptionKey] =
    useState<null | string>(null)
  const [detachedArchiveHmacKey, setDetachedArchiveHmacKey] = useState<
    null | string
  >(null)
  const [detachedArchiveFilename, setDetachedArchiveFilename] = useState<
    null | string
  >(null)
  const [detachedArchiveBlockContent, setDetachedArchiveBlockContent] =
    useState<null | string>(null)
  const [isRestoringDetachedArchive, setIsRestoringDetachedArchive] =
    useState(false)
  const [error, setError] =
    useState<null | ErrorState<"routes.restore.couldNotRestoreDetachedArchive">>(
      null
    )
  useEffect(() => {
    return () => {
      window.api.invoke.restoreReset()
    }
  }, [])
  const compute = async () => {
    const code = codeRef.current
    if (!code) {
      return
    } else if (scannedCodesRef.current.has(code) === true) {
      // Code already computed
      notifications.show({
        id: "scanOrDragAndDropNextBlock",
        message: t("routes.restore.scanOrDragAndDropNextBlock"),
      })
      scannerRef.current?.clear()
      return
    }
    let payload: Payload
    try {
      payload = JSON.parse(code)
      if (!payload.salt || !payload.iv || !payload.headers || !payload.data) {
        // Payload not Superbacked-compatible
        return
      }
    } catch {
      // Payload not valid JSON
      return
    }
    if (props.exportMode === true && props.handlePayload) {
      scannerRef.current?.stop()
      await props.handlePayload(payload)
      return
    }
    const result = await window.api.invoke.restore(
      passphraseRef.current,
      payload
    )
    setIsUnlocking(false)
    if (result.success === false) {
      if (result.error.match(/shares did not combine to a valid secret/i)) {
        notifications.show({
          id: "scanOrDragAndDropNextBlock",
          message: t("routes.restore.scanOrDragAndDropNextBlock"),
        })
        scannerRef.current?.clear()
        if (scannerRef.current?.isUsingCamera()) {
          scannerRef.current?.start()
        }
        scannedCodesRef.current.add(code)
        setShowScanNextBlockBadge(true)
        setShowPassphraseModal(false)
        setPassphraseError(null)
      } else {
        scannerRef.current?.stop()
        setShowScanNextBlockBadge(false)
        setPassphraseError("routes.restore.couldNotUnlockBlock")
        setShowPassphraseModal(true)
      }
    } else if (result.success === true) {
      notifications.hide("scanOrDragAndDropNextBlock")

      scannerRef.current?.stop()
      scannedCodesRef.current.clear()

      // Parse secret
      const message = result.message
      let extractedSecret = message
      let extractedMasterKey: null | string = null
      try {
        const parsed = JSON.parse(extractedSecret)
        if (parsed && typeof parsed.secret === "string") {
          extractedSecret = parsed.secret
          if (typeof parsed.masterKey === "string") {
            extractedMasterKey = parsed.masterKey
          }
        }
      } catch {
        // Not JSON, use as-is
      }

      setSecret(extractedSecret)

      // If masterKey exists, derive archive encryption key, HMAC key and filename
      if (extractedMasterKey) {
        const encryptionKey = window.api.invokeSync.deriveKey(
          extractedMasterKey,
          "encryption-key-v1"
        )
        setDetachedArchiveEncryptionKey(encryptionKey)
        const derivedHmacKey = window.api.invokeSync.deriveKey(
          extractedMasterKey,
          "hmac-v1"
        )
        setDetachedArchiveHmacKey(derivedHmacKey)
        const derivedFilename = window.api.invokeSync.deriveKey(
          extractedMasterKey,
          "filename-v1",
          16,
          "hex"
        )
        setDetachedArchiveFilename(derivedFilename)
        setDetachedArchiveBlockContent(message)
      }
    }
  }
  if (secret) {
    if (showSecret === true) {
      const nodes: ReactNode[] = []
      const lines = secret.split(/\n/)
      for (const line of lines) {
        if (line === "") {
          nodes.push(<Space key={`node-${nodes.length}`} h="lg" />)
        } else {
          const lineNodes: ReactNode[] = []
          const results = extract(line)
          let startIndex = 0
          if (results.length === 0) {
            lineNodes.push(line)
          } else {
            for (const result of results) {
              lineNodes.push(line.substring(startIndex, result.start))
              if (result.type === "validBip39Mnemonic") {
                lineNodes.push(
                  <SmartPopover
                    key={`line-node-${lineNodes.length}`}
                    dropdown={
                      <Bip39MnemonicApplet words={result.properties.words} />
                    }
                    target={line.substring(result.start, result.end)}
                    width="440px"
                  />
                )
              } else if (result.type === "totpUri") {
                lineNodes.push(
                  <SmartPopover
                    key={`line-node-${lineNodes.length}`}
                    dropdown={<TotpApplet secret={result.properties.secret} />}
                    target={line.substring(result.start, result.end)}
                    width="120px"
                  />
                )
              }
              startIndex = result.end
            }
            lineNodes.push(line.substring(startIndex))
          }
          nodes.push(<Text key={`node-${nodes.length}`}>{lineNodes}</Text>)
        }
      }
      return (
        <Fragment>
          <Container>
            <Text
              size="sm"
              sx={{
                overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
              }}
              ta="left"
            >
              {nodes}
            </Text>
            <Space h="lg" />
            <Button.Group sx={{ display: "inline-block" }}>
              <Button
                variant="default"
                onClick={async () => {
                  await navigator.clipboard.writeText(secret)
                  notifications.show({
                    id: "copy",
                    message: t("common.copied"),
                  })
                }}
              >
                {t("common.copy")}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  void navigate("/")
                }}
              >
                {t("common.done")}
              </Button>
            </Button.Group>
          </Container>
        </Fragment>
      )
    } else {
      return (
        <Fragment>
          {detachedArchiveFilename ? (
            <Fragment>
              <Dropzone
                onDrop={async (files: FileWithPath[]) => {
                  const file = files[0]
                  if (
                    file &&
                    detachedArchiveEncryptionKey &&
                    detachedArchiveHmacKey &&
                    detachedArchiveBlockContent
                  ) {
                    const filename = file.name.replace(/\.superbacked$/, "")
                    if (filename === detachedArchiveFilename) {
                      const filePath = window.api.getPathForFile(file)
                      const saveDialogReturnValue =
                        await window.api.invoke.chooseDirectory(
                          t(
                            "handlers.restoreDetachedArchive.chooseWhereToRestoreDetachedArchive"
                          )
                        )
                      if (saveDialogReturnValue.canceled) {
                        return
                      }
                      const outputDir = saveDialogReturnValue.filePath
                      if (!outputDir) {
                        return
                      }
                      setIsRestoringDetachedArchive(true)
                      try {
                        const result =
                          await window.api.invoke.restoreDetachedArchive(
                            filePath,
                            outputDir,
                            detachedArchiveEncryptionKey,
                            detachedArchiveHmacKey,
                            detachedArchiveBlockContent
                          )
                        if (result.success === false && result.error) {
                          setError({
                            message:
                              "routes.restore.couldNotRestoreDetachedArchive",
                          })
                        } else if (result.success) {
                          showNotificationWithButton({
                            message: t(
                              "routes.restore.detachedArchiveRestored"
                            ),
                            buttonLabel: t("common.show"),
                            buttonOnClick: () => {
                              void window.api.invoke.openPath(outputDir)
                            },
                          })
                        }
                      } catch {
                        setError({
                          message:
                            "routes.restore.couldNotRestoreDetachedArchive",
                        })
                      } finally {
                        setIsRestoringDetachedArchive(false)
                      }
                    }
                  }
                }}
              />
              <ActionBadge color="dark">
                {t("routes.restore.dragAndDropArchiveToRestore", {
                  filename: `${detachedArchiveFilename}.superbacked`,
                })}
              </ActionBadge>
            </Fragment>
          ) : null}
          <Container>
            <Button.Group sx={{ display: "inline-block" }}>
              <Button
                variant="default"
                onClick={async () => {
                  await navigator.clipboard.writeText(secret)
                  notifications.show({
                    id: "copy",
                    message: t("common.copied"),
                  })
                }}
              >
                {t("common.copy")}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  setShowSecret(true)
                }}
              >
                {t("routes.restore.showSecret")}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  void navigate("/")
                }}
              >
                {t("common.done")}
              </Button>
            </Button.Group>
          </Container>
          <ErrorModal error={error} onClose={() => setError(null)} />
          <Loading
            visible={isRestoringDetachedArchive}
            dialog="routes.restore.restoringDetachedArchive"
            count={1}
          />
        </Fragment>
      )
    }
  } else {
    return (
      <Container>
        <Scanner
          ref={scannerRef}
          handleCode={(code) => {
            codeRef.current = code
            scannerRef.current?.beep()
            scannerRef.current?.stop()
            if (props.exportMode === true || passphraseRef.current) {
              setPassphraseError(null)
              void compute()
            } else {
              setShowPassphraseModal(true)
            }
          }}
          autoBeep={false}
          autoStop={false}
          dropzone={true}
          badge={
            showScanNextBlockBadge === true
              ? t("routes.restore.scanOrDragAndDropNextBlock")
              : t("routes.restore.scanOrDragAndDropBlock")
          }
        />
        <PassphraseModal
          error={passphraseError}
          opened={showPassphraseModal}
          onClose={() => {
            passphraseRef.current = ""
            scannerRef.current?.clear()
            if (scannerRef.current?.isUsingCamera()) {
              scannerRef.current?.start()
            }
            setShowPassphraseModal(false)
            setPassphraseError(null)
          }}
          onReset={() => {
            setPassphraseError(null)
          }}
          onSubmit={async (passphrase) => {
            passphraseRef.current = passphrase
            setPassphraseError(null)
            setIsUnlocking(true)
            await compute()
          }}
          isUnlocking={isUnlocking}
        />
      </Container>
    )
  }
}

export default Restore
