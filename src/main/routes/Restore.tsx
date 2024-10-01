import React, {
  Fragment,
  FunctionComponent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { styled } from "styled-components"
import {
  Button,
  Dialog,
  Mark,
  Modal,
  PasswordInput,
  Popover,
  PopoverProps,
  RingProgress,
  Space,
  Text,
  useMantineTheme,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from "tabler-icons-react"
import Scanner, { play, Start, Stop } from "../Scanner"
import { extract } from "../utilities/regexp"
import { Payload } from "../../create"

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
  const { t } = useTranslation()
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
          return t("passphraseRequired")
        }
        return null
      },
    },
  })
  const handleUnlock = () => {
    const validation = form.validate()
    if (validation.hasErrors === false) {
      const passphrases = [form.values.passphrase]
      props.onSubmit(passphrases)
      form.reset()
    }
  }
  return (
    <Modal
      centered
      onClose={() => props.onClose()}
      opened={true}
      overlayBlur={4}
      title={`${t("enterPassphrase")}${
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
          label={t("passphrase")}
          placeholder={t("typePassphrase")}
          spellCheck={false}
          visibilityToggleIcon={({ reveal, size }) =>
            reveal === true ? (
              <EyeOffIcon size={size} />
            ) : (
              <EyeIcon size={size} />
            )
          }
          required
          {...form.getInputProps("passphrase", { withFocus: false })}
        />
        <Space h="lg" />
        <Button
          disabled={props.unlocking}
          gradient={{ from: "#fdc0ee", to: "#fbd6cd", deg: 45 }}
          loading={props.unlocking}
          onClick={handleUnlock}
          variant="gradient"
          sx={(theme) => ({
            "&:disabled": {
              color: theme.fn.darken("#fff", 0.25),
              backgroundImage: `linear-gradient(45deg, ${theme.fn.darken(
                "#fdc0ee",
                0.25
              )} 0%, ${theme.fn.darken("#fbd6cd", 0.25)} 100%)`,
            },
          })}
        >
          {props.unlocking === true ? t("unlocking") : t("unlock")}
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
  const [opened, { close, open }] = useDisclosure(false)
  return (
    <Popover opened={opened} position="bottom" width={props.width} withArrow>
      <Popover.Target>
        <Mark
          onMouseEnter={open}
          onMouseLeave={close}
          sx={{
            backgroundColor: theme.fn.rgba(theme.colors.pink[8], 0.35),
            color: theme.colorScheme === "dark" ? theme.colors.dark[0] : "#000",
            cursor: "default",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
            transition: "background-color 0.15s",
            "&:hover": {
              backgroundColor: theme.fn.rgba(theme.colors.pink[8], 0.7),
            },
          }}
        >
          {props.target}
        </Mark>
      </Popover.Target>
      <Popover.Dropdown sx={{ pointerEvents: "none" }}>
        <Text align="center" size="sm">
          {props.dropdown}
        </Text>
      </Popover.Dropdown>
    </Popover>
  )
}

interface TotpAppletProps {
  secret: string
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
    let previousTimeRemaining: number = null
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
  const passphrasesRef = useRef<string[]>([])
  const codeValueRef = useRef<string>(null)
  const startRef = useRef<Start>(null)
  const stopRef = useRef<Stop>(null)
  const doneRef = useRef<boolean>(false)
  const [showPassphraseModal, setShowPassphraseModal] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [showScanNextBlockDialog, setShowScanNextBlockDialog] = useState(false)
  const [secret, setSecret] = useState<string>(null)
  const [showCopied, setShowCopied] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const restoreStart = () => {
    startRef.current()
  }
  useEffect(() => {
    window.addEventListener("restore:start", restoreStart)
    return () => {
      window.removeEventListener("restore:start", restoreStart)
    }
  }, [])
  useEffect(() => {
    return () => {
      window.api.restoreReset()
    }
  }, [])
  const compute = async (audio: boolean) => {
    let payload: Payload
    try {
      payload = JSON.parse(codeValueRef.current)
      if (!payload.salt || !payload.iv || !payload.headers || !payload.data) {
        // Payload not Superbacked-compatible
        return
      }
    } catch (error) {
      // Payload not valid JSON
      return
    }
    if (audio === true) {
      play()
    }
    if (
      (props.importMode === true || props.exportMode === true) &&
      props.handlePayload
    ) {
      stopRef.current()
      props.handlePayload(payload)
      return
    }
    const { error, message } = await window.api.restore(
      passphrasesRef.current,
      payload
    )
    setUnlocking(false)
    if (doneRef.current === true) {
      // Payload already computed
      return
    }
    if (error) {
      if (error.match(/shares did not combine to a valid secret/i)) {
        startRef.current()
        setShowScanNextBlockDialog(true)
        setShowPassphraseModal(false)
      } else {
        stopRef.current()
        setShowScanNextBlockDialog(false)
        setShowPassphraseModal(true)
      }
    } else if (message) {
      doneRef.current = true
      stopRef.current()
      setSecret(message.toString())
    } else {
      startRef.current()
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
                const dropdownNodes: ReactNode[] = []
                for (const [index, word] of result.properties.words.entries()) {
                  dropdownNodes.push(
                    <Fragment key={`dropdown-node-${dropdownNodes.length}`}>
                      <Text sx={{ display: "inline-block" }}>
                        <Text color="dimmed" span>
                          {index + 1}.{" "}
                        </Text>
                        {word}
                      </Text>{" "}
                    </Fragment>
                  )
                }
                lineNodes.push(
                  <SmartPopover
                    key={`line-node-${lineNodes.length}`}
                    dropdown={dropdownNodes}
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
              align="left"
              sx={{
                fontSize: "14px",
                overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
                width: "100%",
              }}
            >
              {nodes}
            </Text>
            <Space h="lg" />
            <Button.Group sx={{ display: "inline-block" }}>
              <Button
                variant="default"
                onClick={() => {
                  navigator.clipboard.writeText(secret)
                  setShowCopied(true)
                }}
              >
                {t("copy")}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  navigate("/")
                }}
              >
                {t("done")}
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
            {t("copied")}
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
                onClick={() => {
                  navigator.clipboard.writeText(secret)
                  setShowCopied(true)
                }}
              >
                {t("copy")}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  setShowCopied(false)
                  setShowSecret(true)
                }}
              >
                {t("showSecret")}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  navigate("/")
                }}
              >
                {t("done")}
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
            {t("copied")}
          </Dialog>
        </Fragment>
      )
    }
  } else {
    return (
      <Container>
        <Scanner
          handleCode={async (code, imageDateUrl, start, stop) => {
            if (doneRef.current === false) {
              codeValueRef.current = code
              startRef.current = start
              stopRef.current = stop
              compute(true)
            }
          }}
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
            {t("scanNextBlock")}…
          </Dialog>
        ) : null}
        {showPassphraseModal === true ? (
          <PasswordModal
            onClose={() => {
              setShowPassphraseModal(false)
              startRef.current()
            }}
            onSubmit={(passphrases) => {
              setUnlocking(true)
              passphrasesRef.current = passphrases
              compute(false)
            }}
            unlocking={unlocking}
          />
        ) : null}
      </Container>
    )
  }
}

export default Restore
