import styled from "@emotion/styled"
import {
  Box,
  Button,
  Center,
  ComboboxItem,
  Group,
  Modal,
  NumberInput,
  Popover,
  ScrollArea,
  SegmentedControl,
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
import AddSecretDisclaimerModal from "@/src/main/components/AddSecretDisclaimerModal"
import CreateDisclaimerModal from "@/src/main/components/CreateDisclaimerModal"
import ErrorModal, { ErrorState } from "@/src/main/components/ErrorModal"
import InfoButton from "@/src/main/components/FeatureDescriptionModal"
import FileList from "@/src/main/components/FileList"
import FileManager, {
  FileManagerRef,
  FileWithAbsolutePath,
} from "@/src/main/components/FileManager"
import PassphraseInputWithStrength from "@/src/main/components/PassphraseInputWithStrength"
import Scanner, { ScannerRef } from "@/src/main/components/Scanner"
import SecretTextareaWithUsage from "@/src/main/components/SecretTextareaWithUsage"
import StyledYubiKeyIcon from "@/src/main/components/StyledYubiKeyIcon"
import { showNotificationWithButton } from "@/src/main/utilities/notificationWithButton"
import {
  SelectionWithElement,
  captureSelection,
  insertAtCursor,
  restoreSelection,
} from "@/src/main/utilities/selection"
import { PaperSize, PrintSetting } from "@/src/shared/types/print"
import { yubikeyErrorMessage } from "@/src/shared/utilities/yubikeyErrorMessage"
import zxcvbn, {
  minimumPassphraseStrength,
} from "@/src/shared/utilities/zxcvbn"
import { BlockUsage } from "@/src/utilities/core/block"

const blocksetBackupTypes = [
  { value: "2of3", threshold: 2, shares: 3 },
  { value: "3of5", threshold: 3, shares: 5 },
  { value: "4of7", threshold: 4, shares: 7 },
] as const
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

type BackupType =
  "" | "standard" | (typeof blocksetBackupTypes)[number]["value"]

type ValidBackupType = Exclude<BackupType, "">

type SecretFormValues = {
  secret: string
  passphrase: string
  slot: "1" | "2"
  yubikey: boolean
}

// Each secret starts on the remembered YubiKey slot — the same default
// the archive modals read
const initialSecretEntry = (): SecretFormValues => {
  return {
    secret: "",
    passphrase: "",
    slot:
      window.api.invokeSync.getConfig("yubikey")?.challengeResponseSlot ?? "2",
    yubikey: false,
  }
}

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

// First entry is the primary secret — additional secrets are bounded only by
// remaining block capacity, not by a fixed count
type SecretsState = SecretState[]

type Step = "setup" | "secrets" | "preview"

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
    initialStep = "setup"
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

  const [secrets, setSecrets] = useState<SecretsState>([
    { secret: "", detachedArchive: null },
  ])
  const [step, setStep] = useState<Step>(initialStep)
  // Index of the secret being edited on the secrets step — the flow is
  // linear, so the current secret is always the last one
  const [secretIndex, setSecretIndex] = useState(0)
  const [selection, setSelection] = useState<null | SelectionWithElement>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [showAddSecretDisclaimer, setShowAddSecretDisclaimer] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  // The YubiKey step appears only when the hardware reports it is awaiting
  // touch (the key is blinking at that exact moment) — no-touch slots
  // derive without any step (see onTouchRequired in
  // src/utilities/yubikey/otp.ts)
  const [touchAwaited, setTouchAwaited] = useState(false)
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
    | "common.couldNotCommunicateWithYubiKey"
    | "common.noYubiKeyDetected"
    | "common.multipleYubiKeysDetected"
    | "common.yubiKeySlotNotProvisioned"
    | "common.yubiKeyTouchTimedOut"
  >>(null)
  const [qrs, setQrs] = useState<Qr[]>(initialQrs)
  // The following refs are a temporary patch to help users avoid unintended button clicks (should be fixed using proper UI)
  const openedPopoversRef = useRef(0)
  const blockedClicksRef = useRef(0)
  type FormValues = {
    secrets: SecretFormValues[]
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
  const getBlockUsage = useCallback(
    (backupType: BackupType, secretsData: SecretsState): BlockUsage => {
      return window.api.invokeSync.getBlockUsage(
        secretsData.map(
          (secretState) =>
            secretState.detachedArchive?.blockContent ?? secretState.secret
        ),
        blocksetBackupTypes.some((type) => type.value === backupType)
      )
    },
    []
  )
  const updateSecretsState = useCallback(
    (
      values: FormValues,
      fileUpdates?: Record<number, FileWithAbsolutePath[]>
    ) => {
      setSecrets((prevSecrets) =>
        values.secrets.map((formSecret, index) => {
          const currentSecret = prevSecrets[index]
          const files =
            fileUpdates?.[index] ?? currentSecret?.detachedArchive?.files ?? []

          // Generate or clear detached archive based on files
          let detachedArchive: SecretState["detachedArchive"] = null

          if (files.length > 0) {
            // Generate master key if needed
            const masterKey =
              currentSecret?.detachedArchive?.masterKey ??
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
                secret: formSecret.secret,
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

          return {
            secret: formSecret.secret,
            detachedArchive: detachedArchive,
          }
        })
      )
    },
    []
  )
  const form = useForm<FormValues>({
    initialValues: {
      secrets: [initialSecretEntry()],
      backupType: "",
      label: "",
    },
    onValuesChange: (values, previous) => {
      if (
        values.secrets.length !== previous.secrets.length ||
        values.secrets.some(
          (entry, index) => entry.secret !== previous.secrets[index]?.secret
        )
      ) {
        updateSecretsState(values)
      }
    },
    validate: {
      secrets: {
        secret: (value, values, path) => {
          const index = Number(path.split(".")[1])
          // Additional secrets are validated on their own step only
          if (index > 0 && index !== secretIndex) {
            return null
          }
          const blockUsage = getBlockUsage(values.backupType, secrets)
          if (!value || value === "") {
            return t("routes.create.secretRequired")
          } else if (blockUsage.remainingSpace < 0) {
            return t("routes.create.secretTooLong")
          }
          return null
        },
        passphrase: (value, values, path) => {
          const index = Number(path.split(".")[1])
          // Additional secrets are validated on their own step only
          if (index > 0 && index !== secretIndex) {
            return null
          }
          const result = zxcvbn(value)
          if (!value || value === "") {
            return t("common.passphraseRequired")
          } else if (result.strength < minimumPassphraseStrength) {
            return t("common.passphraseTooWeak")
          }
          if (index > 0) {
            for (const [entryIndex, entry] of values.secrets.entries()) {
              if (entryIndex === index) {
                continue
              }
              if (entry.passphrase === value) {
                return t("routes.create.passphraseUsed")
              } else if (
                leven(entry.passphrase, value) <
                entry.passphrase.length / 2
              ) {
                return t("routes.create.passphraseTooSimilar")
              }
            }
          }
          return null
        },
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
    },
  })
  const resetForm = useCallback(() => {
    form.reset()
    setSecrets([{ secret: "", detachedArchive: null }])
    setSecretIndex(0)
  }, [form])
  const addSecretEntry = useCallback(() => {
    form.insertListItem("secrets", initialSecretEntry())
    setSecretIndex((index) => index + 1)
  }, [form])
  const handleCreate = useCallback(
    async (skipDisclaimerCheck = false) => {
      const validation = form.validate()
      if (validation.hasErrors === false) {
        if (!skipDisclaimerCheck) {
          setShowDisclaimer(true)
          return
        }
        setIsCreating(true)
        // Reset here rather than syncing state in an effect — a stale value
        // cannot render, as the step also requires isCreating
        setTouchAwaited(false)
        // Define defaults
        let isBlockset = false,
          number = 3,
          threshold = 2
        const label = form.values.label
        const blocksetBackup = blocksetBackupTypes.find(
          (type) => type.value === form.values.backupType
        )
        if (blocksetBackup) {
          isBlockset = true
          number = blocksetBackup.shares
          threshold = blocksetBackup.threshold
        }
        const secretsList: Secret[] = []
        for (const [index, entry] of form.values.secrets.entries()) {
          if (entry.secret !== "" && entry.passphrase !== "") {
            secretsList.push({
              message:
                secrets[index]?.detachedArchive?.blockContent ?? entry.secret,
              passphrase: entry.passphrase,
              // YubiKey protection applies to standard blocks only — the
              // toggle is never shown for blocksets
              slot:
                isBlockset === false && entry.yubikey === true
                  ? entry.slot === "1"
                    ? 1
                    : 2
                  : undefined,
            })
          }
        }
        // Remember the slot as the next default, like the selected
        // printer — only when actually used, so the hidden control never
        // overwrites a real choice
        const yubikeyEntry = secretsList.find(
          (entry) => entry.slot !== undefined
        )
        if (yubikeyEntry?.slot !== undefined) {
          window.api.invokeSync.setConfig("yubikey", {
            ...window.api.invokeSync.getConfig("yubikey"),
            challengeResponseSlot: yubikeyEntry.slot === 1 ? "1" : "2",
          })
        }
        // Create detached archives if applicable
        const detachedArchives = secrets.flatMap((secretState) =>
          secretState.detachedArchive ? [secretState.detachedArchive] : []
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
            for (const detachedArchive of detachedArchives) {
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
            label,
            true,
            number,
            threshold
          )
        } else {
          result = await window.api.invoke.create(secretsList, label)
        }
        if (result.success === false) {
          setError({
            message:
              result.yubikeyErrorCode !== undefined
                ? yubikeyErrorMessage(result.yubikeyErrorCode)
                : isBlockset
                  ? "routes.create.couldNotCreateBlockset"
                  : "routes.create.couldNotCreateBlock",
          })
          setIsCreating(false)
          setStep("secrets")
          setSecretIndex(0)
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
    return window.api.events.yubikeyTouchRequired(() => {
      setTouchAwaited(true)
    })
  }, [])
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
  if (["setup", "secrets", "preview"].includes(step) === false) {
    throw new Error("Invalid step")
  }
  if (step === "setup") {
    return (
      <Container>
        <Box px="xl">
          <FileManager
            ref={fileManagerRef}
            mode="standalone"
            handleFiles={(handledFiles) => {
              updateSecretsState(form.values, { 0: handledFiles })
              if (handledFiles.length === 0) {
                handlePopoverChange(false)
              }
            }}
          />
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
            <Text size="sm" mt="xs">
              {t(`routes.create.${form.values.backupType}Description`)}
            </Text>
          ) : null}
          <Space h="lg" />
          <TextInput
            label={t("routes.create.label")}
            placeholder={t("routes.create.typeLabel")}
            {...form.getInputProps("label", { withFocus: false })}
          />
          <Space h="xl" />
          <Button
            disabled={!form.values.backupType}
            fullWidth
            size="md"
            variant="signatureGradient"
            onClick={() => {
              if (
                form.values.backupType &&
                form.validateField("label").hasError === false
              ) {
                setStep("secrets")
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
  if (step === "secrets") {
    // Show form
    const blockUsage = getBlockUsage(form.values.backupType, secrets)
    const currentSecret = secrets[secretIndex]
    const currentEntry = form.values.secrets[secretIndex]
    const isPrimarySecret = secretIndex === 0
    const isBlockset = blocksetBackupTypes.some(
      (type) => type.value === form.values.backupType
    )
    const stepFields = (
      <Fragment>
        <SecretTextareaWithUsage
          key={`secret${secretIndex}`}
          autosize
          blockUsage={blockUsage}
          blockset={isBlockset}
          disabled={isCreating}
          label={t("routes.create.secret")}
          maxRows={isPrimarySecret ? 5 : 4}
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
          {...form.getInputProps(`secrets.${secretIndex}.secret`, {
            withFocus: false,
          })}
        />
        {currentSecret?.detachedArchive ? (
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
                  {isPrimarySecret ? (
                    <Button
                      color="dark"
                      onClick={toggleDetachedArchivePopover}
                      size="xs"
                      variant="filled"
                    >
                      <Text fw="bold" size="xs" variant="signatureGradient">
                        {currentSecret.detachedArchive.filename}.superbacked
                      </Text>
                    </Button>
                  ) : (
                    <Button
                      color="dark"
                      onClick={toggleDetachedArchivePopover}
                      size="xs"
                      variant="signatureTextGradient"
                    >
                      {currentSecret.detachedArchive.filename}.superbacked
                    </Button>
                  )}
                </Popover.Target>
                <Popover.Dropdown>
                  <ScrollArea.Autosize
                    mah={150}
                    scrollHideDelay={0}
                    type="scroll"
                  >
                    <FileList
                      files={currentSecret.detachedArchive.files}
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
          key={`passphrase${secretIndex}`}
          disabled={isCreating}
          label={t("common.passphrase")}
          placeholder={t("common.typePassphrase")}
          required
          generatePassphrase={async () => {
            const passphrase = await window.api.invoke.generatePassphrase()
            form.setFieldValue(`secrets.${secretIndex}.passphrase`, passphrase)
            return passphrase
          }}
          onPopoverChange={handlePopoverChange}
          {...form.getInputProps(`secrets.${secretIndex}.passphrase`, {
            withFocus: false,
          })}
        />
        {isBlockset === false ? (
          <Fragment>
            <Space h="lg" />
            <Group justify="space-between">
              <Switch
                checked={currentEntry?.yubikey === true}
                disabled={isCreating}
                label={t("common.protectWithYubiKey")}
                onChange={(event) =>
                  form.setFieldValue(
                    `secrets.${secretIndex}.yubikey`,
                    event.currentTarget.checked
                  )
                }
                // The track transition exists for the on/off toggle, but
                // the disabled state swaps the track color through the same
                // property — without this, disabling fades over 150ms while
                // every other form element snaps
                styles={{
                  track: isCreating === true ? { transition: "none" } : {},
                }}
                withThumbIndicator={false}
              />
              {/* Always rendered so the row keeps the height of its tallest
                child — mounting on toggle would grow the form */}
              <SegmentedControl
                data={[
                  { label: t("common.slot1"), value: "1" },
                  { label: t("common.slot2"), value: "2" },
                ]}
                disabled={isCreating}
                onChange={(value) =>
                  form.setFieldValue(
                    `secrets.${secretIndex}.slot`,
                    value as "1" | "2"
                  )
                }
                size="xs"
                style={{
                  visibility:
                    currentEntry?.yubikey === true ? "visible" : "hidden",
                }}
                value={currentEntry?.slot ?? "2"}
              />
            </Group>
            {currentEntry?.yubikey === true ? (
              <Fragment>
                <Space h="sm" />
                <Text c="dimmed" size="xs">
                  {t("routes.create.restoringRequiresYubiKey")}
                </Text>
              </Fragment>
            ) : null}
          </Fragment>
        ) : null}
        <ActionBadge>
          {currentSecret?.detachedArchive
            ? t("routes.create.dragAndDropFilesToAddToDetachedArchive")
            : t("routes.create.dragAndDropFileToProvisionDetachedArchive")}{" "}
          <InfoButton tabIndex={-1}>
            {t("components.featureDescriptionModal.detachedArchiveDescription")}
          </InfoButton>
        </ActionBadge>
      </Fragment>
    )
    const addSecret = (
      <Fragment>
        <Space h="lg" />
        <Button
          disabled={
            !currentEntry?.secret ||
            !currentEntry?.passphrase ||
            !form.values.backupType ||
            blockUsage.remainingSpace <= 40 ||
            isCreating
          }
          fullWidth
          size="sm"
          variant="signatureTextGradient"
          onClick={() => {
            if (shouldIgnoreClick()) return
            const validation = form.validate()
            if (validation.hasErrors === false) {
              if (isPrimarySecret) {
                setShowAddSecretDisclaimer(true)
              } else {
                addSecretEntry()
              }
            }
          }}
        >
          {t("routes.create.addSecret")}
        </Button>
      </Fragment>
    )
    const removeSecret = isPrimarySecret ? null : (
      <Fragment>
        <Space h="lg" />
        <Button
          disabled={isCreating}
          fullWidth
          size="sm"
          variant="signatureTextGradient"
          onClick={() => {
            if (shouldIgnoreClick()) return
            form.removeListItem("secrets", secretIndex)
            setSecretIndex(secretIndex - 1)
          }}
        >
          {t("routes.create.removeSecret")}
        </Button>
      </Fragment>
    )
    const detachedArchiveCount = secrets.filter(
      (secretState) => secretState.detachedArchive !== null
    ).length
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
            key={secretIndex}
            ref={fileManagerRef}
            mode="detached"
            handleFiles={(handledFiles) => {
              updateSecretsState(form.values, { [secretIndex]: handledFiles })
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
        <CreateDisclaimerModal
          backupType={backupType}
          detachedArchiveCount={detachedArchiveCount}
          secretCount={
            secrets.filter((secretState) => secretState.secret !== "").length
          }
          opened={showDisclaimer}
          onClose={() => setShowDisclaimer(false)}
          onConfirm={() => {
            setShowDisclaimer(false)
            void handleCreate(true)
          }}
        />
        <AddSecretDisclaimerModal
          opened={showAddSecretDisclaimer}
          onClose={() => setShowAddSecretDisclaimer(false)}
          onConfirm={() => {
            setShowAddSecretDisclaimer(false)
            addSecretEntry()
          }}
        />
        {/* Same touch step as the standalone archive modals — shown while
          the hardware is awaiting touch, dismissed by the touch itself (or
          its timeout), never by the user */}
        <Modal
          centered
          closeOnClickOutside={false}
          closeOnEscape={false}
          onClose={() => {}}
          opened={touchAwaited === true && isCreating === true}
          withCloseButton={false}
        >
          <Space h="xl" />
          <Center>
            <StyledYubiKeyIcon />
          </Center>
          <Space h="xl" />
          <Text fw="bold" size="sm" ta="center">
            {t("common.touchYubiKey")}
          </Text>
          <Space h="xl" />
        </Modal>
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
            leftSection={<IconPrinter size={14} />}
            size="xs"
            sx={{
              position: "absolute",
              bottom: "5px",
              left: "45px",
              maxWidth: "70px",
            }}
            value={qr.copies.toString()}
            // onOptionSubmit rather than onChange — deselecting the current
            // count must not clear the field, and the controlled value keeps
            // the display on the last submitted option
            onOptionSubmit={(value) => {
              const updatedQr = {
                ...qr,
                copies: parseInt(value),
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
                    setStep("setup")
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
                <Text size="sm">
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
                <Text size="sm">
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
