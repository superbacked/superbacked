import { QRCodeSVG } from "qrcode.react"
import React, { FunctionComponent } from "react"
import { styled } from "styled-components"

const StyledQRXCodeSVG = styled(QRCodeSVG)`
  width: 100%;
  height: auto;
`

interface QRCodeProps {
  value: string
}

const QRCode: FunctionComponent<QRCodeProps> = (props) => {
  return (
    <StyledQRXCodeSVG
      boostLevel={false}
      level="L"
      marginSize={0}
      size={1024}
      value={props.value}
    />
  )
}

export default QRCode
