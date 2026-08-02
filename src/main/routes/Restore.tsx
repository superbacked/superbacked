import styled from "@emotion/styled"
import {
  Box,
  Button,
  Group,
  Mark,
  Popover,
  RingProgress,
  Space,
  Text,
  rgba,
  useMantineTheme,
} from "@mantine/core"
import { FileWithPath } from "@mantine/dropzone"
import { useDisclosure, useTimeout } from "@mantine/hooks"
import { notifications } from "@mantine/notifications"
import { IconQrcode } from "@tabler/icons-react"
import {
  Fragment,
  FunctionComponent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"

import { LegacyPayload, Payload } from "@/src/handlers/create"
import { DetachedArchive } from "@/src/handlers/detachedArchive"
import ActionBadge from "@/src/main/components/ActionBadge"
import Dropzone from "@/src/main/components/Dropzone"
import ErrorModal, { ErrorState } from "@/src/main/components/ErrorModal"
import Loading from "@/src/main/components/Loading"
import PassphraseModal from "@/src/main/components/PassphraseModal"
import QrCodeModal from "@/src/main/components/QrCodeModal"
import Scanner, { ScannerRef } from "@/src/main/components/Scanner"
import { showNotificationWithButton } from "@/src/main/utilities/notificationWithButton"
import {
  Bip39MnemonicResult,
  Bip39PassphraseResult,
  TotpUriResult,
  extract,
} from "@/src/main/utilities/regexp"
import { TranslationKey } from "@/src/shared/types/i18n"
import { yubikeyErrorMessage } from "@/src/shared/utilities/yubikeyErrorMessage"
import type { Slot } from "@/src/utilities/yubikey/otp"

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
  // A function receives close, letting dropdown buttons dismiss the
  // popover before acting (for example before opening a modal)
  dropdown: ReactNode | ((controls: { close: () => void }) => ReactNode)
  // Interactive dropdowns accept the pointer and stay open while
  // hovered, so buttons inside are clickable — closing is delayed just
  // long enough to cross the gap between target and dropdown
  interactive?: boolean
  target: ReactNode
}

const SmartPopover: FunctionComponent<SmartPopoverProps> = (props) => {
  const theme = useMantineTheme()
  const [opened, { close, open }] = useDisclosure(false)
  const { clear: cancelClose, start: scheduleClose } = useTimeout(close, 120)
  const openAndStay = () => {
    cancelClose()
    open()
  }
  const closeNow = () => {
    cancelClose()
    close()
  }
  const leave = () => {
    if (props.interactive === true) {
      scheduleClose()
    } else {
      close()
    }
  }
  return (
    // No width — the dropdown fits its content; every applet bounds its
    // own width (the word grid wraps into fixed columns, fingerprint and
    // token lines are short)
    <Popover opened={opened} position="bottom" withArrow>
      <Popover.Target>
        <Mark
          onMouseEnter={openAndStay}
          onMouseLeave={leave}
          sx={{
            backgroundColor: rgba(theme.colors.pink[8], 0.35),
            color: "var(--mantine-color-gradient-0)",
            cursor: "default",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
            transition: "background-color 100ms ease",
            "&:hover": {
              backgroundColor: rgba(theme.colors.pink[8], 0.7),
            },
          }}
        >
          {props.target}
        </Mark>
      </Popover.Target>
      <Popover.Dropdown
        onMouseEnter={props.interactive === true ? openAndStay : undefined}
        onMouseLeave={props.interactive === true ? leave : undefined}
        sx={{
          pointerEvents: props.interactive === true ? "auto" : "none",
        }}
      >
        <Text size="sm" span ta="center">
          {typeof props.dropdown === "function"
            ? props.dropdown({ close: closeNow })
            : props.dropdown}
        </Text>
      </Popover.Dropdown>
    </Popover>
  )
}

// Both applet grids share the same rhythm — xs between columns, tight
// rows — so the popovers read as one family
const appletGridGap = {
  columnGap: "var(--mantine-spacing-xs)",
  rowGap: "2px",
}

interface Bip39MnemonicAppletProps {
  onCopy: () => void
  onShowAsQrCode: () => void
  words: Bip39MnemonicResult["properties"]["words"]
}

