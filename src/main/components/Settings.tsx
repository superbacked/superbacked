import { Modal, Space, Switch, Text } from "@mantine/core"
import { Fragment, FunctionComponent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { kdfProfileChangedEvent } from "@/src/main/utilities/useActiveKdfProfile"

const Settings: FunctionComponent = () => {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  // Lazy so the config read happens once at mount — the toggle below is
  // the only writer, so state and config cannot drift
  const [paranoid, setParanoid] = useState(
    () => window.api.invokeSync.getConfig("kdfProfile") === "paranoid"
  )
  useEffect(() => {
    const removeListener = window.api.events.menuSettings(() => {
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
      title={t("components.settings.settings")}
      // Above disclaimers and overlays (≤300), below Loading (500) and
      // About (1000) — About always lands on top of the app
      zIndex={400}
    >
      <Switch
        checked={paranoid}
        label={t("components.settings.paranoidMode")}
        onChange={(event) => {
          const checked = event.currentTarget.checked
          setParanoid(checked)
          window.api.invokeSync.setConfig(
            "kdfProfile",
            checked ? "paranoid" : "standard"
          )
          // Creation surfaces re-read the profile so the estimator and
          // gate follow the toggle immediately (see useActiveKdfProfile)
          window.dispatchEvent(new Event(kdfProfileChangedEvent))
        }}
        withThumbIndicator={false}
      />
      {paranoid === true ? (
        <Fragment>
          <Space h="sm" />
          <Text c="dimmed" size="xs">
            {t("components.settings.paranoidModeDescription")}
          </Text>
        </Fragment>
      ) : null}
    </Modal>
  )
}

export default Settings
