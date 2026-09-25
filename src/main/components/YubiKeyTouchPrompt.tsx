import { Center, Space, Text } from "@mantine/core"
import { Fragment, FunctionComponent } from "react"
import { useTranslation } from "react-i18next"

import StyledYubiKeyIcon from "@/src/main/components/StyledYubiKeyIcon"

// The YubiKey touch step — rendered only while the hardware reports it is
// awaiting touch, so the key is blinking at that exact moment (see
// onTouchRequired in src/utilities/yubikey/otp.ts)
const YubiKeyTouchPrompt: FunctionComponent = () => {
  const { t } = useTranslation()
  return (
    <Fragment>
      <Space h="xl" />
      <Center>
        <StyledYubiKeyIcon />
      </Center>
      <Space h="xl" />
      <Text fw="bold" size="sm" ta="center">
        {t("common.touchYubiKey")}
      </Text>
      <Space h="xl" />
    </Fragment>
  )
}

export default YubiKeyTouchPrompt