const Bip39MnemonicApplet: FunctionComponent<Bip39MnemonicAppletProps> = (
  props
) => {
  const { t } = useTranslation()
  const nodes: ReactNode[] = []
  for (const [index, word] of props.words.entries()) {
    nodes.push(
      <Text
        key={`dropdown-node-${nodes.length}`}
        sx={{ whiteSpace: "nowrap" }}
        ta="left"
      >
        {/* Numbers right-align on a fixed width (accounting style), so
            single and double digits line up down each column */}
        <Text
          c="dark.4"
          span
          sx={{
            display: "inline-block",
            minWidth: "3ch",
            textAlign: "right",
          }}
        >
          {index + 1}.
        </Text>{" "}
        {word}
      </Text>
    )
  }
  return (
    <Fragment>
      {/* Same title treatment and lg gap as the passphrase-strength and
          block-capacity popovers, so popovers read as one family */}
      <Text fw="bold" ta="center" variant="signatureGradient">
        {t("routes.restore.bip39Mnemonic")}
      </Text>
      <Space h="lg" />
      {/* Six columns per row, so 12- and 24-word mnemonics form clean 2-
          and 4-row grids. Numbers align down each column, and max-content
          columns hug their own widest cell — equal-width columns would
          pad every column to the grid-wide widest word */}
      <Box
        sx={{
          ...appletGridGap,
          display: "grid",
          gridTemplateColumns: "repeat(6, max-content)",
        }}
      >
        {nodes}
      </Box>
      <Space h="xl" />
      <Group justify="center">
        <Button.Group>
          <Button onClick={props.onCopy} size="xs" variant="default">
            {t("common.copy")}
          </Button>
          <Button
            onClick={props.onShowAsQrCode}
            rightSection={<IconQrcode size={14} />}
            size="xs"
            variant="default"
          >
            {t("routes.restore.showAsQrCode")}
          </Button>
        </Button.Group>
      </Group>
    </Fragment>
  )
}

interface Bip39PassphraseAppletProps {
  mnemonics: string[]
  onCopy: () => void
  onShowAsQrCode: () => void
  passphrase: Bip39PassphraseResult["properties"]["passphrase"]
}

// The fingerprint a signing device and wallet (for example Trezor
// connected to Electrum) display for the wallet this mnemonic and
// passphrase unlock — the master node’s identity, so no derivation path
// enters or is shown (see src/utilities/crypto/bip32.ts). One section
// per mnemonic in the secret, each identified by its abbreviated words,
// so multiple mnemonics stay unambiguous
const Bip39PassphraseApplet: FunctionComponent<Bip39PassphraseAppletProps> = (
  props
) => {
  const { t } = useTranslation()
  const [fingerprints, setFingerprints] = useState<null | string[]>(null)
  useEffect(() => {
    let cancelled = false
    const compute = async () => {
      const computed: string[] = []
      for (const mnemonic of props.mnemonics) {
        computed.push(
          await window.api.invoke.computeBip32RootFingerprint(
            mnemonic,
            props.passphrase
          )
        )
      }
      if (cancelled === false) {
        setFingerprints(computed)
      }
    }
    void compute()
    return () => {
      cancelled = true
    }
  }, [props.mnemonics, props.passphrase])
  const abbreviate = (mnemonic: string) => {
    const words = mnemonic.split(" ")
    return `${words[0]}…${words[words.length - 1]}`
  }
  return (
    <Fragment>
      {/* Same title treatment and lg gap as the passphrase-strength and
          block-capacity popovers, so popovers read as one family */}
      <Text fw="bold" ta="center" variant="signatureGradient">
        {t("routes.restore.bip39Passphrase")}
      </Text>
      <Space h="lg" />
      {props.mnemonics.map((mnemonic, index) => (
        <Fragment key={mnemonic}>
          {index > 0 ? <Space h="xs" /> : null}
          {/* Text labels align left (numbers align right, text does
              not); the grid column gives values a shared left edge —
              same max-content column treatment as the word grid */}
          <Box
            sx={{
              ...appletGridGap,
              display: "grid",
              gridTemplateColumns: "repeat(2, max-content)",
            }}
          >
            <Text c="dark.4" ta="left">
              {t("routes.restore.bip39Mnemonic")}:
            </Text>
            <Text ta="left">{abbreviate(mnemonic)}</Text>
            <Text c="dark.4" ta="left">
              {t("routes.restore.bip32RootFingerprint")}:
            </Text>
            <Text ta="left">
              {fingerprints === null ? "…" : fingerprints[index]}
            </Text>
          </Box>
        </Fragment>
      ))}
      <Space h="xl" />
      <Group justify="center">
        <Button.Group>
          <Button onClick={props.onCopy} size="xs" variant="default">
            {t("common.copy")}
          </Button>
          <Button
            onClick={props.onShowAsQrCode}
            rightSection={<IconQrcode size={14} />}
            size="xs"
            variant="default"
          >
            {t("routes.restore.showAsQrCode")}
          </Button>
        </Button.Group>
      </Group>
    </Fragment>
  )
}

