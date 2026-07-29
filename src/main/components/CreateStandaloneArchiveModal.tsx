import { Button, Group, Modal, Space, Text, TextInput } from "@mantine/core"
import { useForm } from "@mantine/form"
import {
  Fragment,
  FunctionComponent,
  useCallback,
  useEffect,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import PassphraseInputWithStrength from "@/src/main/components/PassphraseInputWithStrength"
import YubiKeyProtection from "@/src/main/components/YubiKeyProtection"
import YubiKeyTouchPrompt from "@/src/main/components/YubiKeyTouchPrompt"
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
    yubikey: false,
  }
}

const CreateStandaloneArchiveModal: FunctionComponent<
  CreateStandaloneArchiveModalProps
> = (props) => {
  const { i18n, t } = useTranslation()
  const { defaultSlot, setDefaultSlot } = useDefaultYubiKeySlot()
  const form = useForm({
    initialValues: initialValues(defaultSlot),
    validate: {
      filename: (value) => {
        if (!value || value === "") {
          return "Filename required"
        }
        return null
      },
      passphrase: (value) => {
        const result = zxcvbn(value)
        if (!value || value === "") {
          return t("common.passphraseRequired")
        } else if (result.strength < minimumPassphraseStrength) {
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
    }
  }, [form, props, setDefaultSlot])
  const handleClose = useCallback(() => {
    form.reset()
    props.onReset?.()
    props.onClose()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language])
  return (
    <Modal
      centered
      onClose={handleClose}
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
        <form onSubmit={form.onSubmit(handleSubmit)}>
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
            label={t("common.passphrase")}
            placeholder={t("common.typePassphrase")}
            required
            generatePassphrase={async () => {
              const passphrase = await window.api.invoke.generatePassphrase()
              form.setFieldValue("passphrase", passphrase)
              return passphrase
            }}
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
    </Modal>
  )
}

export default CreateStandaloneArchiveModal
