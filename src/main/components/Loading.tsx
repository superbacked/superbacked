import { Dialog, LoadingOverlay } from "@mantine/core"
import { Fragment, FunctionComponent } from "react"
import { useTranslation } from "react-i18next"

import { TranslationKey } from "@/src/shared/types/i18n"

interface LoadingProps {
  visible: boolean
  dialog?: TranslationKey
}

const Loading: FunctionComponent<LoadingProps> = (props) => {
  const { t } = useTranslation()

  return (
    <Fragment>
      <LoadingOverlay
        overlayProps={{
          blur: 4,
          color: "#000000",
        }}
        visible={props.visible}
        zIndex={500}
      />
      {props.dialog ? (
        <Dialog
          opened
          radius="sm"
          size="md"
          withCloseButton={false}
          zIndex={600}
        >
          {t(props.dialog)}
        </Dialog>
      ) : null}
    </Fragment>
  )
}

export default Loading
