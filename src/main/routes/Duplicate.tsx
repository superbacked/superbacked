import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"

import { Qr } from "@/src/create"
import ErrorModal from "@/src/main/components/ErrorModal"
import Create from "@/src/main/routes/Create"
import Restore, { HandlePayload } from "@/src/main/routes/Restore"

const Duplicate = () => {
  const { t } = useTranslation()
  const [error, setError] = useState<"couldNotDuplicateBlock">()
  const [showError, setShowError] = useState(false)
  const [qr, setQr] = useState<Qr | null>(null)

  const handlePayload: HandlePayload = useCallback(async (payload) => {
    const result = await window.api.duplicate(payload)
    if (result.success === false) {
      setError("couldNotDuplicateBlock")
      setShowError(true)
      return false
    }
    setQr(result.qr)
    return true
  }, [])

  if (qr) {
    return <Create exportMode qrs={[qr]} />
  }

  if (error && showError) {
    return (
      <ErrorModal
        error={t(error)}
        opened={showError}
        onClose={() => setShowError(false)}
      />
    )
  }

  return <Restore exportMode handlePayload={handlePayload} />
}

export default Duplicate
