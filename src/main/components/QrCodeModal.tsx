import styled from "@emotion/styled"
import { Modal } from "@mantine/core"
import { FunctionComponent } from "react"

import QrCode from "@/src/block/components/QrCode"

const size = 330

const ModalContainer = styled.div`
  position: relative;
  height: ${size}px;
  background-color: white;
  padding: 10px;
`

interface QrCodeModalProps {
  opened: boolean
  onClose: () => void
  value: string
}

const QrCodeModal: FunctionComponent<QrCodeModalProps> = (props) => {
  return (
    <Modal
      centered
      onClose={props.onClose}
      opened={props.opened}
      padding={0}
      size={`${size}px`}
      withCloseButton={false}
    >
      <ModalContainer>
        {/* Deliberately independent of qrCodeEcc — selection QR codes are
            displayed on screen, not printed or saved as files */}
        <QrCode ecc="low" value={props.value} />
      </ModalContainer>
    </Modal>
  )
}

export default QrCodeModal
