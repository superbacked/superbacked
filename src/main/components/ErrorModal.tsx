import { Modal } from "@mantine/core"
import { FunctionComponent } from "react"
import { useTranslation } from "react-i18next"

interface ErrorModalProps {
  error: string
  opened: boolean
  onClose: () => void
}

const ErrorModal: FunctionComponent<ErrorModalProps> = (props) => {
  const { t } = useTranslation()
  return (
    <Modal
      centered
      onClose={props.onClose}
      opened={props.opened}
      title={t("headsUp")}
    >
      {props.error}
    </Modal>
  )
}

export default ErrorModal
