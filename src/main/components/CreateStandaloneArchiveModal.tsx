import {
  Button,
  Center,
  Group,
  Modal,
  SegmentedControl,
  Space,
  Switch,
  Text,
  TextInput,
} from "@mantine/core"
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
import StyledYubiKeyIcon from "@/src/main/components/StyledYubiKeyIcon"
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
  const form = useForm({
    initialValues: initialValues(
      window.api.invokeSync.getConfig("yubikey")?.challengeResponseSlot ?? "2"
    ),
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
        // Remember the slot as the next default, like the selected
        // printer — only when actually used, so the hidden control never
        // overwrites a real choice. Updating the baseline keeps resets
        // restoring the remembered slot (the restore modal catches up
        // from config on restart or its own first use)
        window.api.invokeSync.setConfig("yubikey", {
          ...window.api.invokeSync.getConfig("yubikey"),
          challengeResponseSlot: form.values.slot,
        })
        form.setInitialValues(initialValues(form.values.slot))
      }
      props.onSubmit(form.values)
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
          <Group justify="space-between">
            <Switch
              checked={form.values.yubikey}
              label={t("common.protectWithYubiKey")}
              onChange={(event) =>
                form.setFieldValue("yubikey", event.currentTarget.checked)
              }
              withThumbIndicator={false}
            />
            {/* Always rendered so the row keeps the height of its tallest
              child — mounting on toggle would grow the modal */}
            <SegmentedControl
              data={[
                { label: t("common.slot1"), value: "1" },
                { label: t("common.slot2"), value: "2" },
              ]}
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
