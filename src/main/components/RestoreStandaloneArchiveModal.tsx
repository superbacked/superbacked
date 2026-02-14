import { Button, Group, Modal, PasswordInput, Space, Text } from "@mantine/core"
import { useForm } from "@mantine/form"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import { Fragment, FunctionComponent, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"

import { TranslationKey } from "@/src/shared/types/i18n"

interface RestoreStandaloneArchiveModalProps {
  opened: boolean
  onAddToArchive: () => void
  onClose: () => void
  onReset?: () => void
  onSubmit: (passphrase: string) => void
  isUnlocking: boolean
  error?: null | TranslationKey
}

const RestoreStandaloneArchiveModal: FunctionComponent<
  RestoreStandaloneArchiveModalProps
> = (props) => {
  const { i18n, t } = useTranslation()
  const form = useForm({
    initialValues: {
      passphrase: "",
    },
    validate: {
      passphrase: (value) => {
        if (!value || value === "") {
          return t("common.passphraseRequired")
        }
        return null
      },
    },
  })
  const handleAddToArchive = useCallback(() => {
    form.reset()
    props.onReset?.()
    props.onAddToArchive()
  }, [form, props])
  const handleRestore = useCallback(() => {
    const validation = form.validate()
    if (validation.hasErrors === false) {
      props.onSubmit(form.values.passphrase)
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
        "components.restoreStandaloneArchiveModal.restoreStandaloneArchive"
      )}
      styles={{
        title: {
          fontWeight: "bold",
        },
      }}
    >
      <form onSubmit={form.onSubmit(handleRestore)}>
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
            onClick={handleAddToArchive}
            variant="default"
          >
            {t("components.fileManager.addToStandaloneArchive")}
          </Button>
          <Button
            disabled={props.isUnlocking}
            loading={props.isUnlocking}
            onClick={handleRestore}
            variant="signatureGradient"
          >
            {t("components.restoreStandaloneArchiveModal.restore")}
          </Button>
        </Group>
      </form>
    </Modal>
  )
}

export default RestoreStandaloneArchiveModal
