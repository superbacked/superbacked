import styled from "@emotion/styled"
import {
  Box,
  Button,
  ComboboxItem,
  Group,
  Modal,
  Popover,
  ScrollArea,
  Select,
  Space,
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
import {
  SelectionWithElement,
  captureSelection,
  insertAtCursor,
  restoreSelection,
} from "@/src/main/utilities/selection"
import zxcvbn from "@/src/main/utilities/zxcvbn"

const blocksetBackupTypes = [
  { value: "2of3", threshold: 2, shares: 3 },
  { value: "3of5", threshold: 3, shares: 5 },
  { value: "4of7", threshold: 4, shares: 7 },
] as const
const secretNumbers = [1, 2, 3] as const
const maxDataLength = 1024
const maxLabelLength = 64

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
  | ""
  | "standard"
  | (typeof blocksetBackupTypes)[number]["value"]

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
  const [showSelectPrinter, setShowSelectPrinter] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [error, setError] = useState<null | ErrorState<
    | "routes.create.couldNotCreateDetachedArchive"
    | "routes.create.couldNotCreateBlock"
    | "routes.create.couldNotCreateBlockset"
    | "routes.create.pleaseConnectPrinter"
    | "routes.create.pleaseSelectPrinter"
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
  const updateSecretsState = useCallback(
    (fileUpdates?: Partial<Record<SecretNumber, FileWithAbsolutePath[]>>) => {
      setSecrets((prevSecrets) => {
        const newSecrets: SecretsState = { ...prevSecrets }

        for (const secretNumber of secretNumbers) {
          const currentSecret = prevSecrets[secretNumber]
          const formSecret = form.values[`secret${secretNumber}`]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.values.secret1, form.values.secret2, form.values.secret3]
  )
  const resetForm = useCallback(() => {
    form.reset()
    updateSecretsState({ 1: [], 2: [], 3: [] })
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
              "handlers.createDetachedArchive.chooseWhereToSaveDetachedArchive",
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
  const handlePrint = useCallback(
    async (printerName: string) => {
      setIsPrinting(true)
      notifications.show({
        message:
          qrs.length > 1
            ? t("routes.create.printingBlockset")
            : t("routes.create.printingBlock"),
      })
      for (const qr of qrs) {
        await window.api.invoke.print(printerName, qr.pdf, qr.copies)
      }
      let done = false
      while (done !== true) {
        const status = await window.api.invoke.getPrinterStatus(printerName)
        if (status === "standby") {
          setIsPrinting(false)
          done = true
        }
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
  useEffect(() => {
    updateSecretsState()
  }, [updateSecretsState])
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
              updateSecretsState({ 1: handledFiles })
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
            <InfoButton>
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
            secretNumber={1}
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
                <Text c="dimmed" size="xs">
                  {t("routes.create.detachedArchive")}
                </Text>
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
            <InfoButton>
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
            secretNumber={secretNumber}
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
                <Text c="dimmed" size="xs">
                  {t("routes.create.detachedArchive")}
                </Text>
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
            <InfoButton>
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
              updateSecretsState({ [secretNumber]: [] })
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
              updateSecretsState({ [secretNumber]: handledFiles })
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
                  const defaultPrinter =
                    await window.api.invoke.getDefaultPrinter()
                  if (printers.length === 0) {
                    setError({
                      message: "routes.create.pleaseConnectPrinter",
                    })
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
              <Button
                variant="default"
                onClick={() => {
                  void window.api.invoke.save(qrs, ["jpg", "pdf"])
                }}
              >
                {t("routes.create.save")}
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
            leftSection={<IconPrinter size={16} />}
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
        <ErrorModal error={error} onClose={() => setError(null)} />
      </Fragment>
    )
  }
}

export default Create
