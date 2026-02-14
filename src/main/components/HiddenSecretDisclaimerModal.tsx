import { Button, Group, Modal, Space, Text } from "@mantine/core"
import { FunctionComponent } from "react"
import { useTranslation } from "react-i18next"

interface HiddenSecretDisclaimerModalProps {
  opened: boolean
  onClose: () => void
  onConfirm: () => void
}

const HiddenSecretDisclaimerModal: FunctionComponent<
  HiddenSecretDisclaimerModalProps
> = (props) => {
  const { t } = useTranslation()

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
      <Text size="sm">
        {t("components.hiddenSecretDisclaimerModal.description")}
      </Text>
      <Space h="lg" />
      <Group justify="flex-end">
        <Button onClick={props.onConfirm} variant="signatureGradient">
          {t("common.gotIt")}
        </Button>
      </Group>
    </Modal>
  )
}

export default HiddenSecretDisclaimerModal
