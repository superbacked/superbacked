import {
  Button,
  Center,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  Space,
  Switch,
  Text,
} from "@mantine/core"
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

import StyledYubiKeyIcon from "@/src/main/components/StyledYubiKeyIcon"
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
  const form = useForm({
    initialValues: initialValues(
      window.api.invokeSync.getConfig("yubikey")?.challengeResponseSlot ?? "2"
    ),
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
        // Remember the slot as the next default, like the selected
        // printer — only when actually used, so the hidden control never
        // overwrites a real choice. Updating the baseline keeps resets
        // restoring the remembered slot (the archive modals catch up
        // from config on restart or their own first use)
        window.api.invokeSync.setConfig("yubikey", {
          ...window.api.invokeSync.getConfig("yubikey"),
          challengeResponseSlot: form.values.slot,
        })
        form.setInitialValues(initialValues(form.values.slot))
      }
      props.onSubmit(form.values.passphrase, {
        slot: form.values.slot,
        yubikey: form.values.yubikey,
      })
    }
  }, [form, props])
  const handleClose = useCallback(() => {
    form.reset()
    props.onReset?.()
    props.onClose()
  }, [form, props])
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
      title={t("components.passphraseModal.enterPassphrase")}
      styles={{
        title: {
          fontWeight: "bold",
        },
      }}
    >
      {touchAwaited === true && props.isUnlocking === true ? (
        <Fragment>
          <Space h="xl" />
          <Center>
            <StyledYubiKeyIcon />
          </Center>
          <Space h="xl" />
          <Text fw="bold" size="sm" ta="center">
            {t("common.touchYubiKey")}
          </Text>
          <Space h="xl" />
        </Fragment>
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
          <Group justify="space-between">
            <Switch
              checked={form.values.yubikey}
              disabled={props.isUnlocking}
              label={t("common.protectedWithYubiKey")}
              onChange={(event) =>
                form.setFieldValue("yubikey", event.currentTarget.checked)
              }
              // The track transition exists for the on/off toggle, but the
              // disabled state swaps the track color through the same
              // property — without this, disabling fades over 150ms while
              // every other form element snaps
              styles={{
                track: props.isUnlocking === true ? { transition: "none" } : {},
              }}
              withThumbIndicator={false}
            />
            {/* Always rendered so the row keeps the height of its tallest
              child — mounting on toggle would grow the modal */}
            <SegmentedControl
              data={[
                { label: t("common.slot1"), value: "1" },
                { label: t("common.slot2"), value: "2" },
              ]}
              disabled={props.isUnlocking}
              onChange={(value) =>
                form.setFieldValue("slot", value as "1" | "2")
              }
              size="xs"
              style={{
                visibility: form.values.yubikey === true ? "visible" : "hidden",
              }}
              value={form.values.slot}
            />
          </Group>
          {props.error ? (
            <Fragment>
              <Space h="md" />
              <Text c="red" size="sm">
                {t(props.error)}
              </Text>
            </Fragment>
          ) : null}
          <Space h="xl" />
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
