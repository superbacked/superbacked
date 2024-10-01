import React, { useState } from "react"
import { useTranslation } from "react-i18next"
import { Qr } from "../../create"
import ErrorModal from "../components/ErrorModal"
import Create from "./Create"
import Restore, { HandlePayload } from "./Restore"

const Duplicate = () => {
  const { t } = useTranslation()
  const [error, setError] = useState<"couldNotDuplicateBlock">()
  const [showError, setShowError] = useState(false)
  const [qr, setQr] = useState<Qr>(null)
  const handlePayload: HandlePayload = async (payload) => {
    const { error, qr } = await window.api.duplicate(payload)
    if (error) {
      setError("couldNotDuplicateBlock")
      setShowError(true)
      return false
    } else {
      setQr(qr)
      return true
    }
  }
  if (!qr) {
    if (showError === false) {
      return <Restore exportMode handlePayload={handlePayload} />
    } else {
      return (
        <ErrorModal
          error={t(error)}
          opened={showError}
          onClose={() => {
            setShowError(false)
          }}
        />
      )
    }
  } else {
    return <Create exportMode qrs={[qr]} />
  }
}

export default Duplicate
