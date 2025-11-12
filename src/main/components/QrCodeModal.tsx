import styled from "@emotion/styled"
import { Modal } from "@mantine/core"
import { FunctionComponent } from "react"

import QRCode from "@/src/block/components/QRCode"

const size = 330

const ModalContainer = styled.div`
  position: relative;
  height: ${size}px;
  background-color: white;
  padding: 10px;
`

interface QrCodeModalProps {
  closeOnClickOutside?: boolean
  opened: boolean
  onClose: () => void
  value: string
}

const QrCodeModal: FunctionComponent<QrCodeModalProps> = (props) => {
  return (
    <Modal
      centered
      closeOnClickOutside={props.closeOnClickOutside}
      onClose={props.onClose}
      opened={props.opened}
      padding={0}
      size={`${size}px`}
      withCloseButton={false}
    >
      <ModalContainer>
        <QRCode value={props.value} />
      </ModalContainer>
    </Modal>
  )
}

export default QrCodeModal
