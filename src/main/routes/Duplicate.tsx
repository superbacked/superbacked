import { Fragment, useCallback, useState } from "react"

import { Qr } from "@/src/handlers/create"
import ErrorModal, { ErrorState } from "@/src/main/components/ErrorModal"
import Create from "@/src/main/routes/Create"
import Restore, { HandlePayload } from "@/src/main/routes/Restore"

const Duplicate = () => {
  const [error, setError] =
    useState<null | ErrorState<"routes.duplicate.couldNotDuplicateBlock">>(null)
  const [qr, setQr] = useState<null | Qr>(null)

  const handlePayload: HandlePayload = useCallback(async (payload) => {
    const result = await window.api.invoke.duplicate(payload)
    if (result.success === false) {
      setError({ message: "routes.duplicate.couldNotDuplicateBlock" })
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
      <ErrorModal error={error} onClose={() => setError(null)} />
    </Fragment>
  )
}

export default Duplicate
