import React, { FunctionComponent, useEffect, useRef, useState } from "react"
import QrCodeModal from "./components/QrCodeModal"

const ShowSelectionAsQrCode: FunctionComponent = () => {
  const showQrCodeModalRef = useRef(false)
  const [showQrCodeModal, setShowQrCodeModal] = useState(false)
  const [value, setValue] = useState<string>(null)
  const customSetShowQr = (value: boolean) => {
    showQrCodeModalRef.current = value
    setShowQrCodeModal(value)
  }
  const handleSelectionChange = () => {
    const selection = document.getSelection()
    const selectedText = selection.toString()
    if (selectedText !== "") {
      window.api.enableModes(["select"])
    } else {
      window.api.disableModes(["select"])
    }
    if (showQrCodeModalRef.current === false) {
      setValue(selectedText)
    }
  }
  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange)
    const removeListener = window.api.menuShowSelectionAsQrCode(() => {
      customSetShowQr(true)
    })
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      removeListener()
    }
  }, [])
  return (
    <QrCodeModal
      opened={showQrCodeModal}
      onClose={() => {
        customSetShowQr(false)
      }}
      value={value}
    />
  )
}

export default ShowSelectionAsQrCode
