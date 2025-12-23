import { FunctionComponent, useEffect, useState } from "react"

import { TranslationKey } from "@/src/@types/react-i18next"
import Loading from "@/src/main/components/Loading"

const Loader: FunctionComponent = () => {
  const [visible, setVisible] = useState(false)
  const [dialog, setDialog] = useState<TranslationKey>()
  useEffect(() => {
    const removeListener = window.api.events.appLoading(
      (visibleUpdate: boolean, dialogUpdate?: TranslationKey) => {
        setVisible(visibleUpdate)
        setDialog(dialogUpdate)
      }
    )
    return () => {
      removeListener()
    }
  }, [])
  return <Loading visible={visible} dialog={dialog} />
}

export default Loader
