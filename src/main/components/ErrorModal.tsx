import { Modal, MantineSize } from "@mantine/core"
import { FunctionComponent } from "react"
import { useTranslation } from "react-i18next"

import { TranslationKey } from "@/src/@types/react-i18next"

interface ErrorModalProps {
  error: null | TranslationKey
  opened: boolean
  onClose: () => void
  size?: MantineSize
}

/**
 * Error modal component for displaying translated error messages
 *
 * @param error - Translation key of the error message or null (required)
 * @param opened - Whether the modal is visible (required)
 * @param onClose - Callback when modal is closed (required)
 * @param size - Size of the modal (optional, defaults to "sm")
 *
 * @example
 * ```tsx
 * const [error, setError] = useState<TranslationKey | null>(null)
 * const [showError, setShowError] = useState(false)
 *
 * <ErrorModal
 *   error={error}
 *   opened={showError}
 *   onClose={() => setShowError(false)}
 * />
 * ```
 */
const ErrorModal: FunctionComponent<ErrorModalProps> = (props) => {
  const { t } = useTranslation()
  return (
    <Modal
      centered
      onClose={props.onClose}
      opened={props.opened ? props.error !== null : false}
      size={props.size ?? "sm"}
      title={t("components.errorModal.headsUp")}
    >
      {props.error ? t(props.error) : null}
    </Modal>
  )
}

export default ErrorModal
