import styled from "@emotion/styled"
import {
  Box,
  Button,
  ComboboxItem,
  Group,
  Modal,
  NumberInput,
  Popover,
  ScrollArea,
  Select,
  Space,
  Switch,
  Text,
  TextInput,
  rgba,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { notifications } from "@mantine/notifications"
import { IconPrinter } from "@tabler/icons-react"
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

import { Qr, Result, Secret } from "@/src/handlers/create"
import ActionBadge from "@/src/main/components/ActionBadge"
import CreateDisclaimerModal from "@/src/main/components/CreateDisclaimerModal"
import ErrorModal, { ErrorState } from "@/src/main/components/ErrorModal"
import InfoButton from "@/src/main/components/FeatureDescriptionModal"
import FileList from "@/src/main/components/FileList"
import FileManager, {
  FileManagerRef,
  FileWithAbsolutePath,
} from "@/src/main/components/FileManager"
import HiddenSecretDisclaimerModal from "@/src/main/components/HiddenSecretDisclaimerModal"
import PassphraseInputWithStrength from "@/src/main/components/PassphraseInputWithStrength"
import Scanner, { ScannerRef } from "@/src/main/components/Scanner"
import SecretTextareaWithLength from "@/src/main/components/SecretTextareaWithLength"
import { showNotificationWithButton } from "@/src/main/utilities/notificationWithButton"
import {
  SelectionWithElement,
  captureSelection,
  insertAtCursor,
  restoreSelection,
} from "@/src/main/utilities/selection"
import { PaperSize, PrintSetting } from "@/src/shared/types/print"
import zxcvbn from "@/src/shared/utilities/zxcvbn"

const blocksetBackupTypes = [
  { value: "2of3", threshold: 2, shares: 3 },
  { value: "3of5", threshold: 3, shares: 5 },
  { value: "4of7", threshold: 4, shares: 7 },
] as const
const secretNumbers = [1, 2, 3] as const
const maxDataLength = 512
const maxLabelLength = 64

const paperSizeOptions = [
  { value: "letter", label: "paperLetter" },
  { value: "statement", label: "paperStatement" },
] as const satisfies readonly {
  value: PaperSize
  label: string
}[]

// True width between horizontal trim marks (4 inch block) in millimeters,
// used to compute the scale from a measured width.
const trimMarkWidthMm = 101.6

// Built-in default custom scales for known printers at statement size (their
// drivers shrink 5.5 × 8.5 media by a printer-specific amount). Any printer not
// listed defaults to 1.
const defaultStatementScale: Record<string, number> = {
  Brother_HL_L2460DW: 1.04205,
  Brother_HL_L2370DW_series: 1.08085,
}

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

type SecretNumber = (typeof secretNumbers)[number]

type BackupType =
  "" | "standard" | (typeof blocksetBackupTypes)[number]["value"]

type ValidBackupType = Exclude<BackupType, "">

type SecretState = {
  secret: string
  detachedArchive: {
    files: FileWithAbsolutePath[]
    masterKey: string
    encryptionKey: string
    hmacKey: string
    filename: string
    blockContent: string
  } | null
}

type SecretsState = Record<SecretNumber, SecretState>

export interface DataLengths {
  totalDataLength: number
  secret1DataLength: number
  maxHiddenSecretsDataLength: number
  maxRemainingHiddenDataLength: number
}

type Step = "backupType" | "secret1" | "secret2" | "secret3" | "preview"

type CreateProps = {
  exportMode?: boolean
  qrs?: Qr[]
}

const Create: FunctionComponent<CreateProps> = (props) => {
  let initialStep: Step,
    initialQrs: Qr[] = []
  if (props.exportMode === true && props.qrs) {
    initialQrs = props.qrs
    initialStep = "preview"
  } else {
    initialStep = "backupType"
  }

  const navigate = useNavigate()

  const { i18n, t } = useTranslation()

  const fileManagerRef = useRef<FileManagerRef>(null)
  const scannerRef = useRef<ScannerRef>(null)

  const [detachedArchivePopoverOpened, detachedArchivePopoverHandlers] =
    useDisclosure(false)

  const {
    close: closeDetachedArchivePopover,
    toggle: toggleDetachedArchivePopover,
  } = detachedArchivePopoverHandlers

  const [secrets, setSecrets] = useState<SecretsState>({
    1: {
      secret: "",
      detachedArchive: null,
    },
    2: {
      secret: "",
      detachedArchive: null,
    },
    3: {
      secret: "",
      detachedArchive: null,
    },
  })
  const [step, setStep] = useState<Step>(initialStep)
  const [selection, setSelection] = useState<null | SelectionWithElement>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [showHiddenSecretDisclaimer, setShowHiddenSecretDisclaimer] =
    useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [printerData, setPrinterData] = useState<ComboboxItem[]>([])
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null)
  const [supportedPaperSizes, setSupportedPaperSizes] = useState<PaperSize[]>(
    []
  )
  const [paperSize, setPaperSize] = useState<PaperSize | null>(null)
  const [heavyweight, setHeavyweight] = useState(false)
  // The driver shrinks media on macOS but not on Linux, so default the custom
  // scale on for macOS only (still a manual toggle).
  const [customScale, setCustomScale] = useState(
    window.api.platform === "darwin"
  )
  // Allow the field to be empty (string) while editing; coerced to a number
  // on blur and when printing.
  const [scale, setScale] = useState<number | string>(1)
  // Secondary modal mode that guides the user through a scale-1 calibration
  // print, then computes the scale from a measured width.
  const [determineScaleMode, setDetermineScaleMode] = useState(false)
  const [determineScaleStep, setDetermineScaleStep] = useState<
    "print" | "measure"
  >("print")
  const [measuredWidth, setMeasuredWidth] = useState<number | string>("")
  const selectedPaperOption = paperSizeOptions.find(
    (option) => option.value === paperSize
  )
  const selectedPrinterLabel =
    printerData.find((item) => item.value === selectedPrinter)?.label ??
    selectedPrinter ??
    ""
  const [isPrinting, setIsPrinting] = useState(false)
  const [error, setError] = useState<null | ErrorState<
    | "routes.create.couldNotCreateDetachedArchive"
    | "routes.create.couldNotCreateBlock"
    | "routes.create.couldNotCreateBlockset"
    | "routes.create.pleaseConnectPrinter"
    | "routes.create.printerDoesNotSupportPaperSize"
  >>(null)
  const [qrs, setQrs] = useState<Qr[]>(initialQrs)
  // The following refs are a temporary patch to help users avoid unintended button clicks (should be fixed using proper UI)
  const openedPopoversRef = useRef(0)
  const blockedClicksRef = useRef(0)
  type FormValues = {
    secret1: string
    passphrase1: string
    secret2: string
    passphrase2: string
    secret3: string
    passphrase3: string
    backupType: BackupType
    label: string
  }
  const handlePopoverChange = useCallback((opened: boolean) => {
    blockedClicksRef.current = 0
    if (opened) {
      openedPopoversRef.current++
    } else {
      openedPopoversRef.current = Math.max(0, openedPopoversRef.current - 1)
    }
  }, [])
  const shouldIgnoreClick = useCallback(() => {
    if (openedPopoversRef.current > 0) {
      blockedClicksRef.current++
      if (blockedClicksRef.current >= 2) {
        // Reset counter after two blocked clicks as a failsafe if event handlers are inconsistent
        openedPopoversRef.current = 0
        blockedClicksRef.current = 0
        return false
      }
      return true
    }
    blockedClicksRef.current = 0
    return false
  }, [])
  const getDataLengths = useCallback(
    (backupType: BackupType, secretsData: SecretsState): DataLengths => {
      let secret1DataLength = window.api.invokeSync.getDataLength(
        secretsData[1].detachedArchive?.blockContent ?? secretsData[1].secret
      )
      // Account for Shamir Secret Sharing overhead (if applicable)
      if (blocksetBackupTypes.some((type) => type.value === backupType)) {
        secret1DataLength += 56
      }
      const totalDataLength = maxDataLength
      let concatenatedHiddenSecretsLength = 0
      for (const secretNumber of [2, 3] as const) {
        const hiddenSecret =
          secretsData[secretNumber].detachedArchive?.blockContent ??
          secretsData[secretNumber].secret
        if (hiddenSecret !== "") {
          let hiddenSecretLength =
            window.api.invokeSync.getDataLength(hiddenSecret)
          // Account for Shamir Secret Sharing overhead (if applicable)
          if (blocksetBackupTypes.some((type) => type.value === backupType)) {
            hiddenSecretLength += 56
          }
          concatenatedHiddenSecretsLength += hiddenSecretLength
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
    },
    []
  )
  const updateSecretsState = useCallback(
    (
      values: FormValues,
      fileUpdates?: Partial<Record<SecretNumber, FileWithAbsolutePath[]>>
    ) => {
      setSecrets((prevSecrets) => {
        const newSecrets: SecretsState = { ...prevSecrets }

        for (const secretNumber of secretNumbers) {
          const currentSecret = prevSecrets[secretNumber]
          const formSecret = values[`secret${secretNumber}`]
          const files =
            fileUpdates?.[secretNumber] ??
            currentSecret.detachedArchive?.files ??
            []

          // Generate or clear detached archive based on files
          let detachedArchive: SecretState["detachedArchive"] = null

          if (files.length > 0) {
            // Generate master key if needed
            const masterKey =
              currentSecret.detachedArchive?.masterKey ??
              window.api.invokeSync.generateMasterKey()

            // Derive encryption key, HMAC key and filename from master key
            const encryptionKey = window.api.invokeSync.deriveKey(
              masterKey,
              "encryption-key-v1"
            )
            const hmacKey = window.api.invokeSync.deriveKey(
              masterKey,
              "hmac-v1"
            )
            const filename = window.api.invokeSync.deriveKey(
              masterKey,
              "filename-v1",
              16,
              "hex"
            )

            // Build block content with secret and master key
            const blockContent = JSON.stringify(
              {
                secret: formSecret,
                masterKey: masterKey,
              },
              null,
              2
            )

            detachedArchive = {
              files,
              masterKey,
              encryptionKey,
              hmacKey,
              filename,
              blockContent,
            }
          }

          newSecrets[secretNumber] = {
            secret: formSecret,
            detachedArchive,
          }
        }

        return newSecrets
      })
    },
    []
  )
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
    onValuesChange: (values, previous) => {
      if (
        values.secret1 !== previous.secret1 ||
        values.secret2 !== previous.secret2 ||
        values.secret3 !== previous.secret3
      ) {
        updateSecretsState(values)
      }
    },
    validate: {
      secret1: (value, values) => {
        const dataLengths = getDataLengths(values.backupType, secrets)
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
          return t("common.passphraseTooWeak")
        }
        return null
      },
      backupType: (value) => {
        if (!value) {
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
          const dataLengths = getDataLengths(values.backupType, secrets)
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
            return t("common.passphraseTooWeak")
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
          const dataLengths = getDataLengths(values.backupType, secrets)
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
            return t("common.passphraseTooWeak")
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
  const resetForm = useCallback(() => {
    form.reset()
    updateSecretsState(form.values, { 1: [], 2: [], 3: [] })
  }, [form, updateSecretsState])
  const handleCreate = useCallback(
    async (skipDisclaimerCheck = false) => {
      const validation = form.validate()
      if (validation.hasErrors === false) {
        if (!skipDisclaimerCheck) {
          setShowDisclaimer(true)
          return
        }
        setIsCreating(true)
        // Define defaults
        let isBlockset = false,
          number = 3,
          threshold = 2
        const secretsList: Secret[] = []
        for (const secretNumber of secretNumbers) {
          const secret =
            form.values[`secret${secretNumber}` as keyof typeof form.values]
          const passphrase =
            form.values[`passphrase${secretNumber}` as keyof typeof form.values]
          if (secret && secret !== "" && passphrase && passphrase !== "") {
            const message =
              secrets[secretNumber].detachedArchive?.blockContent ??
              secrets[secretNumber].secret
            secretsList.push({
              message: message,
              passphrase: passphrase,
            })
          }
        }
        const label = form.values.label
        const blocksetBackup = blocksetBackupTypes.find(
          (type) => type.value === form.values.backupType
        )
        if (blocksetBackup) {
          isBlockset = true
          number = blocksetBackup.shares
          threshold = blocksetBackup.threshold
        }
        // Create detached archives if applicable
        const detachedArchives = secretNumbers.filter(
          (secretNumber) => secrets[secretNumber].detachedArchive !== null
        )
        if (detachedArchives.length > 0) {
          // Prompt for output directory once
          const saveDialogReturnValue = await window.api.invoke.chooseDirectory(
            t(
              "handlers.createDetachedArchive.chooseWhereToCreateDetachedArchive",
              {
                count: detachedArchives.length,
              }
            )
          )
          if (saveDialogReturnValue.canceled) {
            // User cancelled, stop
            setIsCreating(false)
            return
          }
          if (saveDialogReturnValue.filePath) {
            const outputDir = saveDialogReturnValue.filePath
            // Create archives
            for (const secretNumber of detachedArchives) {
              const detachedArchive = secrets[secretNumber].detachedArchive
              if (!detachedArchive) continue

              const filePaths = detachedArchive.files.map(
                (file) => file.absolutePath
              )
              const archivePath = `${outputDir}/${detachedArchive.filename}.superbacked`
              const result = await window.api.invoke.createDetachedArchive(
                filePaths,
                archivePath,
                detachedArchive.encryptionKey,
                detachedArchive.hmacKey,
                detachedArchive.blockContent
              )
              if (result.success === false) {
                setError({
                  message: "routes.create.couldNotCreateDetachedArchive",
                  count: detachedArchives.length,
                })
                setIsCreating(false)
                return
              }
            }
            showNotificationWithButton({
              message: t("routes.create.detachedArchiveCreated", {
                count: detachedArchives.length,
              }),
              buttonLabel: t("common.show"),
              buttonOnClick: () => {
                void window.api.invoke.openPath(outputDir)
              },
            })
          }
        }
        // Create blocks
        let result: Result
        if (isBlockset === true) {
          result = await window.api.invoke.create(
            secretsList,
            maxDataLength,
            label,
            true,
            number,
            threshold
          )
        } else {
          result = await window.api.invoke.create(
            secretsList,
            maxDataLength,
            label
          )
        }
        if (result.success === false) {
          setError({
            message: isBlockset
              ? "routes.create.couldNotCreateBlockset"
              : "routes.create.couldNotCreateBlock",
          })
          setIsCreating(false)
          setStep("secret1")
          return
        }
        resetForm()
        setQrs(result.qrs)
        setIsCreating(false)
        setStep("preview")
      }
    },
    [form, secrets, t, resetForm]
  )
  // Apply persisted print settings, falling back to platform defaults and the
  // built-in per-printer default scale for statement size.
  const applyPrintSettings = useCallback(
    (printerName: string, selectedPaperSize: PaperSize) => {
      const printSettings = window.api.invokeSync.getConfig("printSettings")
      const setting = printSettings?.[printerName]?.[selectedPaperSize]
      const defaultScale =
        selectedPaperSize === "statement"
          ? (defaultStatementScale[printerName] ?? 1)
          : 1
      setHeavyweight(setting?.heavyweight ?? false)
      setCustomScale(setting?.customScale ?? window.api.platform === "darwin")
      setScale(setting?.scale ?? defaultScale)
    },
    []
  )
  const selectPrinter = useCallback(
    async (printerName: string) => {
      setSelectedPrinter(printerName)
      let sizes: PaperSize[]
      try {
        sizes = await window.api.invoke.getSupportedPaperSizes(printerName)
      } catch {
        // Fall back to all sizes; print() validates support as a safety net
        sizes = paperSizeOptions.map((option) => option.value)
      }
      setSupportedPaperSizes(sizes)
      // Keep the current selection if the new printer supports it (avoids the
      // Print button flickering disabled during the async round-trip), then
      // fall back to the paper size last used with this printer.
      const savedPaperSize =
        window.api.invokeSync.getConfig("paperSizes")?.[printerName]
      const nextSize =
        paperSize && sizes.includes(paperSize)
          ? paperSize
          : savedPaperSize && sizes.includes(savedPaperSize)
            ? savedPaperSize
            : (sizes[0] ?? null)
      setPaperSize(nextSize)
      if (nextSize) {
        applyPrintSettings(printerName, nextSize)
      }
    },
    [paperSize, applyPrintSettings]
  )
  // Persist the printer (so an auto-selected default also becomes the
  // preferred printer), its paper size and its settings for that size.
  const savePrintSettings = useCallback(
    (
      printerName: string,
      selectedPaperSize: PaperSize,
      setting: PrintSetting
    ) => {
      window.api.invokeSync.setConfig("printer", printerName)
      const paperSizes = window.api.invokeSync.getConfig("paperSizes") ?? {}
      window.api.invokeSync.setConfig("paperSizes", {
        ...paperSizes,
        [printerName]: selectedPaperSize,
      })
      const printSettings =
        window.api.invokeSync.getConfig("printSettings") ?? {}
      window.api.invokeSync.setConfig("printSettings", {
        ...printSettings,
        [printerName]: {
          ...printSettings[printerName],
          [selectedPaperSize]: setting,
        },
      })
    },
    []
  )
  const handlePrint = useCallback(
    async (printerName: string, selectedPaperSize: PaperSize) => {
      setIsPrinting(true)
      notifications.show({
        message:
          qrs.length > 1
            ? t("routes.create.printingBlockset")
            : t("routes.create.printingBlock"),
      })
      const numericScale = typeof scale === "number" ? scale : 1
      savePrintSettings(printerName, selectedPaperSize, {
        heavyweight,
        customScale,
        scale: numericScale,
      })
      try {
        const mediaSize =
          selectedPaperSize === "statement"
            ? { width: 5.5, height: 8.5 }
            : { width: 8.5, height: 11 }
        const printScale = customScale ? numericScale : 1
        for (const qr of qrs) {
          // Print PDF (block + trim marks) is rendered on demand, only when
          // the user actually prints.
          const pdf = await window.api.invoke.renderCarrierPdf(
            qr.payload,
            qr.label,
            mediaSize,
            printScale
          )
          await window.api.invoke.print(
            printerName,
            pdf,
            qr.copies,
            selectedPaperSize,
            heavyweight
          )
        }
        let done = false
        while (done !== true) {
          const status = await window.api.invoke.getPrinterStatus(printerName)
          if (status === "standby") {
            setIsPrinting(false)
            done = true
          }
        }
      } catch {
        setIsPrinting(false)
        setError({ message: "routes.create.printerDoesNotSupportPaperSize" })
      }
    },
    [qrs, t, customScale, scale, heavyweight, savePrintSettings]
  )
  // Calibration print: a single block at scale 1 on regular (non-heavyweight)
  // paper, so the user can measure it and determine the scale.
  const printCalibration = useCallback(
    async (printerName: string, selectedPaperSize: PaperSize) => {
      const qr = qrs[0]
      if (!qr) {
        return
      }
      setIsPrinting(true)
      notifications.show({ message: t("routes.create.printingBlock") })
      try {
        const mediaSize =
          selectedPaperSize === "statement"
            ? { width: 5.5, height: 8.5 }
            : { width: 8.5, height: 11 }
        const pdf = await window.api.invoke.renderCarrierPdf(
          qr.payload,
          qr.label,
          mediaSize,
          1
        )
        await window.api.invoke.print(printerName, pdf, 1, selectedPaperSize)
        let done = false
        while (done !== true) {
          const status = await window.api.invoke.getPrinterStatus(printerName)
          if (status === "standby") {
            setIsPrinting(false)
            done = true
          }
        }
        setDetermineScaleStep("measure")
      } catch {
        setIsPrinting(false)
        setError({ message: "routes.create.printerDoesNotSupportPaperSize" })
      }
    },
    [qrs, t]
  )
  useEffect(() => {
    if (Object.keys(form.errors).length > 0) {
      form.validate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language])
  useEffect(() => {
    const removeListener = window.api.events.menuInsert(async (type) => {
      if (type === "mnemonic") {
        const mnemonic = window.api.invokeSync.generateMnemonic()
        insertAtCursor(mnemonic)
      } else if (type === "passphrase") {
        const passphrase = await window.api.invoke.generatePassphrase()
        insertAtCursor(passphrase)
      } else if (type === "scanQrCode") {
        setSelection(captureSelection())
        setShowScanner(true)
      }
    })
    return () => {
      removeListener()
      // Disable insert mode before component is unmounted
      void window.api.invoke.disableModes(["insert"])
    }
  }, [])
  if (
    ["backupType", "secret1", "secret2", "secret3", "preview"].includes(
      step
    ) === false
  ) {
    throw new Error("Invalid step")
  }
  if (step === "backupType") {
    return (
      <Container>
        <Box px="xl">
          <FileManager
            ref={fileManagerRef}
            mode="standalone"
            handleFiles={(handledFiles) => {
              updateSecretsState(form.values, { 1: handledFiles })
              if (handledFiles.length === 0) {
                handlePopoverChange(false)
              }
            }}
          />
          <Space h="xl" />
          <Select
            comboboxProps={{ keepMounted: false }}
            label={t("routes.create.backupType")}
            placeholder={t("routes.create.selectBackupType")}
            required
            data={[
              {
                value: "standard",
                label: t("routes.create.standard"),
              },
              ...blocksetBackupTypes.map((type) => ({
                value: type.value,
                label: t(`routes.create.${type.value}`),
              })),
            ]}
            {...form.getInputProps("backupType")}
          />
          {form.values.backupType ? (
            <Text c="dimmed" size="sm" mt="xs">
              {t(`routes.create.${form.values.backupType}Description`)}
            </Text>
          ) : null}
          <Space h="xl" />
          <Button
            disabled={!form.values.backupType}
            fullWidth
            size="md"
            variant="signatureGradient"
            onClick={() => {
              if (form.values.backupType) {
                setStep("secret1")
              }
            }}
          >
            {t("common.next")}
          </Button>
          <ActionBadge>
            {t(
              "routes.create.dragAndDropFileToCreateOrRestoreStandaloneArchive"
            )}{" "}
            <InfoButton tabIndex={-1}>
              {t(
                "components.featureDescriptionModal.standaloneArchiveDescription"
              )}
            </InfoButton>
          </ActionBadge>
        </Box>
      </Container>
    )
  }
  const stepMatch = step.match(/^secret([1-3])$/)
  if (stepMatch?.[1]) {
    // Show form
    const dataLengths = getDataLengths(form.values.backupType, secrets)
    const secretNumber: SecretNumber = parseInt(stepMatch[1]) as SecretNumber
    let stepFields: ReactNode
    let addHiddenSecret: ReactNode
    let removeHiddenSecret: ReactNode
    if (secretNumber === 1) {
      stepFields = (
        <Fragment>
          <SecretTextareaWithLength
            key="secret1"
            autosize
            dataLengths={dataLengths}
            disabled={isCreating}
            label={t("routes.create.secret")}
            maxRows={5}
            minRows={2}
            placeholder={t("routes.create.typeSecret")}
            required
            onFocus={() => {
              void window.api.invoke.enableModes(["insert"])
            }}
            onBlur={() => {
              void window.api.invoke.disableModes(["insert"])
            }}
            onPopoverChange={handlePopoverChange}
            {...form.getInputProps("secret1", { withFocus: false })}
          />
          {secrets[1].detachedArchive !== null ? (
            <Fragment>
              <Space h="xs" />
              <Group align="center" gap="xs">
                <Text size="xs">{t("routes.create.detachedArchive")}</Text>
                <Popover
                  onOpen={() => {
                    handlePopoverChange(true)
                  }}
                  onChange={(opened) => {
                    if (!opened) {
                      closeDetachedArchivePopover()
                    }
                  }}
                  onExitTransitionEnd={() => {
                    handlePopoverChange(false)
                  }}
                  opened={detachedArchivePopoverOpened}
                  width={"440px"}
                  withArrow
                >
                  <Popover.Target>
                    <Button
                      color="dark"
                      onClick={toggleDetachedArchivePopover}
                      size="xs"
                      variant="filled"
                    >
                      <Text fw="bold" size="xs" variant="signatureGradient">
                        {secrets[1].detachedArchive?.filename}.superbacked
                      </Text>
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <ScrollArea.Autosize
                      mah={150}
                      scrollHideDelay={0}
                      type="scroll"
                    >
                      <FileList
                        files={secrets[1].detachedArchive?.files ?? []}
                        onRemoveFile={(file) => {
                          fileManagerRef.current?.removeFile(file)
                        }}
                      />
                    </ScrollArea.Autosize>
                  </Popover.Dropdown>
                </Popover>
              </Group>
            </Fragment>
          ) : null}
          <Space h="lg" />
          <PassphraseInputWithStrength
            key="passphrase1"
            disabled={isCreating}
            label={t("common.passphrase")}
            placeholder={t("common.typePassphrase")}
            required
            generatePassphrase={async () => {
              const passphrase = await window.api.invoke.generatePassphrase(
                5,
                "eff_short_wordlist_1"
              )
              form.setFieldValue("passphrase1", passphrase)
              return passphrase
            }}
            onPopoverChange={handlePopoverChange}
            {...form.getInputProps("passphrase1", { withFocus: false })}
          />
          <Space h="lg" />
          <TextInput
            disabled={isCreating}
            label={t("routes.create.label")}
            placeholder={t("routes.create.typeLabel")}
            {...form.getInputProps("label", { withFocus: false })}
          />
          <ActionBadge>
            {secrets[1].detachedArchive !== null
              ? t("routes.create.dragAndDropFilesToAddToDetachedArchive")
              : t(
                  "routes.create.dragAndDropFileToProvisionDetachedArchive"
                )}{" "}
            <InfoButton tabIndex={-1}>
              {t(
                "components.featureDescriptionModal.detachedArchiveDescription"
              )}
            </InfoButton>
          </ActionBadge>
        </Fragment>
      )
    } else if (secretNumber > 1) {
      stepFields = (
        <Fragment>
          <SecretTextareaWithLength
            key={`secret${secretNumber}`}
            autosize
            dataLengths={dataLengths}
            disabled={isCreating}
            label={t("routes.create.secret")}
            maxRows={4}
            minRows={2}
            placeholder={t("routes.create.typeSecret")}
            required
            onFocus={() => {
              void window.api.invoke.enableModes(["insert"])
            }}
            onBlur={() => {
              void window.api.invoke.disableModes(["insert"])
            }}
            onPopoverChange={handlePopoverChange}
            {...form.getInputProps(`secret${secretNumber}`, {
              withFocus: false,
            })}
          />
          {secrets[secretNumber].detachedArchive !== null ? (
            <Fragment>
              <Space h="xs" />
              <Group align="center" gap="xs">
                <Text size="xs">{t("routes.create.detachedArchive")}</Text>
                <Popover
                  onOpen={() => {
                    handlePopoverChange(true)
                  }}
                  onChange={(opened) => {
                    if (!opened) {
                      closeDetachedArchivePopover()
                    }
                  }}
                  onExitTransitionEnd={() => {
                    handlePopoverChange(false)
                  }}
                  opened={detachedArchivePopoverOpened}
                  width={"440px"}
                  withArrow
                >
                  <Popover.Target>
                    <Button
                      color="dark"
                      onClick={toggleDetachedArchivePopover}
                      size="xs"
                      variant="signatureTextGradient"
                    >
                      {secrets[secretNumber].detachedArchive?.filename}
                      .superbacked
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <ScrollArea.Autosize
                      mah={150}
                      scrollHideDelay={0}
                      type="scroll"
                    >
                      <FileList
                        files={
                          secrets[secretNumber].detachedArchive?.files ?? []
                        }
                        onRemoveFile={(file) => {
                          fileManagerRef.current?.removeFile(file)
                        }}
                      />
                    </ScrollArea.Autosize>
                  </Popover.Dropdown>
                </Popover>
              </Group>
            </Fragment>
          ) : null}
          <Space h="lg" />
          <PassphraseInputWithStrength
            key={`passphrase${secretNumber}`}
            disabled={isCreating}
            label={t("common.passphrase")}
            placeholder={t("common.typePassphrase")}
            required
            generatePassphrase={async () => {
              const passphrase = await window.api.invoke.generatePassphrase(
                5,
                "eff_short_wordlist_1"
              )
              form.setFieldValue(`passphrase${secretNumber}`, passphrase)
              return passphrase
            }}
            onPopoverChange={handlePopoverChange}
            {...form.getInputProps(`passphrase${secretNumber}`, {
              withFocus: false,
            })}
          />
          <ActionBadge>
            {secrets[secretNumber].detachedArchive !== null
              ? t("routes.create.dragAndDropFilesToAddToDetachedArchive")
              : t(
                  "routes.create.dragAndDropFileToProvisionDetachedArchive"
                )}{" "}
            <InfoButton tabIndex={-1}>
              {t(
                "components.featureDescriptionModal.detachedArchiveDescription"
              )}
            </InfoButton>
          </ActionBadge>
        </Fragment>
      )
    }
    if ([1, 2].includes(secretNumber)) {
      const secretValue =
        form.values[`secret${secretNumber}` as keyof typeof form.values]
      const passphraseValue =
        form.values[`passphrase${secretNumber}` as keyof typeof form.values]
      addHiddenSecret = (
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
              isCreating
            }
            fullWidth
            size="sm"
            variant="signatureTextGradient"
            onClick={() => {
              if (shouldIgnoreClick()) return
              const validation = form.validate()
              if (validation.hasErrors === false) {
                if (secretNumber === 1) {
                  setShowHiddenSecretDisclaimer(true)
                } else {
                  setStep(`secret${secretNumber + 1}` as Step)
                }
              }
            }}
          >
            {t("routes.create.addHiddenSecret")}
          </Button>
        </Fragment>
      )
    }
    if ([2, 3].includes(secretNumber)) {
      removeHiddenSecret = (
        <Fragment>
          <Space h="lg" />
          <Button
            disabled={isCreating}
            fullWidth
            size="sm"
            variant="signatureTextGradient"
            onClick={() => {
              if (shouldIgnoreClick()) return
              form.setValues({
                [`secret${secretNumber}`]: "",
                [`passphrase${secretNumber}`]: "",
              })
              updateSecretsState(form.values, { [secretNumber]: [] })
              setStep(`secret${secretNumber - 1}` as Step)
            }}
          >
            {t("routes.create.removeHiddenSecret")}
          </Button>
        </Fragment>
      )
    }
    const detachedArchiveCount = secretNumbers.filter(
      (num) => secrets[num].detachedArchive !== null
    ).length
    const isBlockset = blocksetBackupTypes.some(
      (type) => type.value === form.values.backupType
    )
    let createButtonLabel: string
    if (detachedArchiveCount === 0) {
      createButtonLabel = isBlockset
        ? t("routes.create.createBlockset")
        : t("routes.create.createBlock")
    } else {
      createButtonLabel = isBlockset
        ? t("routes.create.createBlocksetAndDetachedArchive", {
            count: detachedArchiveCount,
          })
        : t("routes.create.createBlockAndDetachedArchive", {
            count: detachedArchiveCount,
          })
    }

    const backupType: ValidBackupType = form.values.backupType || "standard"

    return (
      <Fragment>
        <Container>
          <FileManager
            key={secretNumber}
            ref={fileManagerRef}
            mode="detached"
            handleFiles={(handledFiles) => {
              updateSecretsState(form.values, { [secretNumber]: handledFiles })
              if (handledFiles.length === 0) {
                handlePopoverChange(false)
              }
            }}
          />
          <form onSubmit={form.onSubmit(() => handleCreate())}>
            {stepFields}
            <Space h="lg" />
            <Button
              disabled={isCreating}
              fullWidth
              loading={isCreating}
              onClick={() => {
                if (shouldIgnoreClick()) return
                void handleCreate()
              }}
              size="md"
              variant="signatureGradient"
            >
              {createButtonLabel}
            </Button>
            {removeHiddenSecret}
            {addHiddenSecret}
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
        <CreateDisclaimerModal
          backupType={backupType}
          detachedArchiveCount={
            secretNumbers.filter((num) => secrets[num].detachedArchive !== null)
              .length
          }
          hiddenSecretCount={
            [2, 3].filter((num) => secrets[num as 2 | 3].secret !== "").length
          }
          opened={showDisclaimer}
          onClose={() => setShowDisclaimer(false)}
          onConfirm={() => {
            setShowDisclaimer(false)
            void handleCreate(true)
          }}
        />
        <HiddenSecretDisclaimerModal
          opened={showHiddenSecretDisclaimer}
          onClose={() => setShowHiddenSecretDisclaimer(false)}
          onConfirm={() => {
            setShowHiddenSecretDisclaimer(false)
            setStep("secret2" as Step)
          }}
        />
        <ErrorModal error={error} onClose={() => setError(null)} />
      </Fragment>
    )
  } else {
    // Show preview
    const blocks: ReactNode[] = []
    for (const qr of qrs) {
      blocks.push(
        <BlockContainer key={qr.shortHash}>
          <Block src={`data:image/jpeg;base64,${qr.jpg}`} />
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
            leftSection={<IconPrinter size={14} />}
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
              <Button
                disabled={isPrinting}
                loading={isPrinting}
                variant="default"
                onClick={async () => {
                  const printers = await window.api.invoke.getPrinters()
                  if (printers.length === 0) {
                    setError({
                      message: "routes.create.pleaseConnectPrinter",
                    })
                    return
                  }
                  setPrinterData(
                    printers.map((printer) => ({
                      label: printer.displayName,
                      value: printer.name,
                    }))
                  )
                  // Prefer the last selected printer (if still available),
                  // otherwise fall back to the system default.
                  const savedPrinter =
                    window.api.invokeSync.getConfig("printer")
                  const target =
                    printers.find((printer) => printer.name === savedPrinter)
                      ?.name ??
                    (await window.api.invoke.getDefaultPrinter())?.name ??
                    null
                  if (target) {
                    void selectPrinter(target)
                  } else {
                    setSelectedPrinter(null)
                    setSupportedPaperSizes([])
                    setPaperSize(null)
                  }
                  setDetermineScaleMode(false)
                  setShowPrintModal(true)
                }}
              >
                {t("routes.create.print")}…
              </Button>
              <Button
                variant="default"
                onClick={async () => {
                  const result = await window.api.invoke.save(qrs, [
                    "jpg",
                    "pdf",
                  ])
                  if (result.success && result.directoryPath) {
                    showNotificationWithButton({
                      message:
                        qrs.length > 1
                          ? t("routes.create.blocksetSaved")
                          : t("routes.create.blockSaved"),
                      buttonLabel: t("common.show"),
                      buttonOnClick: () => {
                        if (result.directoryPath) {
                          void window.api.invoke.openPath(result.directoryPath)
                        }
                      },
                    })
                  }
                }}
              >
                {t("routes.create.save")}…
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  if (props.exportMode === true) {
                    void navigate("/")
                  } else {
                    setStep("backupType")
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
            setShowPrintModal(false)
          }}
          opened={showPrintModal}
          title={
            determineScaleMode
              ? t("routes.create.determineScale")
              : t("routes.create.print")
          }
          styles={{
            title: {
              fontWeight: "bold",
            },
          }}
        >
          {determineScaleMode ? (
            determineScaleStep === "print" ? (
              <Fragment>
                <Text c="dimmed" size="sm">
                  {t("routes.create.determineScalePrint", {
                    paper: selectedPaperOption
                      ? t(`routes.create.${selectedPaperOption.label}`)
                      : "",
                    printer: selectedPrinterLabel,
                  })}
                </Text>
                <Space h="xl" />
                <Button
                  fullWidth
                  disabled={!selectedPrinter || !paperSize || isPrinting}
                  loading={isPrinting}
                  variant="signatureGradient"
                  onClick={() => {
                    if (selectedPrinter && paperSize) {
                      void printCalibration(selectedPrinter, paperSize)
                    }
                  }}
                >
                  {t("routes.create.print")}
                </Button>
                <Space h="md" />
                <Button
                  fullWidth
                  disabled={isPrinting}
                  size="sm"
                  variant="signatureTextGradient"
                  onClick={() => {
                    setDetermineScaleMode(false)
                  }}
                >
                  {t("common.back")}
                </Button>
              </Fragment>
            ) : (
              <Fragment>
                <Text c="dimmed" size="sm">
                  {t("routes.create.determineScaleMeasure")}
                </Text>
                <Space h="md" />
                <NumberInput
                  allowNegative={false}
                  data-autofocus
                  decimalScale={2}
                  hideControls
                  label={t("routes.create.width")}
                  min={0}
                  value={measuredWidth}
                  onChange={setMeasuredWidth}
                />
                <Space h="xl" />
                <Button
                  fullWidth
                  disabled={
                    typeof measuredWidth !== "number" || measuredWidth <= 0
                  }
                  variant="signatureGradient"
                  onClick={() => {
                    if (
                      typeof measuredWidth === "number" &&
                      measuredWidth > 0 &&
                      selectedPrinter &&
                      paperSize
                    ) {
                      // scale = true width ÷ measured width, rounded to the
                      // precision of the scale field.
                      const computedScale =
                        Math.round((trimMarkWidthMm / measuredWidth) * 1e5) /
                        1e5
                      setScale(computedScale)
                      savePrintSettings(selectedPrinter, paperSize, {
                        heavyweight,
                        customScale,
                        scale: computedScale,
                      })
                    }
                    setDetermineScaleMode(false)
                  }}
                >
                  {t("common.done")}
                </Button>
              </Fragment>
            )
          ) : (
            <Fragment>
              <Select
                comboboxProps={{ keepMounted: false }}
                allowDeselect={false}
                data={printerData}
                label={t("routes.create.printer")}
                maxDropdownHeight={240}
                placeholder={`${t("routes.create.selectPrinter")}…`}
                value={selectedPrinter}
                onChange={(value) => {
                  if (value) {
                    window.api.invokeSync.setConfig("printer", value)
                    void selectPrinter(value)
                  }
                }}
              />
              <Space h="md" />
              <Select
                comboboxProps={{ keepMounted: false }}
                allowDeselect={false}
                disabled={!selectedPrinter || supportedPaperSizes.length === 0}
                label={t("routes.create.paper")}
                placeholder={`${t("routes.create.selectPaper")}…`}
                data={paperSizeOptions
                  .filter((option) =>
                    supportedPaperSizes.includes(option.value)
                  )
                  .map((option) => ({
                    value: option.value,
                    label: t(`routes.create.${option.label}`),
                  }))}
                value={paperSize}
                onChange={(value) => {
                  if (value && selectedPrinter) {
                    setPaperSize(value as PaperSize)
                    applyPrintSettings(selectedPrinter, value as PaperSize)
                  }
                }}
              />
              <Space h="md" />
              <Switch
                checked={heavyweight}
                disabled={!selectedPrinter}
                label={t("routes.create.heavyweight")}
                withThumbIndicator={false}
                onChange={(event) =>
                  setHeavyweight(event.currentTarget.checked)
                }
              />
              <Space h="md" />
              <Switch
                checked={customScale}
                disabled={!selectedPrinter}
                label={t("routes.create.customScale")}
                withThumbIndicator={false}
                onChange={(event) =>
                  setCustomScale(event.currentTarget.checked)
                }
              />
              {customScale ? (
                <Fragment>
                  <Space h="md" />
                  <NumberInput
                    allowNegative={false}
                    decimalScale={5}
                    hideControls
                    label={t("routes.create.scale")}
                    min={0}
                    value={scale}
                    onChange={setScale}
                    onBlur={() => {
                      if (typeof scale !== "number") {
                        setScale(1)
                      }
                    }}
                  />
                  <Space h="xs" />
                  <Button
                    fullWidth
                    size="sm"
                    variant="signatureTextGradient"
                    onClick={() => {
                      setMeasuredWidth("")
                      setDetermineScaleStep("print")
                      setDetermineScaleMode(true)
                    }}
                  >
                    {t("routes.create.determineScale")}
                  </Button>
                </Fragment>
              ) : null}
              <Space h="xl" />
              <Button
                fullWidth
                disabled={!selectedPrinter || !paperSize}
                variant="signatureGradient"
                onClick={() => {
                  setShowPrintModal(false)
                  if (selectedPrinter && paperSize) {
                    void handlePrint(selectedPrinter, paperSize)
                  }
                }}
              >
                {t("routes.create.print")}
              </Button>
            </Fragment>
          )}
        </Modal>
        <ErrorModal error={error} onClose={() => setError(null)} />
      </Fragment>
    )
  }
}

export default Create
