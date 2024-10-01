import React, { FunctionComponent } from "react"
import { useTranslation } from "react-i18next"
import { Modal } from "@mantine/core"

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
      overlayBlur={4}
      title={t("headsUp")}
      styles={{
        title: {
          fontWeight: "bold",
        },
      }}
    >
      {props.error}
    </Modal>
  )
}

export default ErrorModal
