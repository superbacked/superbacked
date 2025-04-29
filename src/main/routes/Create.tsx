import {
  ActionIcon,
  Badge,
  Button,
  Dialog,
  Divider,
  Group,
  Mark,
  Modal,
  Popover,
  Progress,
  Select,
  SelectItem,
  Space,
  Text,
  Textarea,
  TextareaProps,
  TextInput,
  TextInputProps,
  useMantineTheme,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import leven from "leven"
import { transparentize } from "polished"
import {
  Fragment,
  FunctionComponent,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { styled } from "styled-components"
import {
  ArrowsRandom as ArrowsRandomIcon,
  Printer as PrinterIcon,
} from "tabler-icons-react"
import { Qr, Secret } from "../../create"
import ErrorModal from "../components/ErrorModal"
import Scanner, { play } from "../Scanner"
import { extract, ExtractionType } from "../utilities/regexp"
import sleep from "../utilities/sleep"
import zxcvbn, { ZxcvbnTranslationKey } from "../utilities/zxcvbn"

const maxDataLength = 1024
const maxLabelLength = 64
const shamirBackupTypes = ["2of3", "3of5", "4of7"]

const Container = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  padding: 40px;
  z-index: 0;
`

const ModalContainer = styled.div`
  position: relative;
  height: 330px;
`

const Blocks = styled.div`
  text-align: center;
`

const BlockContainer = styled.div`
  position: relative;
  display: inline-block;
`

const blockWidth = 120

const Block = styled.img`
  width: ${blockWidth}px;
  height: ${(blockWidth * 6) / 4}px;
  box-shadow: ${transparentize(".95", "#000")} 0px 0px 40px -1px;
  margin: 20px;
  -webkit-user-drag: none;
`

interface Selection {
  element: HTMLTextAreaElement
  start: number
  end: number
}

const captureSelection = (): Selection => {
  const element = document.activeElement as HTMLTextAreaElement
  const [start, end] = [element.selectionStart, element.selectionEnd]
  return {
    element,
    start,
    end,
  }
}
const restoreSelection = (selection: Selection) => {
  selection.element.focus()
  selection.element.setSelectionRange(selection.start, selection.end)
}
const insertAtCursor = (text: string) => {
  const element = document.activeElement as HTMLTextAreaElement
  // const [start, end] = [element.selectionStart, element.selectionEnd]
  // element.setRangeText(text, start, end, "end")
  // form.setFieldValue("secret1", element.value)
  document.execCommand("insertText", false, text)
  const event = new Event("change", { bubbles: true })
  element.dispatchEvent(event)
  element.blur()
  element.focus()
}

interface DataLengths {
  totalDataLength: number
  secret1DataLength: number
  maxHiddenSecretsDataLength: number
  maxRemainingHiddenDataLength: number
}

interface SecretTextareaProps extends TextareaProps {
  dataLengths: DataLengths
  secretNumber: number
}

interface Mark {
  string: string
  type: ExtractionType
  color: string
  label: string
  start: number
  end: number
  selected: boolean
}

interface MarkBadge {
  color: string
  label: string
  count: number
}

type MarkBadges = {
  [type in ExtractionType]?: MarkBadge
}

const SecretTextareaWithLength: FunctionComponent<SecretTextareaProps> = (
  props
) => {
  const { t } = useTranslation()
  const theme = useMantineTheme()
  const updatePopoverRef = useRef<() => Promise<void>>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [popoverOpened, setPopoverOpened] = useState(false)
  const [lengthPercentage, setLengthPercentage] = useState<number>(null)
  const [marks, setMarks] = useState<Mark[]>([])
  const color = lengthPercentage > 100 ? "red" : "teal"
  const {
    dataLengths,
    secretNumber,
    onBlur,
    onChange,
    onFocus,
    ...otherProps
  } = props
  updatePopoverRef.current = async () => {
    const contextualizedMaxDataLength =
      secretNumber === 1
        ? maxDataLength
        : dataLengths.maxHiddenSecretsDataLength
    const contextualizedRemainingMaxDataLength =
      secretNumber === 1
        ? maxDataLength - dataLengths.secret1DataLength
        : dataLengths.maxRemainingHiddenDataLength
    const length =
      contextualizedMaxDataLength - contextualizedRemainingMaxDataLength
    const percentage = Math.min(
      Math.ceil((length / contextualizedMaxDataLength) * 100)
    )
    setLengthPercentage(percentage)
    const { start, end } = captureSelection()
    const results = await extract(otherProps.value as string)
    const marks: Mark[] = []
    for (const result of results) {
      let selected = false
      if (
        (start > result.start && start < result.end) ||
        (end > result.start && end < result.end) ||
        (start <= result.start && end >= result.end)
      ) {
        selected = true
      }
      if (result.type === "validBip39Mnemonic") {
        marks.push({
          string: result.string,
          type: result.type,
          color: theme.fn.rgba(theme.colors.pink[8], selected ? 0.7 : 0.35),
          label: "BIP39",
          start: result.start,
          end: result.end,
          selected: selected,
        })
      } else if (result.type === "totpUri") {
        marks.push({
          string: result.string,
          type: result.type,
          color: theme.fn.rgba(theme.colors.pink[8], selected ? 0.7 : 0.35),
          label: "TOTP",
          start: result.start,
          end: result.end,
          selected: selected,
        })
      }
    }
    setMarks(marks)
  }
  const updateScrollTop = () => {
    textRef.current.scrollTop = textareaRef.current.scrollTop
  }
  const handleSelectionChange = () => {
    if (document.activeElement === textareaRef.current) {
      setSelection(captureSelection())
    }
  }
  useEffect(() => {
    textareaRef.current.addEventListener("scroll", updateScrollTop)
    document.addEventListener("selectionchange", handleSelectionChange)
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
    }
  }, [])
  useEffect(() => {
    updatePopoverRef.current()
  }, [otherProps.value, selection])
  const markBadges: ReactNode[] = []
  const badges: MarkBadges = {}
  for (const mark of marks) {
    if (mark.selected) {
      const badgeType = badges[mark.type]
      if (badgeType) {
        badgeType.count++
      } else {
        badges[mark.type] = {
          color: mark.color,
          label: mark.label,
          count: 1,
        }
      }
    }
  }
  if (badges) {
    const types = Object.keys(badges) as Array<keyof typeof badges>
    let typeCount = 0
    for (const type of types) {
      typeCount++
      const badge = badges[type]
      markBadges.push(
        <Fragment key={type}>
          <Group>
            <Badge
              styles={(theme) => ({
                root: {
                  backgroundColor: badge.color,
                  transition: "background-color 0.15s",
                  width: "60px",
                },
                inner: {
                  color:
                    theme.colorScheme === "dark"
                      ? theme.colors.dark[0]
                      : "#000",
                },
              })}
            >
              {badge.label}
            </Badge>
            <Text color="dimmed" size="sm">
              {badge.count}{" "}
              {t(type, {
                count: badge.count,
              })}{" "}
              {t("found", {
                count: badge.count,
              })}
            </Text>
          </Group>
          {typeCount < types.length ? <Space h="xs" /> : null}
        </Fragment>
      )
    }
  }
  const value = otherProps.value as string
  const textChildren: ReactNode[] = []
  let startIndex = 0
  if (marks.length === 0) {
    textChildren.push(value.replace(/\n$/, "\n\n"))
  } else {
    for (const mark of marks) {
      textChildren.push(value.substring(startIndex, mark.start))
      textChildren.push(
        <Mark
          key={`${mark.string}-${textChildren.length}`}
          dangerouslySetInnerHTML={{
            __html: value.substring(mark.start, mark.end),
          }}
          sx={{
            backgroundColor: mark.color,
            color: "transparent",
            overflowWrap: "anywhere",
            transition: "background-color 0.15s",
            whiteSpace: "pre-wrap",
          }}
        />
      )
      startIndex = mark.end
    }
    textChildren.push(value.substring(startIndex).replace(/\n$/, "\n\n"))
  }
  return (
    <Popover
      opened={popoverOpened}
      positionDependencies={[otherProps.value]}
      width={"440px"}
      withArrow
    >
      <Popover.Dropdown>
        <Text align="center" color="dimmed" size="sm" weight="bold">
          {t("secretLength")}
        </Text>
        <Space h="lg" />
        <Progress color={color} value={lengthPercentage} />
        <Space h="lg" />
        <Text color={lengthPercentage > 100 ? "red" : "dimmed"} size="sm">
          {t("lengthRemaining")}: {100 - lengthPercentage}%
        </Text>
        {markBadges.length > 0 ? (
          <Fragment>
            <Divider my="md" variant="dotted" />
            {markBadges}
          </Fragment>
        ) : null}
      </Popover.Dropdown>
      <Popover.Target>
        <Group
          onFocusCapture={() => {
            if (otherProps.value !== "") {
              setPopoverOpened(true)
            }
          }}
          onBlurCapture={() => setPopoverOpened(false)}
          sx={() => ({
            position: "relative",
            width: "100%",
          })}
        >
          <Text
            ref={textRef}
            children={textChildren}
            sx={(theme) => ({
              position: "absolute",
              top: "25px",
              right: 0,
              bottom: otherProps.error ? null : 0,
              left: 0,
              backgroundColor:
                theme.colorScheme === "dark" ? theme.colors.dark[6] : "#fff",
              border: `solid 1px ${
                theme.colorScheme === "dark" ? theme.colors.dark[6] : "#fff"
              }`,
              borderRadius: "4px",
              color: "transparent",
              fontSize: "14px",
              height: otherProps.error
                ? textareaRef.current.offsetHeight
                : null,
              overflowX: "hidden",
              overflowY: "scroll",
              paddingTop: "10px",
              paddingRight: "12px",
              paddingBottom: "10px",
              paddingLeft: "12px",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              "::-webkit-scrollbar": {
                width: "10px",
              },
              "::-webkit-scrollbar-track": {
                backgroundColor:
                  theme.colorScheme === "dark"
                    ? theme.colors.dark[5]
                    : theme.colors.pink[0],
                borderTopRightRadius: "3px",
                borderBottomRightRadius: "3px",
              },
            })}
          />
          <Textarea
            ref={textareaRef}
            onBlur={(event) => {
              onBlur(event)
              updatePopoverRef.current()
            }}
            onChange={(event) => {
              onChange(event)
              if (event.currentTarget.value !== "") {
                setPopoverOpened(true)
              } else {
                setPopoverOpened(false)
              }
            }}
            onFocus={(event) => {
              onFocus(event)
              updatePopoverRef.current()
            }}
            {...otherProps}
            styles={(theme) => ({
              root: {
                width: "100%",
              },
              input: {
                backgroundColor: "transparent",
                overflowX: "hidden",
                overflowY: "scroll",
                "::-webkit-scrollbar": {
                  width: "10px",
                },
                "::-webkit-scrollbar-track": {
                  backgroundColor:
                    theme.colorScheme === "dark"
                      ? theme.colors.dark[5]
                      : theme.colors.gray[0],
                  borderTopRightRadius: "3px",
                  borderBottomRightRadius: "3px",
                },
                "::-webkit-scrollbar-thumb": {
                  backgroundColor:
                    theme.colorScheme === "dark"
                      ? theme.colors.dark[7]
                      : theme.colors.gray[2],
                  borderRadius: "5px",
                },
              },
            })}
          />
        </Group>
      </Popover.Target>
    </Popover>
  )
}

interface Time {
  key: ZxcvbnTranslationKey
  base: number
}

interface PassphraseInputWithStrengthProps extends TextInputProps {
  generatePassphrase: () => Promise<string>
}

export const PassphraseInputWithStrength: FunctionComponent<
  PassphraseInputWithStrengthProps
> = (props) => {
  const { t } = useTranslation()
  const textInputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>(null)
  const [popoverOpened, setPopoverOpened] = useState(false)
  const [strength, setStrength] = useState<number>(null)
  const [time, setTime] = useState<Time>(null)
  const color = strength === 100 ? "teal" : strength >= 50 ? "yellow" : "red"
  const { generatePassphrase, onChange, ...otherProps } = props
  const updatePopover = (passphrase: string) => {
    const result = zxcvbn(passphrase)
    setStrength(result.strength)
    setTime({
      key: result.crackTimesDisplay.offlineSlowHashing1e4PerSecond,
      base: result.base,
    })
  }
  useLayoutEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      updatePopover(otherProps.value as string)
    }, 0)
  }, [otherProps.value])
  return (
    <Popover opened={popoverOpened} width={"440px"} withArrow>
      <Popover.Dropdown>
        <Text align="center" color="dimmed" size="sm" weight="bold">
          {t("passphraseStrength")}
        </Text>
        <Space h="lg" />
        <Progress color={color} value={strength} />
        <Space h="lg" />
        {time !== null ? (
          <Text color={strength < 50 ? "red" : "dimmed"} size="sm">
            {t("estimatedAttackTime")}:{" "}
            {t(`zxcvbn.${time.key}`, {
              base: time.base,
            })}
          </Text>
        ) : null}
      </Popover.Dropdown>
      <Popover.Target>
        <TextInput
          ref={textInputRef}
          onFocusCapture={() => {
            if (otherProps.value !== "") {
              setPopoverOpened(true)
            }
          }}
          onBlurCapture={() => setPopoverOpened(false)}
          onChange={(event) => {
            onChange(event)
            if (event.currentTarget.value !== "") {
              setPopoverOpened(true)
            } else {
              setPopoverOpened(false)
            }
          }}
          rightSection={
            <ActionIcon
              disabled={otherProps.disabled}
              onClick={async () => {
                textInputRef.current.focus()
                const passphrase = await generatePassphrase()
                updatePopover(passphrase)
                setPopoverOpened(true)
              }}
            >
              <ArrowsRandomIcon size={16} />
            </ActionIcon>
          }
          {...otherProps}
        />
      </Popover.Target>
    </Popover>
  )
}

type Step = "secret1" | "secret2" | "secret3" | "preview"

interface CreateProps {
  importMode?: boolean
  exportMode?: boolean
  qrs?: Qr[]
}

const Create: FunctionComponent<CreateProps> = (props) => {
  let initialStep: Step,
    initialQrs: Qr[] = null
  if ((props.importMode === true || props.exportMode === true) && props.qrs) {
    initialQrs = props.qrs
    initialStep = "preview"
  } else {
    initialStep = "secret1"
  }
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [showHiddenSecrets, setShowHiddenSecrets] = useState(
    window.api.menuGetShowHiddenSecretsState()
  )
  const [step, setStep] = useState<Step>(initialStep)
  const [selection, setSelection] = useState<Selection>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [creating, setCreating] = useState(false)
  const [printerData, setPrinterData] = useState<SelectItem[]>([])
  const [showSelectPrinter, setShowSelectPrinter] = useState(false)
  const [error, setError] = useState<
    "couldNotEncryptSecrets" | "couldNotEncryptSecret" | "pleaseConnectPrinter"
  >()
  const [showError, setShowError] = useState(false)
  const [showPrinting, setShowPrinting] = useState(false)
  const [qrs, setQrs] = useState<Qr[]>(initialQrs)
  const form = useForm({
    initialValues: {
      secret1: "",
      passphrase1: "",
      secret2: "",
      passphrase2: "",
      secret3: "",
      passphrase3: "",
      backupType: "",
      label: "",
    },
    validate: {
      secret1: (value) => {
        if (!value || value === "") {
          return t("secretRequired")
        } else if (dataLengths.secret1DataLength > maxDataLength) {
          return t("secretTooLong")
        }
        return null
      },
      passphrase1: (value) => {
        const result = zxcvbn(value)
        if (!value || value === "") {
          return t("passphraseRequired")
        } else if (result.strength < 50) {
          return t("passphraseTooWeak")
        }
        return null
      },
      backupType: (value) => {
        if (!value || value === "") {
          return t("backupTypeRequired")
        }
        return null
      },
      label: (value) => {
        if (value.length > maxLabelLength) {
          return t("labelTooLong")
        }
        return null
      },
      secret2: (value) => {
        if (step === "secret2") {
          if (!value || value === "") {
            return t("secretRequired")
          } else if (dataLengths.maxRemainingHiddenDataLength < 0) {
            return t("secretTooLong")
          }
        }
        return null
      },
      passphrase2: (value, values) => {
        if (step === "secret2") {
          const result = zxcvbn(value)
          if (!value || value === "") {
            return t("passphraseRequired")
          } else if (result.strength < 50) {
            return t("passphraseTooWeak")
          }
          for (const [entryKey, entryValue] of Object.entries(values)) {
            if (entryKey.match(/^passphrase(1|3)$/) && entryValue === value) {
              return t("passphraseUsed")
            } else if (
              entryKey.match(/^passphrase(1|3)$/) &&
              leven(entryValue, value) < entryValue.length / 2
            ) {
              return t("passphraseTooSimilar")
            }
          }
        }
        return null
      },
      secret3: (value) => {
        if (step === "secret3") {
          if (!value || value === "") {
            return t("secretRequired")
          } else if (dataLengths.maxRemainingHiddenDataLength < 0) {
            return t("secretTooLong")
          }
        }
        return null
      },
      passphrase3: (value, values) => {
        if (step === "secret3") {
          const result = zxcvbn(value)
          if (!value || value === "") {
            return t("passphraseRequired")
          } else if (result.strength < 50) {
            return t("passphraseTooWeak")
          }
          for (const [entryKey, entryValue] of Object.entries(values)) {
            if (entryKey.match(/^passphrase(1|2)$/) && entryValue === value) {
              return t("passphraseUsed")
            } else if (
              entryKey.match(/^passphrase(1|2)$/) &&
              leven(entryValue, value) < entryValue.length / 2
            ) {
              return t("passphraseTooSimilar")
            }
          }
        }
        return null
      },
    },
  })
  const getDataLengths = (): DataLengths => {
    let secret1DataLength = window.api.getDataLength(form.values.secret1)
    // Account for Shamir Secret Sharing overhead
    if (shamirBackupTypes.includes(form.values.backupType)) {
      secret1DataLength += 56
    }
    let totalDataLength = maxDataLength
    let concatenatedHiddenSecretsLength = 0
    for (const [entryKey, entryValue] of Object.entries(form.values)) {
      if (entryKey.match(/^secret(2|3)$/) && entryValue !== "") {
        concatenatedHiddenSecretsLength += window.api.getDataLength(entryValue)
        // Account for Shamir Secret Sharing overhead
        if (shamirBackupTypes.includes(form.values.backupType)) {
          concatenatedHiddenSecretsLength += 56
        }
      }
    }
    const maxHiddenSecretsDataLength = totalDataLength - secret1DataLength
    const maxRemainingHiddenDataLength =
      maxHiddenSecretsDataLength - concatenatedHiddenSecretsLength
    return {
      totalDataLength: totalDataLength,
      secret1DataLength: secret1DataLength,
      maxHiddenSecretsDataLength: maxHiddenSecretsDataLength,
      maxRemainingHiddenDataLength: maxRemainingHiddenDataLength,
    }
  }
  const handleCreate = async () => {
    const validation = form.validate()
    if (validation.hasErrors === false) {
      setCreating(true)
      let shamir: boolean, number: number, threshold: number
      const secrets: Secret[] = []
      for (const index of [1, 2, 3]) {
        const secret = form.values[`secret${index}` as keyof typeof form.values]
        const passphrase =
          form.values[`passphrase${index}` as keyof typeof form.values]
        if (secret && secret !== "" && passphrase && passphrase !== "") {
          secrets.push({
            message: secret,
            passphrases: [passphrase],
          })
        }
      }
      const label = form.values.label
      if (shamirBackupTypes.includes(form.values.backupType)) {
        shamir = true
        if (form.values.backupType === "2of3") {
          number = 3
          threshold = 2
        } else if (form.values.backupType === "3of5") {
          number = 5
          threshold = 3
        } else if (form.values.backupType === "4of7") {
          number = 7
          threshold = 4
        }
      }
      const { error, qrs } = await window.api.create(
        secrets,
        dataLengths.totalDataLength,
        label,
        shamir,
        number,
        threshold
      )
      if (error) {
        form.reset()
        setError(
          showHiddenSecrets === true
            ? "couldNotEncryptSecrets"
            : "couldNotEncryptSecret"
        )
        setShowError(true)
        setCreating(false)
        setStep("secret1")
      } else {
        form.reset()
        setQrs(qrs)
        setCreating(false)
        setStep("preview")
      }
    }
  }
  const handlePrint = async (printerName: string) => {
    setShowPrinting(true)
    for (const qr of qrs) {
      await window.api.print(printerName, qr.pdf, qr.copies)
    }
    await sleep(10000)
    let done: boolean
    while (done !== true) {
      const status = await window.api.getPrinterStatus(printerName)
      if (status === "standby") {
        setShowPrinting(false)
        done = true
      }
      await sleep(1000)
    }
  }
  useEffect(() => {
    const removeListener = window.api.menuInsert(async (type) => {
      if (type === "mnemonic") {
        const mnemonic = await window.api.generateMnemonic()
        insertAtCursor(mnemonic)
      } else if (type === "passphrase") {
        const passphrase = await window.api.generatePassphrase()
        insertAtCursor(passphrase)
      } else if (type === "scanQrCode") {
        const selection = captureSelection()
        setSelection(selection)
        setShowScanner(true)
      }
    })
    return () => {
      removeListener()
    }
  }, [])
  useEffect(() => {
    const removeListener = window.api.menuShowHiddenSecrets((state) => {
      const element = document.activeElement as HTMLElement
      element.blur()
      setShowHiddenSecrets(state)
      setStep("secret1")
      for (const key of Object.keys(form.values)) {
        if (key.match(/(secret|passphrase)[2-3]/)) {
          form.setFieldValue(key, "")
        }
      }
    })
    return () => {
      removeListener()
    }
  }, [form])
  const dataLengths = getDataLengths()
  let stepMatch: RegExpMatchArray
  if ((stepMatch = step.match(/^secret([1-3])$/))) {
    const secretNumber = parseInt(stepMatch[1])
    let stepFields: ReactNode
    let addSecret: ReactNode
    let removeSecret: ReactNode
    if (secretNumber === 1) {
      stepFields = (
        <Fragment>
          <SecretTextareaWithLength
            key="secret1"
            autosize
            dataLengths={dataLengths}
            disabled={creating}
            label={t("secret")}
            maxRows={5}
            minRows={2}
            placeholder={t("typeSecret")}
            required
            secretNumber={1}
            spellCheck={false}
            onFocus={() => {
              window.api.enableModes(["insert"])
            }}
            onBlur={() => {
              window.api.disableModes(["insert"])
              const selection = window.getSelection()
              selection.removeAllRanges()
            }}
            {...form.getInputProps("secret1", { withFocus: false })}
          />
          <Space h="lg" />
          <PassphraseInputWithStrength
            key="passphrase1"
            disabled={creating}
            label={t("passphrase")}
            placeholder={t("typePassphrase")}
            required
            spellCheck={false}
            generatePassphrase={async () => {
              const passphrase = await window.api.generatePassphrase(
                5,
                "eff_short_wordlist_1"
              )
              form.setFieldValue("passphrase1", passphrase)
              return passphrase
            }}
            {...form.getInputProps("passphrase1", { withFocus: false })}
          />
          <Space h="lg" />
          <Group align="start" grow>
            <Select
              allowDeselect
              disabled={creating}
              label={t("backupType")}
              placeholder={t("selectBackupType")}
              required
              data={[
                {
                  value: "standard",
                  label: t("standard"),
                },
                { value: "2of3", label: t("2of3") },
                { value: "3of5", label: t("3of5") },
                { value: "4of7", label: t("4of7") },
              ]}
              {...form.getInputProps("backupType", { withFocus: false })}
            />
            <TextInput
              disabled={creating}
              label={t("label")}
              placeholder={t("typeLabel")}
              {...form.getInputProps("label", { withFocus: false })}
            />
          </Group>
        </Fragment>
      )
    } else if (secretNumber > 1) {
      stepFields = (
        <Fragment>
          <SecretTextareaWithLength
            key={`secret${secretNumber}`}
            autosize
            dataLengths={dataLengths}
            disabled={creating}
            label={t("secret")}
            maxRows={4}
            minRows={2}
            placeholder={t("typeSecret")}
            required
            secretNumber={secretNumber}
            spellCheck={false}
            onFocus={() => {
              window.api.enableModes(["insert"])
            }}
            onBlur={() => {
              window.api.disableModes(["insert"])
              const selection = window.getSelection()
              selection.removeAllRanges()
            }}
            {...form.getInputProps(`secret${secretNumber}`, {
              withFocus: false,
            })}
          />
          <Space h="lg" />
          <PassphraseInputWithStrength
            key={`passphrase${secretNumber}`}
            disabled={creating}
            label={t("passphrase")}
            placeholder={t("typePassphrase")}
            required
            spellCheck={false}
            generatePassphrase={async () => {
              const passphrase = await window.api.generatePassphrase(
                5,
                "eff_short_wordlist_1"
              )
              form.setFieldValue(`passphrase${secretNumber}`, passphrase)
              return passphrase
            }}
            {...form.getInputProps(`passphrase${secretNumber}`, {
              withFocus: false,
            })}
          />
        </Fragment>
      )
    }
    if (showHiddenSecrets && [1, 2].includes(secretNumber)) {
      const secretValue =
        form.values[`secret${secretNumber}` as keyof typeof form.values]
      const passphraseValue =
        form.values[`passphrase${secretNumber}` as keyof typeof form.values]
      addSecret = (
        <Fragment>
          <Space h="lg" />
          <Button
            disabled={
              !secretValue ||
              secretValue === "" ||
              !passphraseValue ||
              passphraseValue === "" ||
              !form.values.backupType ||
              dataLengths.maxRemainingHiddenDataLength <= 40 ||
              creating
            }
            fullWidth
            size="md"
            variant="subtle"
            onClick={() => {
              const validation = form.validate()
              if (validation.hasErrors === false) {
                setStep(`secret${secretNumber + 1}` as Step)
              }
            }}
            sx={() => ({
              "&:disabled": {
                backgroundColor: "transparent",
              },
              "&:hover": {
                backgroundColor: "transparent",
              },
            })}
          >
            {t("addSecret")}
          </Button>
        </Fragment>
      )
    }
    if (showHiddenSecrets && [2, 3].includes(secretNumber)) {
      removeSecret = (
        <Fragment>
          <Space h="lg" />
          <Button
            disabled={creating}
            fullWidth
            size="md"
            variant="subtle"
            onClick={() => {
              form.setFieldValue(`secret${secretNumber}`, "")
              form.setFieldValue(`passphrase${secretNumber}`, "")
              setStep(`secret${secretNumber - 1}` as Step)
            }}
            sx={() => ({
              "&:disabled": {
                backgroundColor: "transparent",
              },
              "&:hover": {
                backgroundColor: "transparent",
              },
            })}
          >
            {t("removeSecret")}
          </Button>
        </Fragment>
      )
    }
    return (
      <Fragment>
        <Container>
          <form onSubmit={form.onSubmit(handleCreate)}>
            {stepFields}
            <Space h="lg" />
            <Button
              disabled={creating}
              fullWidth
              gradient={{ from: "#fdc0ee", to: "#fbd6cd", deg: 45 }}
              loading={creating}
              onClick={handleCreate}
              size="md"
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
              {creating === true ? t("creating") : t("create")}
            </Button>
            {removeSecret}
            {addSecret}
          </form>
          <Modal
            centered
            opened={showScanner}
            onClose={() => {
              setShowScanner(false)
            }}
            overlayBlur={4}
            padding={0}
            size="md"
            trapFocus={false}
            withCloseButton={false}
          >
            <ModalContainer>
              <Scanner
                handleCode={(code) => {
                  play()
                  restoreSelection(selection)
                  insertAtCursor(code)
                  setShowScanner(false)
                }}
                radius={4}
              />
            </ModalContainer>
          </Modal>
        </Container>
        <ErrorModal
          error={t(error)}
          opened={showError}
          onClose={() => setShowError(false)}
        />
      </Fragment>
    )
  } else if (step === "preview") {
    const blocks: ReactNode[] = []
    for (const qr of qrs) {
      blocks.push(
        <BlockContainer key={qr.shortHash}>
          <Block src={`data:image/jpeg;base64,${qr.jpg}`} />
          {props.importMode !== true ? (
            <Select
              data={[
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
                { value: "4", label: "4" },
                { value: "5", label: "5" },
                { value: "6", label: "6" },
                { value: "7", label: "7" },
                { value: "8", label: "8" },
                { value: "9", label: "9" },
              ]}
              defaultValue="1"
              icon={<PrinterIcon size={14} />}
              size="xs"
              sx={{
                position: "absolute",
                bottom: "5px",
                left: "45px",
                maxWidth: "70px",
              }}
              onChange={(value) => {
                qr.copies = parseInt(value)
              }}
            />
          ) : null}
        </BlockContainer>
      )
    }
    return (
      <Fragment>
        <Container>
          <Blocks>
            {blocks}
            <Space h="lg" />
            <Button.Group sx={{ display: "inline-block" }}>
              {props.importMode !== true ? (
                <Button
                  disabled={showPrinting}
                  variant="default"
                  onClick={async () => {
                    const printers = await window.api.getPrinters()
                    const printer = await window.api.getDefaultPrinter()
                    if (printers.length === 0) {
                      setError("pleaseConnectPrinter")
                      setShowError(true)
                    } else if (!printer) {
                      const data: SelectItem[] = []
                      for (const printer of printers) {
                        data.push({
                          label: printer.displayName,
                          value: printer.name,
                        })
                      }
                      setPrinterData(data)
                      setShowSelectPrinter(true)
                    } else {
                      handlePrint(printer.name)
                    }
                  }}
                >
                  {t("print")}
                </Button>
              ) : null}
              <Button
                variant="default"
                onClick={async () => {
                  await window.api.save(qrs, ["jpg", "pdf"])
                }}
              >
                {t("save")}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  if (props.importMode === true || props.exportMode === true) {
                    navigate("/")
                  } else {
                    setStep("secret1")
                    setQrs(null)
                  }
                }}
              >
                {t("done")}
              </Button>
            </Button.Group>
          </Blocks>
        </Container>
        <Modal
          centered
          onClose={() => {
            setShowSelectPrinter(false)
          }}
          opened={showSelectPrinter}
          overlayBlur={4}
          title={t("pleaseSelectPrinter")}
          styles={{
            title: {
              fontWeight: "bold",
            },
          }}
        >
          <Select
            allowDeselect
            data={printerData}
            disabled={printerData.length === 0}
            icon={<PrinterIcon size={16} />}
            label={t("printer")}
            maxDropdownHeight={240}
            placeholder={`${t("selectPrinter")}…`}
            onChange={(value) => {
              setShowSelectPrinter(false)
              handlePrint(value)
            }}
          />
        </Modal>
        <Dialog
          opened={showPrinting}
          withCloseButton
          onClose={() => setShowPrinting(false)}
          radius="sm"
          size="md"
        >
          {t("printing")}…
        </Dialog>
        <ErrorModal
          error={t(error)}
          opened={showError}
          onClose={() => setShowError(false)}
        />
      </Fragment>
    )
  }
}

export default Create
