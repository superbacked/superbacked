import { Button, Group, Modal, Space, Text, TextInput } from "@mantine/core"
import { useForm } from "@mantine/form"
import { Fragment, FunctionComponent, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"

import PassphraseInputWithStrength from "@/src/main/components/PassphraseInputWithStrength"
import zxcvbn from "@/src/main/utilities/zxcvbn"
import { TranslationKey } from "@/src/shared/types/i18n"

interface CreateStandaloneArchiveModalProps {
  isLoading?: boolean
  opened: boolean
  onClose: () => void
  onSubmit: (label: { filename: string; passphrase: string }) => void
  onReset?: () => void
  error?: null | TranslationKey
  errorCount?: number
}

const CreateStandaloneArchiveModal: FunctionComponent<
  CreateStandaloneArchiveModalProps
> = (props) => {
  const { i18n, t } = useTranslation()
  const form = useForm({
    initialValues: {
      filename: "",
      passphrase: "",
    },
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
        } else if (result.strength < 50) {
          return t("common.passphraseTooWeak")
        }
        return null
      },
    },
  })
  const handleSubmit = useCallback(() => {
    const validation = form.validate()
    if (validation.hasErrors === false) {
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
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Text c="dimmed" size="xs">
          {t("components.featureDescriptionModal.standaloneArchiveDescription")}
        </Text>
        <Space h="lg" />
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
            const passphrase = await window.api.invoke.generatePassphrase(
              5,
              "eff_short_wordlist_1"
            )
            form.setFieldValue("passphrase", passphrase)
            return passphrase
          }}
          {...form.getInputProps("passphrase", { withFocus: false })}
        />
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
    </Modal>
  )
}

export default CreateStandaloneArchiveModal
