import { Center, Modal, Space, Text, Title } from "@mantine/core"
import { FunctionComponent, useEffect, useState } from "react"
import SuperbackedIcon from "./superbacked.svg"

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
      overlayBlur={4}
      sx={{ zIndex: 500 }}
    >
      <Center>
        <SuperbackedIcon style={{ width: "25%" }} />
      </Center>
      <Space h="lg" />
      <Title align="center">Superbacked</Title>
      <Text align="center" color="dimmed">
        Version: {window.api.version()}
      </Text>
      <Space h="lg" />
      <Text align="center" size="sm" weight="bold">
        Copyright (c) Superbacked, Inc.
      </Text>
      <Text align="center" size="sm" weight="bold">
        All rights reserved
      </Text>
      <Space h="xl" />
    </Modal>
  )
}

export default About
