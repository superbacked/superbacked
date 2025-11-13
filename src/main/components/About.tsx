import { Center, Modal, Space, Text, Title } from "@mantine/core"
import { FunctionComponent, useEffect, useState } from "react"

import SuperbackedIcon from "@/src/main/superbacked.svg"

const About: FunctionComponent = () => {
  const [showAbout, setShowAbout] = useState(false)
  useEffect(() => {
    const removeListener = window.api.menuAbout(() => {
      setShowAbout(true)
    })
    return () => {
      removeListener()
    }
  }, [])
  return (
    <Modal
      centered
      opened={showAbout}
      onClose={() => {
        setShowAbout(false)
      }}
      zIndex={400}
    >
      <Center>
        <SuperbackedIcon style={{ width: "25%" }} />
      </Center>
      <Space h="lg" />
      <Title ta="center">Superbacked</Title>
      <Text c="dimmed" ta="center">
        Version: {window.api.version()}
      </Text>
      <Space h="lg" />
      <Text fw="bold" size="sm" ta="center">
        Copyright (c) Superbacked, Inc.
      </Text>
      <Text fw="bold" size="sm" ta="center">
        All rights reserved
      </Text>
      <Space h="xl" />
    </Modal>
  )
}

export default About
