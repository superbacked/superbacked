import styled from "@emotion/styled"
import {
  Button,
  ComboboxItem,
  darken,
  Dialog,
  Group,
  Modal,
  Select,
  Space,
  TextInput,
  rgba,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import leven from "leven"
import {
  Fragment,
  FunctionComponent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Printer as PrinterIcon } from "tabler-icons-react"

import { ValidateTranslationKeys } from "@/src/@types/react-i18next"
import { Qr, Secret, Result } from "@/src/create"
import ErrorModal from "@/src/main/components/ErrorModal"
import PassphraseInputWithStrength from "@/src/main/components/PassphraseInputWithStrength"
import Scanner, { ScannerRef } from "@/src/main/components/Scanner"
import SecretTextareaWithLength from "@/src/main/components/SecretTextareaWithLength"
import {
  SelectionWithElement,
  captureSelection,
  restoreSelection,
  insertAtCursor,
} from "@/src/main/utilities/selection"
import zxcvbn from "@/src/main/utilities/zxcvbn"

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
  box-shadow: ${rgba("#000000", 0.95)} 0px 0px 40px -1px;
  margin: 20px;
  -webkit-user-drag: none;
`

export interface DataLengths {
  totalDataLength: number
  secret1DataLength: number
  maxHiddenSecretsDataLength: number
  maxRemainingHiddenDataLength: number
}

type Step = "secret1" | "secret2" | "secret3" | "preview"

interface CreateProps {
  importMode?: boolean
  exportMode?: boolean
  qrs?: Qr[]
}

const Create: FunctionComponent<CreateProps> = (props) => {
  let initialStep: Step,
    initialQrs: Qr[] = []
  if ((props.importMode === true || props.exportMode === true) && props.qrs) {
    initialQrs = props.qrs
    initialStep = "preview"
  } else {
    initialStep = "secret1"
  }
  const navigate = useNavigate()
  const { i18n, t } = useTranslation()
  const scannerRef = useRef<ScannerRef>(null)
  const [showHiddenSecrets, setShowHiddenSecrets] = useState(
    window.api.menuGetShowHiddenSecretsState()
  )
  const [step, setStep] = useState<Step>(initialStep)
  const [selection, setSelection] = useState<null | SelectionWithElement>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [creating, setCreating] = useState(false)
  const [printerData, setPrinterData] = useState<ComboboxItem[]>([])
  const [showSelectPrinter, setShowSelectPrinter] = useState(false)
  const [error, setError] = useState<null | ValidateTranslationKeys<
    | "routes.create.couldNotEncryptSecret"
    | "routes.create.couldNotEncryptSecrets"
    | "routes.create.pleaseConnectPrinter"
    | "routes.create.pleaseSelectPrinter"
  >>(null)
  const [showError, setShowError] = useState(false)
  const [showPrinting, setShowPrinting] = useState(false)
  const [qrs, setQrs] = useState<Qr[]>(initialQrs)
  type FormValues = {
    secret1: string
    passphrase1: string
    secret2: string
    passphrase2: string
    secret3: string
    passphrase3: string
    backupType: string
    label: string
  }
  const getDataLengths = useCallback((values: FormValues): DataLengths => {
    let secret1DataLength = window.api.getDataLength(values.secret1)
    // Account for Shamir Secret Sharing overhead
    if (shamirBackupTypes.includes(values.backupType)) {
      secret1DataLength += 56
    }
    const totalDataLength = maxDataLength
    let concatenatedHiddenSecretsLength = 0
    for (const [entryKey, entryValue] of Object.entries(values)) {
      if (entryKey.match(/^secret(2|3)$/) && entryValue !== "") {
        concatenatedHiddenSecretsLength += window.api.getDataLength(entryValue)
        // Account for Shamir Secret Sharing overhead
        if (shamirBackupTypes.includes(values.backupType)) {
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
  }, [])
  const form = useForm<FormValues>({
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
      secret1: (value, values) => {
        const dataLengths = getDataLengths(values)
        if (!value || value === "") {
          return t("routes.create.secretRequired")
        } else if (
          dataLengths.secret1DataLength > dataLengths.totalDataLength
        ) {
          return t("routes.create.secretTooLong")
        }
        return null
      },
      passphrase1: (value) => {
        const result = zxcvbn(value)
        if (!value || value === "") {
          return t("common.passphraseRequired")
        } else if (result.strength < 50) {
          return t("routes.create.passphraseTooWeak")
        }
        return null
      },
      backupType: (value) => {
        if (!value || value === "") {
          return t("routes.create.backupTypeRequired")
        }
        return null
      },
      label: (value) => {
        if (value.length > maxLabelLength) {
          return t("routes.create.labelTooLong")
        }
        return null
      },
      secret2: (value, values) => {
        if (step === "secret2") {
          const dataLengths = getDataLengths(values)
          if (!value || value === "") {
            return t("routes.create.secretRequired")
          } else if (dataLengths.maxRemainingHiddenDataLength < 0) {
            return t("routes.create.secretTooLong")
          }
        }
        return null
      },
      passphrase2: (value, values) => {
        if (step === "secret2") {
          const result = zxcvbn(value)
          if (!value || value === "") {
            return t("common.passphraseRequired")
          } else if (result.strength < 50) {
            return t("routes.create.passphraseTooWeak")
          }
          for (const [entryKey, entryValue] of Object.entries(values)) {
            if (entryKey.match(/^passphrase(1|3)$/) && entryValue === value) {
              return t("routes.create.passphraseUsed")
            } else if (
              entryKey.match(/^passphrase(1|3)$/) &&
              leven(entryValue, value) < entryValue.length / 2
            ) {
              return t("routes.create.passphraseTooSimilar")
            }
          }
        }
        return null
      },
      secret3: (value, values) => {
        if (step === "secret3") {
          const dataLengths = getDataLengths(values)
          if (!value || value === "") {
            return t("routes.create.secretRequired")
          } else if (dataLengths.maxRemainingHiddenDataLength < 0) {
            return t("routes.create.secretTooLong")
          }
        }
        return null
      },
      passphrase3: (value, values) => {
        if (step === "secret3") {
          const result = zxcvbn(value)
          if (!value || value === "") {
            return t("common.passphraseRequired")
          } else if (result.strength < 50) {
            return t("routes.create.passphraseTooWeak")
          }
          for (const [entryKey, entryValue] of Object.entries(values)) {
            if (entryKey.match(/^passphrase(1|2)$/) && entryValue === value) {
              return t("routes.create.passphraseUsed")
            } else if (
              entryKey.match(/^passphrase(1|2)$/) &&
              leven(entryValue, value) < entryValue.length / 2
            ) {
              return t("routes.create.passphraseTooSimilar")
            }
          }
        }
        return null
      },
    },
  })
  const handleCreate = useCallback(async () => {
    const validation = form.validate()
    if (validation.hasErrors === false) {
      setCreating(true)
      // Define defaults
      let shamir = false,
        number = 3,
        threshold = 2
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
      let result: Result
      if (shamir === true) {
        result = await window.api.create(
          secrets,
          maxDataLength,
          label,
          true,
          number,
          threshold
        )
      } else {
        result = await window.api.create(secrets, maxDataLength, label)
      }
      if (result.success === false) {
        setError(
          showHiddenSecrets === true
            ? "routes.create.couldNotEncryptSecrets"
            : "routes.create.couldNotEncryptSecret"
        )
        setShowError(true)
        setCreating(false)
        setStep("secret1")
      } else {
        form.reset()
        setQrs(result.qrs)
        setCreating(false)
        setStep("preview")
      }
    }
  }, [form, showHiddenSecrets])
  const handlePrint = useCallback(
    async (printerName: string) => {
      setShowPrinting(true)
      for (const qr of qrs) {
        await window.api.print(printerName, qr.pdf, qr.copies)
      }
      let done = false
      while (done !== true) {
        const status = await window.api.getPrinterStatus(printerName)
        if (status === "standby") {
          setShowPrinting(false)
          done = true
        }
      }
    },
    [qrs]
  )
  useEffect(() => {
    if (Object.keys(form.errors).length > 0) {
      form.validate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language])
  useEffect(() => {
    const removeListener = window.api.menuInsert(async (type) => {
      if (type === "mnemonic") {
        const mnemonic = window.api.generateMnemonic()
        insertAtCursor(mnemonic)
      } else if (type === "passphrase") {
        const passphrase = await window.api.generatePassphrase()
        insertAtCursor(passphrase)
      } else if (type === "scanQrCode") {
        setSelection(captureSelection())
        setShowScanner(true)
      }
    })
    return () => {
      removeListener()
      // Disable insert mode before component is unmounted
      window.api.disableModes(["insert"])
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
  if (["secret1", "secret2", "secret3", "preview"].includes(step) === false) {
    // This should never happen, but tracking edge case
    throw new Error("Invalid step")
  }
  const stepMatch = step.match(/^secret([1-3])$/)
  if (stepMatch?.[1]) {
    // Show form
    const dataLengths = getDataLengths(form.values)
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
            label={t("routes.create.secret")}
            maxRows={5}
            minRows={2}
            placeholder={t("routes.create.typeSecret")}
            required
            secretNumber={1}
            spellCheck={false}
            onFocus={() => {
              window.api.enableModes(["insert"])
            }}
            onBlur={() => {
              window.api.disableModes(["insert"])
            }}
            {...form.getInputProps("secret1", { withFocus: false })}
          />
          <Space h="lg" />
          <PassphraseInputWithStrength
            key="passphrase1"
            disabled={creating}
            label={t("common.passphrase")}
            placeholder={t("common.typePassphrase")}
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
              comboboxProps={{ keepMounted: false }}
              disabled={creating}
              label={t("routes.create.backupType")}
              placeholder={t("routes.create.selectBackupType")}
              required
              data={[
                {
                  value: "standard",
                  label: t("routes.create.standard"),
                },
                { value: "2of3", label: t("routes.create.2of3") },
                { value: "3of5", label: t("routes.create.3of5") },
                { value: "4of7", label: t("routes.create.4of7") },
              ]}
              {...form.getInputProps("backupType", { withFocus: false })}
            />
            <TextInput
              disabled={creating}
              label={t("routes.create.label")}
              placeholder={t("routes.create.typeLabel")}
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
            label={t("routes.create.secret")}
            maxRows={4}
            minRows={2}
            placeholder={t("routes.create.typeSecret")}
            required
            secretNumber={secretNumber}
            spellCheck={false}
            onFocus={() => {
              window.api.enableModes(["insert"])
            }}
            onBlur={() => {
              window.api.disableModes(["insert"])
            }}
            {...form.getInputProps(`secret${secretNumber}`, {
              withFocus: false,
            })}
          />
          <Space h="lg" />
          <PassphraseInputWithStrength
            key={`passphrase${secretNumber}`}
            disabled={creating}
            label={t("common.passphrase")}
            placeholder={t("common.typePassphrase")}
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
            {t("routes.create.addSecret")}
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
            sx={{
              "&:disabled": {
                backgroundColor: "transparent",
              },
              "&:hover": {
                backgroundColor: "transparent",
              },
            }}
          >
            {t("routes.create.removeSecret")}
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
              {creating === true
                ? t("routes.create.creating")
                : t("routes.create.create")}
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
            padding={0}
            size="md"
            withCloseButton={false}
          >
            <ModalContainer>
              <Scanner
                ref={scannerRef}
                handleCode={(code) => {
                  if (selection) {
                    restoreSelection(selection)
                    insertAtCursor(code)
                  }
                  setShowScanner(false)
                }}
              />
            </ModalContainer>
          </Modal>
        </Container>
        <ErrorModal
          error={error}
          opened={showError}
          onClose={() => setShowError(false)}
        />
      </Fragment>
    )
  } else {
    // Show preview
    const blocks: ReactNode[] = []
    for (const qr of qrs) {
      blocks.push(
        <BlockContainer key={qr.shortHash}>
          <Block src={`data:image/jpeg;base64,${qr.jpg}`} />
          {props.importMode !== true ? (
            <Select
              allowDeselect={false}
              comboboxProps={{ keepMounted: false }}
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
              leftSection={<PrinterIcon size={14} />}
              size="xs"
              sx={{
                position: "absolute",
                bottom: "5px",
                left: "45px",
                maxWidth: "70px",
              }}
              onChange={(value) => {
                const updatedQr = {
                  ...qr,
                  copies: parseInt(value ?? "1"),
                }
                const updatedQrs = qrs.map((mappedQr) =>
                  mappedQr.hash === qr.hash ? updatedQr : mappedQr
                )
                setQrs(updatedQrs)
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
                    const defaultPrinter = await window.api.getDefaultPrinter()
                    if (printers.length === 0) {
                      setError("routes.create.pleaseConnectPrinter")
                      setShowError(true)
                    } else if (!defaultPrinter) {
                      const data: ComboboxItem[] = []
                      for (const printer of printers) {
                        data.push({
                          label: printer.displayName,
                          value: printer.name,
                        })
                      }
                      setPrinterData(data)
                      setShowSelectPrinter(true)
                    } else {
                      void handlePrint(defaultPrinter.name)
                    }
                  }}
                >
                  {t("routes.create.print")}
                </Button>
              ) : null}
              <Button
                variant="default"
                onClick={() => {
                  void window.api.save(qrs, ["jpg", "pdf"])
                }}
              >
                {t("routes.create.save")}
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  if (props.importMode === true || props.exportMode === true) {
                    void navigate("/")
                  } else {
                    setStep("secret1")
                    setQrs([])
                  }
                }}
              >
                {t("common.done")}
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
          title={t("routes.create.pleaseSelectPrinter")}
          styles={{
            title: {
              fontWeight: "bold",
            },
          }}
        >
          <Select
            comboboxProps={{ keepMounted: false }}
            data={printerData}
            disabled={printerData.length === 0}
            leftSection={<PrinterIcon size={16} />}
            label={t("routes.create.printer")}
            maxDropdownHeight={240}
            placeholder={`${t("routes.create.selectPrinter")}…`}
            onChange={(value) => {
              if (value) {
                setShowSelectPrinter(false)
                void handlePrint(value)
              }
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
          {t("routes.create.printing")}…
        </Dialog>
        <ErrorModal
          error={error}
          opened={showError}
          onClose={() => setShowError(false)}
        />
      </Fragment>
    )
  }
}

export default Create
