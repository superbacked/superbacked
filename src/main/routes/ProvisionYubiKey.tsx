import styled from "@emotion/styled"
import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Space,
  Text,
  Textarea,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { IconArrowsRandom } from "@tabler/icons-react"
import {
  Fragment,
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { Trans, useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router"

import YubiKeyTouchPrompt from "@/src/main/components/YubiKeyTouchPrompt"
import { copySecretText } from "@/src/main/utilities/clipboard"
import { useDefaultYubiKeySlot } from "@/src/main/utilities/useDefaultYubiKeySlot"
import { TranslationKey } from "@/src/shared/types/i18n"
import { yubikeyErrorMessage } from "@/src/shared/utilities/yubikeyErrorMessage"
import {
  isYubiKeySecret,
  normalizeYubiKeySecret,
} from "@/src/shared/yubikeySecret"
// Type-only like Restore — a value import would bundle node-hid into the
// renderer
import type { Slot } from "@/src/utilities/yubikey/otp"

// Slot provisioning in the app — the same handlers and the same
// confirmations as the command-line command (see
// src/cli/provisionYubikey.ts), with a generated secret handed to create
// mode for its backup or kept for provisioning another YubiKey

// Same frame and width as the create route’s secrets step — every route
// centers its content vertically in the window
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

// Irreversible steps confirmed before the hardware work — each pauses
// the flow until the modal answers
type Confirmation = "enableOtpInterface" | "overwriteSlot"

interface Result {
  // null when the model could not be read — the backup then opens with
  // an empty label and the failure shows on the result step
  label: null | string
  labelError: null | TranslationKey
  secret: string
  slot: Slot
}

// State the secret arrives in when handed to create mode
export type YubiKeySecretHandoff = {
  label: string
  secret: string
}

const ProvisionYubiKey: FunctionComponent = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { defaultSlot, setDefaultSlot } = useDefaultYubiKeySlot()
  const secretInputRef = useRef<HTMLTextAreaElement>(null)
  // A secret restored from a backup and handed over by the restore route
  // (see src/main/routes/Restore.tsx) — the field opens filled
  const [restoredSecret] = useState<null | string>(() => {
    const state = location.state as null | { yubikeySecret?: string }
    return state?.yubikeySecret ?? null
  })
  // Consumed once — a later remount of the route (the File menu
  // re-triggering it) starts empty rather than refilling the secret
  useEffect(() => {
    if (restoredSecret !== null) {
      void navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Provisioning is the moment the secret first exists in plaintext on
  // the host — off Superbacked OS, the warning gates the page like the
  // command-line confirmation gates the command. A secret restored from a
  // backup was already decrypted and displayed on this host, so the
  // exposure the warning describes has happened and the modal is skipped.
  // Lazy so the blocking IPC read happens once at mount
  const [hostExposureConfirmed, setHostExposureConfirmed] = useState(
    () => restoredSecret !== null || window.api.invokeSync.isSuperbackedOs()
  )
  const form = useForm({
    initialValues: {
      secret: restoredSecret ?? "",
      slot: defaultSlot,
    },
    validate: {
      secret: (value) => {
        if (isYubiKeySecret(normalizeYubiKeySecret(value)) === false) {
          return t("routes.provisionYubiKey.challengeResponseSecretInvalid")
        }
        return null
      },
    },
  })
  const [isProvisioning, setIsProvisioning] = useState(false)
  const [touchAwaited, setTouchAwaited] = useState(false)
  const [error, setError] = useState<null | TranslationKey>(null)
  const [result, setResult] = useState<null | Result>(null)
  const [confirmation, setConfirmation] = useState<null | Confirmation>(null)
  // A confirmed modal stays open with its button spinning until the
  // hardware takes over — the touch prompt, the result or an error — like
  // every other button that starts hardware work, so the form never
  // flashes back in between
  const [confirmationPending, setConfirmationPending] = useState(false)
  // The flow awaits the modal like the command-line command awaits the
  // terminal — the resolver is parked here until a button answers
  const confirmationResolverRef = useRef<null | ((confirmed: boolean) => void)>(
    null
  )
  const closeConfirmation = useCallback(() => {
    setConfirmation(null)
    setConfirmationPending(false)
  }, [])
  useEffect(() => {
    return window.api.events.yubikeyTouchRequired(() => {
      setTouchAwaited(true)
      closeConfirmation()
    })
  }, [closeConfirmation])
  const confirm = useCallback((kind: Confirmation): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmationResolverRef.current = resolve
      setConfirmationPending(false)
      setConfirmation(kind)
    })
  }, [])
  const answerConfirmation = useCallback(
    (confirmed: boolean) => {
      if (confirmed === true) {
        setConfirmationPending(true)
      } else {
        closeConfirmation()
      }
      const resolve = confirmationResolverRef.current
      confirmationResolverRef.current = null
      resolve?.(confirmed)
    },
    [closeConfirmation]
  )
  const generateSecret = useCallback(() => {
    const secret = window.api.invokeSync.generateYubiKeySecret()
    form.setFieldValue("secret", secret)
    form.clearFieldError("secret")
    secretInputRef.current?.focus()
  }, [form])
  // The hardware flow, shared by the form and by provisioning another
  // YubiKey from the result step — the latter reuses the secret and slot
  // just written, so a key not yet swapped meets the overwrite
  // confirmation rather than a silent rewrite
  const provision = useCallback(
    async (secret: string, slot: Slot) => {
      setError(null)
      setIsProvisioning(true)
      setTouchAwaited(false)
      try {
        let statusResult = await window.api.invoke.getYubiKeyStatus()
        if (
          statusResult.success === false &&
          statusResult.yubikeyErrorCode === "otpInterfaceDisabled"
        ) {
          // Offer to enable the interface in place when the key allows it
          // (see canEnableYubiKeyOtp in src/handlers/yubikeyProvisioning.ts)
          const probe = await window.api.invoke.canEnableYubiKeyOtp()
          if (probe.success === false) {
            statusResult = probe
          } else {
            if ((await confirm("enableOtpInterface")) === false) {
              return
            }
            // The modal keeps spinning through the restart wait
            statusResult = await window.api.invoke.enableYubiKeyOtpInterface()
          }
        }
        if (statusResult.success === false) {
          setError(
            statusResult.yubikeyErrorCode !== undefined
              ? yubikeyErrorMessage(statusResult.yubikeyErrorCode)
              : "routes.provisionYubiKey.couldNotProvisionYubiKey"
          )
          return
        }
        const provisioned =
          slot === 1
            ? statusResult.status.slot1Provisioned
            : statusResult.status.slot2Provisioned
        if (
          provisioned === true &&
          (await confirm("overwriteSlot")) === false
        ) {
          return
        }
        // The app always requires touch. A slot that answers without
        // physical presence is a weaker configuration, so it is deliberately
        // reachable only through the command line’s --no-touch flag (the
        // IPC handler fixes it, see src/registerHandlers.ts)
        const provisionResult = await window.api.invoke.provisionYubiKey(
          slot,
          secret
        )
        if (provisionResult.success === false) {
          setError(
            provisionResult.yubikeyErrorCode !== undefined
              ? yubikeyErrorMessage(provisionResult.yubikeyErrorCode)
              : "routes.provisionYubiKey.couldNotProvisionYubiKey"
          )
          return
        }
        setDefaultSlot(slot === 1 ? "1" : "2")
        // The key has answered, so the touch prompt ends here — the button
        // that started the work keeps spinning through the model read,
        // which the key answers slowly right after a write
        setTouchAwaited(false)
        const model = await window.api.invoke.readYubiKeyModel()
        setResult({
          label: model.success === true ? model.label : null,
          labelError:
            model.success === true
              ? null
              : model.yubikeyErrorCode !== undefined
                ? yubikeyErrorMessage(model.yubikeyErrorCode)
                : "common.couldNotCommunicateWithYubiKey",
          secret: provisionResult.secret,
          slot: slot,
        })
      } finally {
        setIsProvisioning(false)
        setTouchAwaited(false)
        closeConfirmation()
      }
    },
    [closeConfirmation, confirm, setDefaultSlot]
  )
  const submit = useCallback(() => {
    if (form.validate().hasErrors === true) {
      return
    }
    void provision(
      normalizeYubiKeySecret(form.values.secret),
      form.values.slot === "1" ? 1 : 2
    )
  }, [form, provision])
  const provisionAnother = useCallback(() => {
    if (result === null) {
      return
    }
    void provision(result.secret, result.slot)
  }, [provision, result])
  const backUpSecret = useCallback(() => {
    if (result === null) {
      return
    }
    const handoff: YubiKeySecretHandoff = {
      label: result.label ?? "",
      secret: result.secret,
    }
    void navigate("/", { state: { yubikeySecret: handoff } })
  }, [navigate, result])
  // Cancelling returns to wherever the File menu was used from
  const cancel = useCallback(() => {
    void navigate(-1)
  }, [navigate])
  // Done leaves for create mode, the app’s home
  const done = useCallback(() => {
    void navigate("/")
  }, [navigate])
  // A destructive step makes Cancel the primary button — the action is
  // still one click away, but the safe choice is the obvious one
  const confirmationCopy: Record<
    Confirmation,
    { title: string; description: string; action: string; destructive: boolean }
  > = {
    enableOtpInterface: {
      title: t("routes.provisionYubiKey.enableOtpInterface"),
      description: t("routes.provisionYubiKey.enableOtpInterfaceDescription"),
      action: t("routes.provisionYubiKey.enable"),
      destructive: false,
    },
    overwriteSlot: {
      title: t("routes.provisionYubiKey.overwriteSlot", {
        slot: result === null ? form.values.slot : result.slot,
      }),
      description: t("routes.provisionYubiKey.overwriteSlotDescription", {
        slot: result === null ? form.values.slot : result.slot,
      }),
      action: t("routes.provisionYubiKey.overwrite"),
      destructive: true,
    },
  }
  const destructiveConfirmation =
    confirmation !== null && confirmationCopy[confirmation].destructive === true
  let content
  if (result !== null) {
    // Same button group as a restored secret (see
    // src/main/routes/Restore.tsx), with the backup story beside the
    // actions that fulfil it — the secret itself stays off screen, as the
    // field just showed it and every action carries it
    content = (
      <Fragment>
        <Text fw="bold" size="sm" ta="center">
          {t("routes.provisionYubiKey.slotProvisioned", { slot: result.slot })}
        </Text>
        <Space h="lg" />
        <Text c="red" size="sm" ta="center">
          {t("routes.provisionYubiKey.challengeResponseSecretCannotBeReadBack")}
        </Text>
        {result.labelError !== null ? (
          <Fragment>
            <Space h="md" />
            <Text c="red" role="alert" size="sm" ta="center">
              {t("routes.provisionYubiKey.couldNotReadYubiKeyModel", {
                reason: t(result.labelError),
              })}
            </Text>
          </Fragment>
        ) : null}
        <Space h="lg" />
        <Group justify="center">
          <Button.Group>
            <Button
              onClick={async () => {
                await copySecretText(result.secret)
              }}
              variant="default"
            >
              {t("common.copy")}
            </Button>
            <Button
              disabled={isProvisioning}
              onClick={backUpSecret}
              variant="default"
            >
              {t("routes.provisionYubiKey.backUpToBlock")}
            </Button>
            <Button
              disabled={isProvisioning}
              loading={isProvisioning}
              onClick={provisionAnother}
              variant="default"
            >
              {t("routes.provisionYubiKey.provisionToAnotherYubiKey")}
            </Button>
            <Button disabled={isProvisioning} onClick={done} variant="default">
              {t("common.done")}
            </Button>
          </Button.Group>
        </Group>
        {error !== null ? (
          <Fragment>
            <Space h="md" />
            <Text c="red" role="alert" size="sm" ta="center">
              {t(error)}
            </Text>
          </Fragment>
        ) : null}
      </Fragment>
    )
  } else {
    content = (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {/* Same input and generator affordance as the passphrase field —
            the secret stays visible like every secret in the app. A secret
            restored from a backup is locked, as editing or regenerating it
            would silently program a different secret */}
        <Textarea
          ref={secretInputRef}
          autosize
          disabled={isProvisioning || restoredSecret !== null}
          label={t("routes.provisionYubiKey.challengeResponseSecret")}
          maxRows={2}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder={t("routes.provisionYubiKey.typeChallengeResponseSecret")}
          required
          rightSection={
            <ActionIcon
              disabled={isProvisioning || restoredSecret !== null}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={generateSecret}
              variant="transparent"
            >
              <IconArrowsRandom size={16} />
            </ActionIcon>
          }
          rightSectionPointerEvents="auto"
          spellCheck={false}
          {...form.getInputProps("secret", { withFocus: false })}
        />
        <Space h="lg" />
        <Group justify="space-between">
          <Text size="sm">{t("routes.provisionYubiKey.slot")}</Text>
          <SegmentedControl
            data={[
              { label: t("common.slot1"), value: "1" },
              { label: t("common.slot2"), value: "2" },
            ]}
            disabled={isProvisioning}
            onChange={(value) => {
              form.setFieldValue("slot", value as "1" | "2")
            }}
            size="xs"
            value={form.values.slot}
          />
        </Group>
        <Space h="xl" />
        {error !== null ? (
          <Fragment>
            <Text c="red" role="alert" size="sm">
              {t(error)}
            </Text>
            <Space h="md" />
          </Fragment>
        ) : null}
        <Button
          disabled={isProvisioning}
          fullWidth
          loading={isProvisioning}
          size="md"
          type="submit"
          variant="signatureGradient"
        >
          {t("routes.provisionYubiKey.provisionYubiKey")}
        </Button>
      </form>
    )
  }
  return (
    <Container>
      {content}
      {/* Same touch step as the create route — shown while the hardware
          is awaiting touch, dismissed by the touch itself (or its
          timeout), never by the user */}
      <Modal
        centered
        closeOnClickOutside={false}
        closeOnEscape={false}
        onClose={() => {}}
        opened={touchAwaited === true && isProvisioning === true}
        size="sm"
        withCloseButton={false}
      >
        <YubiKeyTouchPrompt />
      </Modal>
      <Modal
        centered
        onClose={cancel}
        opened={hostExposureConfirmed === false}
        size="sm"
        styles={{
          title: {
            fontWeight: "bold",
          },
        }}
        title={t("routes.provisionYubiKey.provisionYubiKey")}
      >
        <Text size="sm">
          {/* Same link treatment as the startup disclaimer’s
              recommendation (see src/main/components/Disclaimer.tsx) */}
          <Trans
            i18nKey="routes.provisionYubiKey.hostExposureWarning"
            components={{
              anchor: (
                <Anchor
                  c="inherit"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    void window.api.invoke.openExternalUrl(
                      "https://superbacked.com/superbacked-os"
                    )
                  }}
                />
              ),
              bold: <Text fw="bold" variant="signatureGradient" span />,
            }}
          />
        </Text>
        <Space h="xl" />
        <Group justify="flex-end">
          <Button
            onClick={() => {
              setHostExposureConfirmed(true)
            }}
            variant="default"
          >
            {t("routes.provisionYubiKey.continue")}
          </Button>
          <Button onClick={cancel} variant="signatureGradient">
            {t("common.cancel")}
          </Button>
        </Group>
      </Modal>
      <Modal
        centered
        closeOnClickOutside={confirmationPending === false}
        closeOnEscape={confirmationPending === false}
        onClose={() => answerConfirmation(false)}
        opened={confirmation !== null}
        size="sm"
        styles={{
          title: {
            fontWeight: "bold",
          },
        }}
        title={
          confirmation === null ? "" : confirmationCopy[confirmation].title
        }
      >
        <Text size="sm">
          {confirmation === null
            ? ""
            : confirmationCopy[confirmation].description}
        </Text>
        <Space h="xl" />
        <Group justify="flex-end">
          {destructiveConfirmation === true ? (
            <Fragment>
              <Button
                disabled={confirmationPending}
                loading={confirmationPending}
                onClick={() => answerConfirmation(true)}
                variant="default"
              >
                {confirmation === null
                  ? ""
                  : confirmationCopy[confirmation].action}
              </Button>
              <Button
                disabled={confirmationPending}
                onClick={() => answerConfirmation(false)}
                variant="signatureGradient"
              >
                {t("common.cancel")}
              </Button>
            </Fragment>
          ) : (
            <Fragment>
              <Button
                disabled={confirmationPending}
                onClick={() => answerConfirmation(false)}
                variant="default"
              >
                {t("common.cancel")}
              </Button>
              <Button
                disabled={confirmationPending}
                loading={confirmationPending}
                onClick={() => answerConfirmation(true)}
                variant="signatureGradient"
              >
                {confirmation === null
                  ? ""
                  : confirmationCopy[confirmation].action}
              </Button>
            </Fragment>
          )}
        </Group>
      </Modal>
    </Container>
  )
}

export default ProvisionYubiKey
