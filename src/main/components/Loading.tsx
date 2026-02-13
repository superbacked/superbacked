import { Center, LoadingOverlay, Text } from "@mantine/core"
import { Fragment, FunctionComponent } from "react"
import { useTranslation } from "react-i18next"

import { TranslationKey } from "@/src/shared/types/i18n"

interface LoadingProps {
  visible: boolean
  dialog?: TranslationKey
  count?: number
}

const Loading: FunctionComponent<LoadingProps> = (props) => {
  const { t } = useTranslation()

  return (
    <Fragment>
      <LoadingOverlay
        loaderProps={{ size: "sm" }}
        overlayProps={{
          blur: 4,
          color: "#000000",
        }}
        visible={props.visible}
        zIndex={500}
      />
      {props.dialog && props.visible ? (
        <Center
          styles={{
            root: {
              inset: 0,
              position: "fixed",
              paddingTop: "80px",
              zIndex: 600,
            },
          }}
        >
          <Text c="pink" fw="bold" size="xs">
            {t(props.dialog, { count: props.count })}…
          </Text>
        </Center>
      ) : null}
    </Fragment>
  )
}

export default Loading
