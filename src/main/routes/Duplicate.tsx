import { useState, useCallback, Fragment } from "react"

import { ValidateTranslationKeys } from "@/src/@types/react-i18next"
import { Qr } from "@/src/create"
import ErrorModal from "@/src/main/components/ErrorModal"
import Create from "@/src/main/routes/Create"
import Restore, { HandlePayload } from "@/src/main/routes/Restore"

const Duplicate = () => {
  const [error, setError] =
    useState<null | ValidateTranslationKeys<"routes.duplicate.couldNotDuplicateBlock">>(
      null
    )
  const [showError, setShowError] = useState(false)
  const [qr, setQr] = useState<null | Qr>(null)

  const handlePayload: HandlePayload = useCallback(async (payload) => {
    const result = await window.api.duplicate(payload)
    if (result.success === false) {
      setError("routes.duplicate.couldNotDuplicateBlock")
      setShowError(true)
      return false
    }
    setQr(result.qr)
    return true
  }, [])

  if (qr) {
    return <Create exportMode qrs={[qr]} />
  }

  return (
    <Fragment>
      <Restore exportMode handlePayload={handlePayload} />
      <ErrorModal
        error={error}
        opened={showError}
        onClose={() => setShowError(false)}
      />
    </Fragment>
  )
}

export default Duplicate