interface TotpAppletProps {
  secret: TotpUriResult["properties"]["secret"]
}

const TotpApplet: FunctionComponent<TotpAppletProps> = (props) => {
  const { t } = useTranslation()
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
      {/* Same title treatment and lg gap as the passphrase-strength and
          block-capacity popovers, so popovers read as one family */}
      <Text fw="bold" ta="center" variant="signatureGradient">
        {t("routes.restore.totp")}
      </Text>
      <Space h="lg" />
      <Box
        sx={{
          ...appletGridGap,
          display: "grid",
          gridTemplateColumns: "repeat(2, max-content)",
        }}
      >
        <Text c="dark.4" ta="left">
          {t("routes.restore.token")}:
        </Text>
        <Text ta="left">
          {token}{" "}
          <RingProgress
            sections={[
              { value: timeRemaining, color: "dark.4" },
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
        </Text>
      </Box>
      <Space h="xl" />
      <Group justify="center">
        {/* Copies the current token (the value pasted into a login) —
            the handler lives here, next to the token state, rather than
            at the call site like the other applets. No QR counterpart:
            tokens are short-lived and typed, and re-enrollment stays
            reachable through the full secret’s otpauth URI */}
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(token)
            notifications.show({
              id: "copy",
              message: t("common.copied"),
            })
          }}
          size="xs"
          variant="default"
        >
          {t("common.copy")}
        </Button>
      </Group>
    </Fragment>
  )
}

export type HandlePayload = (
  payload: Payload | LegacyPayload
) => Promise<boolean>

interface RestoreProps {
  exportMode?: boolean
  handlePayload?: HandlePayload
}

