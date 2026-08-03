import { Button, Group, Modal, Space, Text } from "@mantine/core"
import { FunctionComponent } from "react"
import { useTranslation } from "react-i18next"

import { TranslationKey } from "@/src/shared/types/i18n"

interface CreateDisclaimerModalProps {
  backupType: "standard" | "2of3" | "3of5" | "4of7"
  detachedArchiveCount?: number
  secretCount?: number
  // 1-based positions of YubiKey-protected secrets, in creation order
  yubikeyProtectedPositions?: number[]
  opened: boolean
  onClose: () => void
  onConfirm: () => void
}

const CreateDisclaimerModal: FunctionComponent<CreateDisclaimerModalProps> = (
  props
) => {
  const { i18n, t } = useTranslation()

  const secretCount = props.secretCount ?? 1
  const detachedArchiveCount = props.detachedArchiveCount ?? 0
  const yubikeyProtectedPositions = props.yubikeyProtectedPositions ?? []
  const yubikeyProtectedCount = yubikeyProtectedPositions.length

  let descriptionKey: TranslationKey
  // Drives plural selection — the secret count everywhere, except the
  // mixed-protection sentences whose plural noun is the protected secrets
  let descriptionCount = secretCount
  if (
    props.backupType === "standard" &&
    yubikeyProtectedCount > 0 &&
    yubikeyProtectedCount === secretCount
  ) {
    // YubiKey protection applies to standard blocks only — with every
    // secret protected, the requirement reads collectively
    if (detachedArchiveCount === 0) {
      descriptionKey =
        "components.createDisclaimerModal.standardWithYubiKeyDescription"
    } else if (detachedArchiveCount === 1) {
      descriptionKey =
        "components.createDisclaimerModal.standardWithOneDetachedArchiveAndYubiKeyDescription"
    } else {
      descriptionKey =
        "components.createDisclaimerModal.standardWithMultipleDetachedArchivesAndYubiKeyDescription"
    }
  } else if (props.backupType === "standard" && yubikeyProtectedCount > 0) {
    // Some secrets protected, others not — the YubiKey clause names the
    // protected secrets by position so the universal requirements are not
    // overstated
    descriptionCount = yubikeyProtectedCount
    if (detachedArchiveCount === 0) {
      descriptionKey =
        "components.createDisclaimerModal.standardWithSomeYubiKeyDescription"
    } else if (detachedArchiveCount === 1) {
      descriptionKey =
        "components.createDisclaimerModal.standardWithOneDetachedArchiveAndSomeYubiKeyDescription"
    } else {
      descriptionKey =
        "components.createDisclaimerModal.standardWithMultipleDetachedArchivesAndSomeYubiKeyDescription"
    }
  } else if (detachedArchiveCount === 0) {
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
      title={t(
        props.backupType === "standard"
          ? "components.createDisclaimerModal.createBlock"
          : "components.createDisclaimerModal.createBlockset"
      )}
      styles={{
        title: {
          fontWeight: "bold",
        },
      }}
    >
      <Text size="sm">
        {t(descriptionKey, {
          count: descriptionCount,
          positions: new Intl.ListFormat(i18n.language, {
            type: "conjunction",
          }).format(yubikeyProtectedPositions.map(String)),
          totalCount: secretCount,
        })}
      </Text>
      <Space h="xl" />
      <Group justify="flex-end">
        <Button onClick={props.onConfirm} variant="signatureGradient">
          {t("components.createDisclaimerModal.create")}
        </Button>
      </Group>
    </Modal>
  )
}

export default CreateDisclaimerModal
