import encodeQR from "qr"
import { FunctionComponent, useMemo } from "react"

interface QRCodeProps {
  value: string
}

const QRCode: FunctionComponent<QRCodeProps> = (props) => {
  const { path, size } = useMemo(() => {
    const raw = encodeQR(props.value, "raw", { ecc: "low" })
    const qrSize = raw.length
    let qrPath = ""
    for (let y = 0; y < qrSize; y++) {
      for (let x = 0; x < qrSize; x++) {
        if (raw[y]?.[x]) {
          qrPath += `M${x} ${y}h1v1h-1z`
        }
      }
    }
    return { path: qrPath, size: qrSize }
  }, [props.value])

  return (
    <svg viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
      <path d={path} fill="black" />
    </svg>
  )
}

export default QRCode
