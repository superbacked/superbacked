import { Button, Group, Modal, Space, Text } from "@mantine/core"
import { FunctionComponent } from "react"
import { useTranslation } from "react-i18next"

interface WeakPassphraseDisclaimerModalProps {
  onAllow: () => void
  // Also the dismissal (Escape, click outside) — nothing is cancelled,
  // the user returns to the field
  onEditPassphrase: () => void
  opened: boolean
}

// The strength gate override (see
// docs/technical-documentation/passphrase-strength.md) — shared by every
// form accepting a new passphrase. Changing the passphrase is the primary
// action: it is the expected outcome, allowing it the exception
const WeakPassphraseDisclaimerModal: FunctionComponent<
  WeakPassphraseDisclaimerModalProps
> = (props) => {
  const { t } = useTranslation()
  return (
    <Modal
      centered
      onClose={props.onEditPassphrase}
      opened={props.opened}
      // The host focuses the passphrase field itself — the modal’s own
      // return focus would land on whatever took focus from the field
      returnFocus={false}
      size="sm"
      styles={{
        title: {
          fontWeight: "bold",
        },
      }}
      title={t("components.weakPassphraseDisclaimerModal.weakPassphrase")}
    >
      <Text size="sm">
        {t("components.weakPassphraseDisclaimerModal.weakPassphraseWarning")}
      </Text>
      <Space h="xl" />
      <Group justify="flex-end">
        <Button onClick={props.onAllow} variant="default">
          {t("components.weakPassphraseDisclaimerModal.useWeakPassphrase")}
        </Button>
        <Button onClick={props.onEditPassphrase} variant="signatureGradient">
          {t("components.weakPassphraseDisclaimerModal.edit")}
        </Button>
      </Group>
    </Modal>
  )
}

export default WeakPassphraseDisclaimerModal
