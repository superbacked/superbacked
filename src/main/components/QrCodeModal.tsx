import { Modal } from "@mantine/core"
import { QRCodeSVG } from "qrcode.react"
import React, { FunctionComponent } from "react"
import { styled } from "styled-components"

const size = 320

const ModalContainer = styled.div`
  position: relative;
  height: ${size}px;
`

const StyledQRXCodeSVG = styled(QRCodeSVG)`
  border-radius: 4px;
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
      overlayBlur={4}
      padding={0}
      size={`${size}px`}
      withCloseButton={false}
    >
      <ModalContainer>
        <StyledQRXCodeSVG
          boostLevel={false}
          level="L"
          marginSize={0}
          size={size}
          value={props.value}
        />
      </ModalContainer>
    </Modal>
  )
}

export default QrCodeModal
