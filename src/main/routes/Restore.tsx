import styled from "@emotion/styled"
import {
  Button,
  darken,
  Dialog,
  Mark,
  Modal,
  PasswordInput,
  Popover,
  PopoverProps,
  rgba,
  RingProgress,
  Space,
  Text,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import {
  Fragment,
  FunctionComponent,
  ReactNode,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from "tabler-icons-react"

import { Payload } from "@/src/create"
import Scanner, { ScannerRef } from "@/src/main/components/Scanner"
import {
  extract,
  Bip39MnemonicResult,
  TotpUriResult,
} from "@/src/main/utilities/regexp"

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

interface PasswordModalProps {
  onClose: () => void
  onSubmit: (passphrases: string[]) => void
  unlocking: boolean
}

const PasswordModal: FunctionComponent<PasswordModalProps> = (props) => {
  const { i18n, t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.focus()
    }
  }, [props.unlocking])
  const form = useForm({
    initialValues: {
      passphrase: "",
      dualPassphrase: false,
    },
    validate: {
      passphrase: (value) => {
        if (value === "") {
          return t("common.passphraseRequired")
        }
        return null
      },
    },
  })
  const handleUnlock = useCallback(() => {
    const validation = form.validate()
    if (validation.hasErrors === false) {
      const passphrases = [form.values.passphrase]
      props.onSubmit(passphrases)
      form.reset()
    }
  }, [form, props])
  useEffect(() => {
    if (Object.keys(form.errors).length > 0) {
      form.validate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language])
  return (
    <Modal
      centered
      onClose={() => props.onClose()}
      opened={true}
      title={`${t("routes.restore.enterPassphrase")}${
        form.values.dualPassphrase === true ? "s" : ""
      }`}
      styles={{
        title: {
          fontWeight: "bold",
        },
      }}
    >
      <form onSubmit={form.onSubmit(handleUnlock)}>
        <PasswordInput
          ref={ref}
          autoFocus
          data-autofocus
          disabled={props.unlocking}
          label={t("common.passphrase")}
          placeholder={t("common.typePassphrase")}
          required
          spellCheck={false}
          visibilityToggleIcon={({ reveal }) =>
            reveal === true ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />
          }
          {...form.getInputProps("passphrase", { withFocus: false })}
        />
        <Space h="lg" />
        <Button
          disabled={props.unlocking}
          gradient={{ from: "#fdc0ee", to: "#fbd6cd", deg: 45 }}
          loading={props.unlocking}
          onClick={handleUnlock}
          variant="gradient"
          sx={{
            "&:disabled": {
              color: darken("#fff", 0.25),
              backgroundImage: `linear-gradient(45deg, ${darken(
                "#fdc0ee",
                0.25
              )} 0%, ${darken("#fbd6cd", 0.25)} 100%)`,
            },
          }}
        >
          {props.unlocking === true
            ? t("routes.restore.unlocking")
            : t("routes.restore.unlock")}
        </Button>
      </form>
    </Modal>
  )
}

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
    window.api.generateToken(props.secret)
  )
  const [timeRemaining, setTimeRemaining] = useState<number>(getTimeRemaining())
  useEffect(() => {
    let previousTimeRemaining: null | number = null
    const timer = setInterval(() => {
      const nextTimeRemaining = getTimeRemaining()
      if (previousTimeRemaining && previousTimeRemaining > nextTimeRemaining) {
        setToken(window.api.generateToken(props.secret))
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
  importMode?: boolean
  exportMode?: boolean
  handlePayload?: HandlePayload
}

const Restore: FunctionComponent<RestoreProps> = (props) => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const scannerRef = useRef<ScannerRef>(null)
  const passphrasesRef = useRef<string[]>([])
  const codeRef = useRef<string>(null)
  const scannedCodesRef = useRef<Set<string>>(new Set())
  const [showPassphraseModal, setShowPassphraseModal] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [showScanNextBlockDialog, setShowScanNextBlockDialog] = useState(false)
  const [secret, setSecret] = useState<null | string>(null)
  const [showCopied, setShowCopied] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  useEffect(() => {
    return () => {
      window.api.restoreReset()
    }
  }, [])
  const compute = async (beep: boolean) => {
    const code = codeRef.current
    if (!code) {
      return
    } else if (scannedCodesRef.current.has(code) === true) {
      // Code already computed
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
    if (
      (props.importMode === true || props.exportMode === true) &&
      props.handlePayload
    ) {
      scannerRef.current?.stop()
      await props.handlePayload(payload)
      if (beep === true) {
        scannerRef.current?.beep()
      }
      return
    }
    const result = await window.api.restore(passphrasesRef.current, payload)
    setUnlocking(false)
    if (beep === true) {
      scannerRef.current?.beep()
    }
    if (result.success === false) {
      if (result.error.match(/shares did not combine to a valid secret/i)) {
        scannerRef.current?.start()
        scannedCodesRef.current.add(code)
        setShowScanNextBlockDialog(true)
        setShowPassphraseModal(false)
      } else {
        scannerRef.current?.stop()
        setShowScanNextBlockDialog(false)
        setShowPassphraseModal(true)
      }
    } else if (result.success === true) {
      scannerRef.current?.stop()
      scannedCodesRef.current.clear()
      setSecret(result.message.toString())
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
              sx={{
                fontSize: "14px",
                overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
                width: "100%",
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
                  setShowCopied(true)
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
          <Dialog
            key="copied-dialog"
            opened={showCopied}
            withCloseButton
            onClose={() => setShowCopied(false)}
            radius="sm"
            size="md"
          >
            {t("common.copied")}
          </Dialog>
        </Fragment>
      )
    } else {
      return (
        <Fragment>
          <Container>
            <Button.Group sx={{ display: "inline-block" }}>
              <Button
                variant="default"
                onClick={async () => {
                  await navigator.clipboard.writeText(secret)
                  setShowCopied(true)
                }}
              >
                {t("common.copy")}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  setShowCopied(false)
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
          <Dialog
            key="copied-dialog"
            opened={showCopied}
            withCloseButton
            onClose={() => setShowCopied(false)}
            radius="sm"
            size="md"
          >
            {t("common.copied")}
          </Dialog>
        </Fragment>
      )
    }
  } else {
    return (
      <Container>
        <Scanner
          ref={scannerRef}
          handleCode={async (code) => {
            codeRef.current = code
            await compute(true)
          }}
          autoBeep={false}
          autoStop={false}
        />
        {showScanNextBlockDialog === true ? (
          <Dialog
            key="scan-next-block-dialog"
            opened={true}
            withCloseButton
            onClose={() => setShowScanNextBlockDialog(false)}
            radius="sm"
            size="md"
          >
            {t("routes.restore.scanNextBlock")}…
          </Dialog>
        ) : null}
        {showPassphraseModal === true ? (
          <PasswordModal
            onClose={() => {
              setShowPassphraseModal(false)
              scannerRef.current?.start()
            }}
            onSubmit={async (passphrases) => {
              setUnlocking(true)
              passphrasesRef.current = passphrases
              await compute(false)
            }}
            unlocking={unlocking}
          />
        ) : null}
      </Container>
    )
  }
}

export default Restore