const Restore: FunctionComponent<RestoreProps> = (props) => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const scannerRef = useRef<ScannerRef>(null)
  const passphraseRef = useRef<string>("")
  // Slot for YubiKey-protected blocks — persists alongside the passphrase
  // so scanning further blocks reuses it without re-prompting
  const yubikeySlotRef = useRef<Slot | undefined>(undefined)
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
  // Closing only flips showQrCodeModal — the value survives so the QR
  // stays stable while the modal fades out (same pattern as
  // SelectionAsQrCode)
  const [qrCodeValue, setQrCodeValue] = useState<null | string>(null)
  const [showQrCodeModal, setShowQrCodeModal] = useState(false)
  // Present when the restored block pairs with a detached archive — held
  // opaquely and handed back verbatim (see src/handlers/detachedArchive.ts)
  const [detachedArchive, setDetachedArchive] =
    useState<null | DetachedArchive>(null)
  const [isRestoringDetachedArchive, setIsRestoringDetachedArchive] =
    useState(false)
  const [error, setError] = useState<null | ErrorState<
    | "routes.restore.couldNotRestoreDetachedArchive"
    | "routes.restore.detachedArchiveRequiresNewerVersion"
  >>(null)
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
      if (scannerRef.current?.isUsingCamera()) {
        scannerRef.current?.start()
      }
      return
    }
    let payload: Payload | LegacyPayload
    try {
      payload = JSON.parse(code)
      // Legacy payloads carry iv and headers as well — salt and data are
      // what every payload shares
      if (!payload.salt || !payload.data) {
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
      payload,
      yubikeySlotRef.current
    )
    setIsUnlocking(false)
    if (result.success === false) {
      if (result.yubikeyErrorCode !== undefined) {
        scannerRef.current?.stop()
        setShowScanNextBlockBadge(false)
        setPassphraseError(yubikeyErrorMessage(result.yubikeyErrorCode))
        setShowPassphraseModal(true)
      } else if (
        result.error.match(/shares did not combine to a valid secret/i)
      ) {
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
        setPassphraseError(
          result.unsupportedVersion === true
            ? "routes.restore.blockRequiresNewerVersion"
            : yubikeySlotRef.current === undefined
              ? "routes.restore.couldNotUnlockBlock"
              : "routes.restore.couldNotUnlockBlockYubiKey"
        )
        setShowPassphraseModal(true)
      }
    } else if (result.success === true) {
      notifications.hide("scanOrDragAndDropNextBlock")

      scannerRef.current?.stop()
      scannedCodesRef.current.clear()

      setSecret(result.message)

      if (result.detachedArchive) {
        setDetachedArchive(result.detachedArchive)
      }
    }
  }
  if (secret) {
    if (showSecret === true) {
      const nodes: ReactNode[] = []
      // Mnemonics gate passphrase extraction and feed the fingerprint
      // applet — collected over the whole secret, as the mnemonic
      // usually sits on another line than the passphrase, and deduped so
      // a repeated mnemonic yields one fingerprint section (which also
      // makes the mnemonic a safe React key)
      const bip39Mnemonics = Array.from(
        new Set(
          extract(secret)
            .filter((result) => result.type === "bip39Mnemonic")
            .map((result) => result.string)
        )
      )
      const lines = secret.split(/\n/)
      for (const line of lines) {
        if (line === "") {
          nodes.push(<Space key={`node-${nodes.length}`} h="lg" />)
        } else {
          const lineNodes: ReactNode[] = []
          const results = extract(line, bip39Mnemonics.length > 0)
          let startIndex = 0
          if (results.length === 0) {
            lineNodes.push(line)
          } else {
            for (const result of results) {
              lineNodes.push(line.substring(startIndex, result.start))
              if (result.type === "bip39Mnemonic") {
                lineNodes.push(
                  <SmartPopover
                    key={`line-node-${lineNodes.length}`}
                    dropdown={(controls) => (
                      <Bip39MnemonicApplet
                        onCopy={async () => {
                          await navigator.clipboard.writeText(result.string)
                          notifications.show({
                            id: "copy",
                            message: t("common.copied"),
                          })
                        }}
                        onShowAsQrCode={() => {
                          controls.close()
                          setQrCodeValue(result.string)
                          setShowQrCodeModal(true)
                        }}
                        words={result.properties.words}
                      />
                    )}
                    interactive
                    target={line.substring(result.start, result.end)}
                  />
                )
              } else if (result.type === "bip39Passphrase") {
                lineNodes.push(
                  <SmartPopover
                    key={`line-node-${lineNodes.length}`}
                    dropdown={(controls) => (
                      <Bip39PassphraseApplet
                        mnemonics={bip39Mnemonics}
                        onCopy={async () => {
                          await navigator.clipboard.writeText(
                            result.properties.passphrase
                          )
                          notifications.show({
                            id: "copy",
                            message: t("common.copied"),
                          })
                        }}
                        onShowAsQrCode={() => {
                          controls.close()
                          setQrCodeValue(result.properties.passphrase)
                          setShowQrCodeModal(true)
                        }}
                        passphrase={result.properties.passphrase}
                      />
                    )}
                    interactive
                    target={line.substring(result.start, result.end)}
                  />
                )
              } else if (result.type === "totpUri") {
                lineNodes.push(
                  <SmartPopover
                    key={`line-node-${lineNodes.length}`}
                    dropdown={<TotpApplet secret={result.properties.secret} />}
                    interactive
                    target={line.substring(result.start, result.end)}
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
          <QrCodeModal
            onClose={() => setShowQrCodeModal(false)}
            opened={showQrCodeModal === true && qrCodeValue !== null}
            value={qrCodeValue ?? ""}
          />
        </Fragment>
      )
    } else {
      return (
        <Fragment>
          {detachedArchive ? (
            <Fragment>
              <Dropzone
                onDrop={async (files: FileWithPath[]) => {
                  const file = files[0]
                  if (file) {
                    const filename = file.name.replace(/\.superbacked$/, "")
                    if (filename === detachedArchive.filename) {
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
                            detachedArchive.blockContent
                          )
                        if (result.success === false && result.error) {
                          setError({
                            message:
                              result.unsupportedVersion === true
                                ? "routes.restore.detachedArchiveRequiresNewerVersion"
                                : "routes.restore.couldNotRestoreDetachedArchive",
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
                  filename: `${detachedArchive.filename}.superbacked`,
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
            yubikeySlotRef.current = undefined
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
          onSubmit={async (passphrase, options) => {
            passphraseRef.current = passphrase
            yubikeySlotRef.current =
              options.yubikey === true
                ? options.slot === "1"
                  ? 1
                  : 2
                : undefined
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
