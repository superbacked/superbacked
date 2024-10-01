import React, { FunctionComponent } from "react"
import { styled } from "styled-components"
import { QRCodeSVG } from "qrcode.react"

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
      includeMargin={false}
      level="L"
      size={1024}
      value={props.value}
    />
  )
}

export default QRCode
