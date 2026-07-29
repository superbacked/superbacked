import { Button, Group, Modal, PasswordInput, Space, Text } from "@mantine/core"
import { useForm } from "@mantine/form"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import {
  Fragment,
  FunctionComponent,
  useCallback,
  useEffect,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import YubiKeyProtection from "@/src/main/components/YubiKeyProtection"
import YubiKeyTouchPrompt from "@/src/main/components/YubiKeyTouchPrompt"
import { useDefaultYubiKeySlot } from "@/src/main/utilities/useDefaultYubiKeySlot"
import { TranslationKey } from "@/src/shared/types/i18n"

interface PassphraseModalProps {
  opened: boolean
  onClose: () => void
  onSubmit: (
    passphrase: string,
    options: { slot: "1" | "2"; yubikey: boolean }
  ) => void
  onReset?: () => void
  isUnlocking: boolean
  error?: null | TranslationKey
  errorCount?: number
}

const initialValues = (slot: "1" | "2") => {
  return {
    passphrase: "",
    slot: slot,
    yubikey: false,
  }
}

const PassphraseModal: FunctionComponent<PassphraseModalProps> = (props) => {
  const { i18n, t } = useTranslation()
  const { defaultSlot, setDefaultSlot } = useDefaultYubiKeySlot()
  const form = useForm({
    initialValues: initialValues(defaultSlot),
    validate: {
      passphrase: (value) => {
        if (!value || value === "") {
          return t("common.passphraseRequired")
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
  const handleUnlock = useCallback(() => {
    const validation = form.validate()
    if (validation.hasErrors === false) {
      // Reset here rather than syncing state in an effect — a stale value
      // cannot render, as the step also requires isUnlocking
      setTouchAwaited(false)
      if (form.values.yubikey === true) {
        setDefaultSlot(form.values.slot)
        // Updating the baseline keeps resets restoring the new default slot
        form.setInitialValues(initialValues(form.values.slot))
      }
      props.onSubmit(form.values.passphrase, {
        slot: form.values.slot,
        yubikey: form.values.yubikey,
      })
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
      title={t("components.passphraseModal.unlockBlock")}
      styles={{
        title: {
          fontWeight: "bold",
        },
      }}
    >
      {touchAwaited === true && props.isUnlocking === true ? (
        <YubiKeyTouchPrompt />
      ) : (
        <form onSubmit={form.onSubmit(handleUnlock)}>
          <PasswordInput
            data-autofocus
            disabled={props.isUnlocking}
            label={t("common.passphrase")}
            placeholder={t("common.typePassphrase")}
            required
            spellCheck={false}
            visibilityToggleIcon={({ reveal }) =>
              reveal === true ? <IconEyeOff size={16} /> : <IconEye size={16} />
            }
            {...form.getInputProps("passphrase", { withFocus: false })}
          />
          <Space h="lg" />
          <YubiKeyProtection
            checked={form.values.yubikey}
            disabled={props.isUnlocking}
            label={t("common.protectedWithYubiKey")}
            onChange={handleYubikeyChange}
            onSlotChange={handleSlotChange}
            slot={form.values.slot}
          />
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
              disabled={props.isUnlocking}
              loading={props.isUnlocking}
              onClick={handleUnlock}
              variant="signatureGradient"
            >
              {t("components.passphraseModal.unlock")}
            </Button>
          </Group>
        </form>
      )}
    </Modal>
  )
}

export default PassphraseModal
