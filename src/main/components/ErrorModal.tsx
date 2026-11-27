import { MantineSize, Modal, Text } from "@mantine/core"
import { FunctionComponent, useState } from "react"
import { useTranslation } from "react-i18next"

import { useTrapFocusOnceWindowFocused } from "@/src/main/utilities/windowFocus"
import {
  TranslationKey,
  ValidateTranslationKeys,
} from "@/src/shared/types/i18n"

export type ErrorState<TKeys extends TranslationKey = TranslationKey> = {
  message: ValidateTranslationKeys<TKeys>
  count?: number
}

interface ErrorModalProps {
  error: null | ErrorState
  onClose: () => void
  size?: MantineSize
}

const ErrorModal: FunctionComponent<ErrorModalProps> = (props) => {
  const { t } = useTranslation()
  const [displayedError, setDisplayedError] = useState(props.error)
  // Opened by a failed drop among other things — the close button takes
  // focus only once the window has it, so Enter cannot reach the file
  // manager instead (see src/main/utilities/windowFocus.ts)
  const trapFocus = useTrapFocusOnceWindowFocused(props.error !== null)

  // Preserve error message during modal close animation
  // When error becomes null, modal starts closing but displayedError keeps the message visible
  if (props.error !== null && props.error !== displayedError) {
    setDisplayedError(props.error)
  }

  return (
    <Modal
      centered
      onClose={props.onClose}
      opened={props.error !== null}
      size={props.size ?? "sm"}
      title={t("components.errorModal.headsUp")}
      trapFocus={trapFocus}
    >
      <Text size="sm">
        {displayedError
          ? t(displayedError.message, { count: displayedError.count })
          : null}
      </Text>
    </Modal>
  )
}

export default ErrorModal
