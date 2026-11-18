import { Button, Group, Modal, Space, Text, TextInput } from "@mantine/core"
import { useForm } from "@mantine/form"
import {
  Fragment,
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import PassphraseInputWithStrength, {
  PassphraseInputWithStrengthRef,
} from "@/src/main/components/PassphraseInputWithStrength"
import WeakPassphraseDisclaimerModal from "@/src/main/components/WeakPassphraseDisclaimerModal"
import YubiKeyProtection from "@/src/main/components/YubiKeyProtection"
import YubiKeyTouchPrompt from "@/src/main/components/YubiKeyTouchPrompt"
import { useActiveKdfProfile } from "@/src/main/utilities/useActiveKdfProfile"
import { useDefaultYubiKeySlot } from "@/src/main/utilities/useDefaultYubiKeySlot"
import { TranslationKey } from "@/src/shared/types/i18n"
import zxcvbn, {
  minimumPassphraseStrength,
} from "@/src/shared/utilities/zxcvbn"

interface CreateStandaloneArchiveModalProps {
  isLoading?: boolean
  opened: boolean
  onClose: () => void
  onSubmit: (label: {
    filename: string
    passphrase: string
    slot: "1" | "2"
    yubikey: boolean
  }) => void
  onReset?: () => void
  error?: null | TranslationKey
  errorCount?: number
}

const initialValues = (slot: "1" | "2") => {
  return {
    filename: "",
    passphrase: "",
    slot: slot,
    // Passphrase allowed through the strength gate despite its weakness
    // — bound to the exact value, so an edit re-arms the gate (see
    // src/main/components/PassphraseInputWithStrength.tsx)
    weakPassphraseAllowedFor: null as null | string,
    yubikey: false,
  }
}

const CreateStandaloneArchiveModal: FunctionComponent<
  CreateStandaloneArchiveModalProps
> = (props) => {
  const { i18n, t } = useTranslation()
  const { defaultSlot, setDefaultSlot } = useDefaultYubiKeySlot()
  // Scales the estimator display and the passphrase gate to the profile
  // new archives will stretch under (see src/shared/utilities/zxcvbn.ts)
  const activeKdfProfile = useActiveKdfProfile()
  const passphraseInputRef = useRef<PassphraseInputWithStrengthRef>(null)
  const form = useForm({
    initialValues: initialValues(defaultSlot),
    validate: {
      filename: (value) => {
        if (!value || value === "") {
          return "Filename required"
        }
        return null
      },
      passphrase: (value, values) => {
        const result = zxcvbn(value, activeKdfProfile)
        if (!value || value === "") {
          return t("common.passphraseRequired")
        } else if (
          result.strength < minimumPassphraseStrength &&
          values.weakPassphraseAllowedFor !== value
        ) {
          return t("common.passphraseTooWeak")
        }
        return null
      },
    },
  })
  // The YubiKey step appears only when the hardware reports it is awaiting
  // touch (the key is blinking at that exact moment) — no-touch slots
  // derive without any step (see onTouchRequired in
  // src/utilities/yubikey/otp.ts)
  const [touchAwaited, setTouchAwaited] = useState(false)
  useEffect(() => {
    return window.api.events.yubikeyTouchRequired(() => {
      setTouchAwaited(true)
    })
  }, [])
  const handleSubmit = useCallback(() => {
    const validation = form.validate()
    if (validation.hasErrors === false) {
      // Reset here rather than syncing state in an effect — a stale value
      // cannot render, as the step also requires isLoading
      setTouchAwaited(false)
      if (form.values.yubikey === true) {
        setDefaultSlot(form.values.slot)
        // Updating the baseline keeps resets restoring the new default slot
        form.setInitialValues(initialValues(form.values.slot))
      }
      props.onSubmit(form.values)
    } else {
      // A weak passphrase blocks submission until allowed — the disclaimer
      // is the decision point, requested here as well as on blur so Enter
      // (which never blurs the field) reaches it
      passphraseInputRef.current?.promptWeakPassphrase()
    }
  }, [form, props, setDefaultSlot])
  // A modal over this modal — accepted until the standalone archive
  // feature moves to a route of its own and the form becomes a page
  const [weakPassphraseDisclaimerOpened, setWeakPassphraseDisclaimerOpened] =
    useState(false)
  const handleWeakPassphraseAllow = useCallback(() => {
    form.setFieldValue("weakPassphraseAllowedFor", form.values.passphrase)
    // Clears the too-weak error the blocked submission left behind
    form.clearFieldError("passphrase")
    setWeakPassphraseDisclaimerOpened(false)
  }, [form])
  const handleWeakPassphraseEdit = useCallback(() => {
    setWeakPassphraseDisclaimerOpened(false)
    // Without waiting for the close transition — the trap only scopes
    // Tab, so it does not pull focus back while the modal fades
    passphraseInputRef.current?.focus()
  }, [])
  const handleWeakPassphraseReset = useCallback(() => {
    form.setFieldValue("weakPassphraseAllowedFor", null)
  }, [form])
  const handleClose = useCallback(() => {
    setWeakPassphraseDisclaimerOpened(false)
    props.onClose()
  }, [props])
  // The form resets once the modal has disappeared — resetting on close
  // would empty the fields in view while the modal animates out
  const handleExitTransitionEnd = useCallback(() => {
    form.reset()
    props.onReset?.()
  }, [form, props])
  const handleYubikeyChange = useCallback(
    (checked: boolean) => {
      form.setFieldValue("yubikey", checked)
    },
    [form]
  )
  const handleSlotChange = useCallback(
    (slot: "1" | "2") => {
      form.setFieldValue("slot", slot)
    },
    [form]
  )
  useEffect(() => {
    if (Object.keys(form.errors).length > 0) {
      form.validate()
    }
    // The profile is a dependency too — toggling Paranoid mode can clear
    // (or restore) a passphrase-too-weak error without an edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language, activeKdfProfile])
  return (
    <Modal
      centered
      onClose={handleClose}
      onExitTransitionEnd={handleExitTransitionEnd}
      opened={props.opened}
      title={t(
        "components.createStandaloneArchiveModal.createStandaloneArchive"
      )}
      styles={{
        title: {
          fontWeight: "bold",
          lineHeight: "24px",
        },
      }}
    >
      {touchAwaited === true && props.isLoading === true ? (
        <YubiKeyTouchPrompt />
      ) : (
        <form
          onSubmit={(event) => {
            // Wrapped at event time: handleSubmit reaches the passphrase
            // input through a ref, which render must not read
            form.onSubmit(handleSubmit, handleSubmit)(event)
          }}
        >
          <TextInput
            data-autofocus
            label={t("components.createStandaloneArchiveModal.filename")}
            placeholder={t(
              "components.createStandaloneArchiveModal.typeFilename"
            )}
            required
            rightSection={<Text size="xs">.superbacked</Text>}
            rightSectionPointerEvents="none"
            rightSectionWidth={100}
            {...form.getInputProps("filename", { withFocus: false })}
          />
          <Space h="lg" />
          <PassphraseInputWithStrength
            key="standaloneArchivePassphrase"
            ref={passphraseInputRef}
            kdfProfile={activeKdfProfile}
            label={t("common.passphrase")}
            placeholder={t("common.typePassphrase")}
            required
            generatePassphrase={async () => {
              const passphrase = await window.api.invoke.generatePassphrase()
              form.setFieldValue("passphrase", passphrase)
              return passphrase
            }}
            onWeakPassphrasePrompt={() => {
              setWeakPassphraseDisclaimerOpened(true)
            }}
            onWeakPassphraseReset={handleWeakPassphraseReset}
            weakPassphraseAllowedFor={form.values.weakPassphraseAllowedFor}
            {...form.getInputProps("passphrase", { withFocus: false })}
          />
          <Space h="lg" />
          <YubiKeyProtection
            checked={form.values.yubikey}
            disabled={props.isLoading}
            label={t("common.protectWithYubiKey")}
            onChange={handleYubikeyChange}
            onSlotChange={handleSlotChange}
            slot={form.values.slot}
          />
          {form.values.yubikey === true ? (
            <Fragment>
              <Space h="sm" />
              <Text c="dimmed" size="xs">
                {t(
                  "components.createStandaloneArchiveModal.restoringRequiresYubiKey"
                )}
              </Text>
            </Fragment>
          ) : null}
          <Space h="xl" />
          {props.error ? (
            <Fragment>
              <Text c="red" role="alert" size="sm">
                {t(props.error)}
              </Text>
              <Space h="md" />
            </Fragment>
          ) : null}
          <Group justify="flex-end">
            <Button
              disabled={props.isLoading}
              loading={props.isLoading}
              onClick={handleSubmit}
              variant="signatureGradient"
            >
              {t("components.createStandaloneArchiveModal.createArchive")}
            </Button>
          </Group>
        </form>
      )}
      <WeakPassphraseDisclaimerModal
        onAllow={handleWeakPassphraseAllow}
        onEditPassphrase={handleWeakPassphraseEdit}
        opened={weakPassphraseDisclaimerOpened}
      />
    </Modal>
  )
}

export default CreateStandaloneArchiveModal
