import styled from "@emotion/styled"
import {
  ActionIcon,
  Box,
  Button,
  ComboboxItem,
  Group,
  Menu,
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
import { useNavigate } from "react-router"

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
import StyledLockPlusIcon from "@/src/main/components/StyledLockPlusIcon"
import YubiKeyProtection from "@/src/main/components/YubiKeyProtection"
import YubiKeyTouchPrompt from "@/src/main/components/YubiKeyTouchPrompt"
import { showNotificationWithButton } from "@/src/main/utilities/notificationWithButton"
import {
  SelectionWithElement,
  captureSelection,
  insertAtCursor,
  restoreSelection,
} from "@/src/main/utilities/selection"
import { useActiveKdfProfile } from "@/src/main/utilities/useActiveKdfProfile"
import { useDefaultYubiKeySlot } from "@/src/main/utilities/useDefaultYubiKeySlot"
import { PaperSize, PrintSetting } from "@/src/shared/types/print"
import {
  YubiKeyErrorMessage,
  yubikeyErrorMessage,
} from "@/src/shared/utilities/yubikeyErrorMessage"
import zxcvbn, {
  minimumPassphraseStrength,
} from "@/src/shared/utilities/zxcvbn"
import { BlockUsage } from "@/src/utilities/core/block"
import sleep from "@/src/utilities/sleep"

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

// null is the unselected state — the same sentinel Select reports on
// deselect, so form state never needs coercion at the input boundary
type BackupType =
  null | "standard" | (typeof blocksetBackupTypes)[number]["value"]

type ValidBackupType = Exclude<BackupType, null>

type SecretFormValues = {
  secret: string
  passphrase: string
  slot: "1" | "2"
  yubikey: boolean
}

// Each secret starts on the default YubiKey slot — the same default the
// archive modals read
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
  // The keys never reach the renderer — creation and restoration derive
  // them from the master key inside the handlers (see
  // src/handlers/detachedArchive.ts)
  detachedArchive: {
    files: FileWithAbsolutePath[]
    masterKey: string
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
    | "routes.create.printerCommunicationFailed"
    | "routes.create.printerDoesNotSupportPaperSize"
  >>(null)
  // Recoverable hardware states surface inline beside the YubiKey controls
  // (matching the archive modals) — the heads-up modal is reserved for
  // unexpected failures
  const [yubikeyError, setYubikeyError] = useState<null | YubiKeyErrorMessage>(
    null
  )
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

            // Derive archive filename from master key
            const filename =
              window.api.invokeSync.deriveDetachedArchiveFilename(masterKey)

            // Build block content binding secret and master key
            const blockContent = window.api.invokeSync.encodeBlockContent(
              formSecret.secret,
              masterKey
            )

            detachedArchive = {
              files,
              masterKey,
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
  const { setDefaultSlot } = useDefaultYubiKeySlot()
  // Scales the estimator display and the passphrase gate to the profile
  // new blocks will stretch under (see src/shared/utilities/zxcvbn.ts)
  const activeKdfProfile = useActiveKdfProfile()
  // Lazy so the config read happens once at mount — an inline object here
  // would issue a blocking IPC call on every render
  const [formInitialValues] = useState<FormValues>(() => ({
    secrets: [initialSecretEntry()],
    backupType: null,
    label: "",
  }))
  const form = useForm<FormValues>({
    initialValues: formInitialValues,
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
          const result = zxcvbn(value, activeKdfProfile)
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
    // Rebase on fresh initial values so the YubiKey slot persisted during
    // creation carries into the next block, like the archive modals
    form.setInitialValues({
      secrets: [initialSecretEntry()],
      backupType: null,
      label: "",
    })
    form.reset()
    setSecrets([{ secret: "", detachedArchive: null }])
    setSecretIndex(0)
  }, [form])
  const addSecretEntry = useCallback(() => {
    form.insertListItem("secrets", initialSecretEntry())
    setSecretIndex((index) => index + 1)
  }, [form])
  const handleYubikeyChange = useCallback(
    (checked: boolean) => {
      form.setFieldValue(`secrets.${secretIndex}.yubikey`, checked)
    },
    [form, secretIndex]
  )
  const handleSlotChange = useCallback(
    (slot: "1" | "2") => {
      form.setFieldValue(`secrets.${secretIndex}.slot`, slot)
    },
    [form, secretIndex]
  )
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
        setYubikeyError(null)
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
        // Make the slot the next default, like the selected printer — only
        // when actually used, so the hidden control never overwrites a real
        // choice
        const yubikeyEntry = secretsList.find(
          (entry) => entry.slot !== undefined
        )
        if (yubikeyEntry?.slot !== undefined) {
          setDefaultSlot(yubikeyEntry.slot === 1 ? "1" : "2")
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
          if (result.yubikeyErrorCode !== undefined) {
            setYubikeyError(yubikeyErrorMessage(result.yubikeyErrorCode))
          } else {
            setError({
              message: isBlockset
                ? "routes.create.couldNotCreateBlockset"
                : "routes.create.couldNotCreateBlock",
            })
            setStep("secrets")
            setSecretIndex(0)
          }
          setIsCreating(false)
          return
        }
        resetForm()
        setQrs(result.qrs)
        setIsCreating(false)
        setStep("preview")
      }
    },
    [form, secrets, t, resetForm, setDefaultSlot]
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
        sizes = []
      }
      if (sizes.length === 0) {
        // Fall back to all sizes on failure and on an empty answer alike
        // (a driver advertising none of the app’s sizes) — print()
        // validates support as a safety net, whereas accepting an empty
        // list would gray the paper select with no way forward
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
          } else {
            // Polling without a delay spawns lpstat as fast as the IPC
            // round-trip allows
            await sleep(1000)
          }
        }
      } catch (printError) {
        setIsPrinting(false)
        // Only the genuine unsupported-size refusal (see print.ts) gets
        // the paper-size message — every other failure in the flow (a
        // sleeping printer timing out, a submission error) is a
        // communication problem, and misreporting it as a paper-size
        // problem sends the user down the wrong path
        setError({
          message:
            printError instanceof Error &&
            printError.message.includes("does not support")
              ? "routes.create.printerDoesNotSupportPaperSize"
              : "routes.create.printerCommunicationFailed",
        })
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
          } else {
            // Polling without a delay spawns lpstat as fast as the IPC
            // round-trip allows
            await sleep(1000)
          }
        }
        setDetermineScaleStep("measure")
      } catch (printError) {
        setIsPrinting(false)
        // Only the genuine unsupported-size refusal (see print.ts) gets
        // the paper-size message — every other failure in the flow (a
        // sleeping printer timing out, a submission error) is a
        // communication problem, and misreporting it as a paper-size
        // problem sends the user down the wrong path
        setError({
          message:
            printError instanceof Error &&
            printError.message.includes("does not support")
              ? "routes.create.printerDoesNotSupportPaperSize"
              : "routes.create.printerCommunicationFailed",
        })
      }
    },
    [qrs, t]
  )
  useEffect(() => {
    if (Object.keys(form.errors).length > 0) {
      form.validate()
    }
    // The profile is a dependency too — toggling Paranoid mode can clear
    // (or restore) a passphrase-too-weak error without an edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language, activeKdfProfile])
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
      } else if (type === "password") {
        const password = await window.api.invoke.generatePassword()
        insertAtCursor(password)
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
          {/* Discovery hint — shown until the form is interacted with, as
            it advertises a different flow (the drag and drop affordance
            itself keeps working) */}
          {form.values.backupType === null && form.values.label === "" ? (
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
          ) : null}
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
          kdfProfile={activeKdfProfile}
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
            <Space h="md" />
            <YubiKeyProtection
              checked={currentEntry?.yubikey === true}
              disabled={isCreating}
              label={t("common.protectWithYubiKey")}
              onChange={handleYubikeyChange}
              onSlotChange={handleSlotChange}
              slot={currentEntry?.slot ?? "2"}
            />
          </Fragment>
        ) : null}
        {/* Discovery hint — shown while the secret is pristine and fades
          once it is interacted with or a detached archive is provisioned
          (the drag and drop affordance itself keeps working) */}
        {currentEntry?.secret === "" &&
        currentEntry?.passphrase === "" &&
        currentEntry?.yubikey === false &&
        !currentSecret?.detachedArchive ? (
          <ActionBadge>
            {t("routes.create.dragAndDropFileToProvisionDetachedArchive")}{" "}
            {/* YubiKey protection applies to standard blocks only, so
                only the block variant mentions it */}
            <InfoButton tabIndex={-1}>
              {t(
                isBlockset === true
                  ? "components.featureDescriptionModal.detachedArchiveBlocksetDescription"
                  : "components.featureDescriptionModal.detachedArchiveBlockDescription"
              )}
            </InfoButton>
          </ActionBadge>
        ) : null}
      </Fragment>
    )
    // Add and remove secret are low-frequency actions — they live behind
    // an overflow menu beside the primary call to action instead of
    // spending rows of their own
    const secretActionsMenu = (
      // Offset matches the gap="xs" between the create button and the
      // kebab, so the dropdown floats as far from the kebab as the button
      // does
      <Menu offset={10} position="top-end">
        <Menu.Target>
          <ActionIcon
            aria-label={t("routes.create.secretActions")}
            disabled={isCreating}
            size={42}
            variant="default"
          >
            <StyledLockPlusIcon />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            disabled={
              !currentEntry?.secret ||
              !currentEntry?.passphrase ||
              !form.values.backupType ||
              blockUsage.remainingSpace <= 40
            }
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
          </Menu.Item>
          {isPrimarySecret ? null : (
            <Menu.Item
              onClick={() => {
                if (shouldIgnoreClick()) return
                form.removeListItem("secrets", secretIndex)
                setSecretIndex(secretIndex - 1)
              }}
            >
              {t("routes.create.removeSecret")}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
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

    const backupType: ValidBackupType = form.values.backupType ?? "standard"

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
            <Space h="xl" />
            {yubikeyError !== null ? (
              <Fragment>
                <Text c="red" role="alert" size="sm">
                  {t(yubikeyError)}
                </Text>
                <Space h="md" />
              </Fragment>
            ) : null}
            <Group gap="xs" wrap="nowrap">
              <Button
                disabled={isCreating}
                loading={isCreating}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  void handleCreate()
                }}
                size="md"
                style={{ flex: 1 }}
                variant="signatureGradient"
              >
                {createButtonLabel}
              </Button>
              {secretActionsMenu}
            </Group>
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
          yubikeyProtectedPositions={
            isBlockset
              ? []
              : form.values.secrets
                  .filter(
                    (entry) => entry.secret !== "" && entry.passphrase !== ""
                  )
                  .flatMap((entry, index) =>
                    entry.yubikey === true ? [index + 1] : []
                  )
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
          <YubiKeyTouchPrompt />
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
              {/* Options that only configure a print enable exactly when
                  a print is possible — same gate as the Print button */}
              <Switch
                checked={heavyweight}
                disabled={!selectedPrinter || !paperSize}
                label={t("routes.create.heavyweight")}
                withThumbIndicator={false}
                onChange={(event) =>
                  setHeavyweight(event.currentTarget.checked)
                }
              />
              <Space h="md" />
              <Switch
                checked={customScale}
                disabled={!selectedPrinter || !paperSize}
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
                    disabled={!selectedPrinter || !paperSize}
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
