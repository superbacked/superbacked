import { Button, Group, Modal, Space, Text } from "@mantine/core"
import { FunctionComponent } from "react"
import { useTranslation } from "react-i18next"

import { TranslationKey } from "@/src/shared/types/i18n"

interface CreateDisclaimerModalProps {
  backupType: "standard" | "2of3" | "3of5" | "4of7"
  detachedArchiveCount?: number
  hiddenSecretCount?: number
  opened: boolean
  onClose: () => void
  onConfirm: () => void
}

const CreateDisclaimerModal: FunctionComponent<CreateDisclaimerModalProps> = (
  props
) => {
  const { t } = useTranslation()

  const totalSecretCount = 1 + (props.hiddenSecretCount ?? 0)
  const detachedArchiveCount = props.detachedArchiveCount ?? 0

  let descriptionKey: TranslationKey
  if (detachedArchiveCount === 0) {
    descriptionKey = `components.createDisclaimerModal.${props.backupType}Description`
  } else if (detachedArchiveCount === 1) {
    descriptionKey = `components.createDisclaimerModal.${props.backupType}WithOneDetachedArchiveDescription`
  } else {
    descriptionKey = `components.createDisclaimerModal.${props.backupType}WithMultipleDetachedArchivesDescription`
  }

  return (
    <Modal
      centered
      onClose={props.onClose}
      opened={props.opened}
      size="sm"
      title={t("common.important")}
      styles={{
        title: {
          fontWeight: "bold",
        },
      }}
    >
      <Text size="sm">{t(descriptionKey, { count: totalSecretCount })}</Text>
      <Space h="lg" />
      <Group justify="flex-end">
        <Button onClick={props.onConfirm} variant="signatureGradient">
          {t("common.gotIt")}
        </Button>
      </Group>
    </Modal>
  )
}

export default CreateDisclaimerModal
