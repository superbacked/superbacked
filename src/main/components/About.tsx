import { Center, Modal, Space, Text, Title } from "@mantine/core"
import { FunctionComponent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import SuperbackedIcon from "@/src/main/superbacked.svg"

const About: FunctionComponent = () => {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    const removeListener = window.api.events.menuAbout(() => {
      setOpened(true)
    })
    return () => {
      removeListener()
    }
  }, [])
  return (
    <Modal
      centered
      lockScroll={false}
      opened={opened}
      onClose={() => {
        setOpened(false)
      }}
      zIndex={1000}
    >
      <Center>
        <SuperbackedIcon style={{ width: "25%" }} />
      </Center>
      <Space h="lg" />
      <Title ta="center">Superbacked</Title>
      <Text c="dimmed" ta="center">
        {t("components.about.version")}: {window.api.invokeSync.getVersion()}
      </Text>
      <Space h="lg" />
      <Text fw="bold" size="sm" ta="center">
        {t("components.about.copyright")} (c) Superbacked, Inc.
      </Text>
      <Text fw="bold" size="sm" ta="center">
        {t("components.about.allRightsReserved")}
      </Text>
      <Space h="xl" />
    </Modal>
  )
}

export default About
