import { FunctionComponent, useCallback, useEffect, useState } from "react"

import QrCodeModal from "@/src/main/components/QrCodeModal"

const ShowSelectionAsQrCode: FunctionComponent = () => {
  const [showQrCodeModal, setShowQrCodeModal] = useState(false)
  const [value, setValue] = useState<string | null>(null)

  const handleSelectionChange = useCallback(() => {
    const selection = document.getSelection()
    if (!selection) {
      return
    }
    const selectedText = selection.toString()
    if (selectedText !== "") {
      window.api.enableModes(["select"])
    } else {
      window.api.disableModes(["select"])
    }
  }, [])

  const handleShowModal = useCallback(() => {
    const selection = document.getSelection()
    if (selection) {
      const selectedText = selection.toString()
      setValue(selectedText)
      setShowQrCodeModal(true)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange)
    const removeListener = window.api.menuShowSelectionAsQrCode(handleShowModal)
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      removeListener()
    }
  }, [handleSelectionChange, handleShowModal])

  if (!value) {
    return null
  }

  return (
    <QrCodeModal
      opened={showQrCodeModal}
      onClose={() => setShowQrCodeModal(false)}
      value={value}
    />
  )
}

export default ShowSelectionAsQrCode
