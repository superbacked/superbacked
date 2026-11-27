import { Modal, Select, Space, Switch, Text } from "@mantine/core"
import { notifications } from "@mantine/notifications"
import { Fragment, FunctionComponent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { kdfProfileChangedEvent } from "@/src/main/utilities/useActiveKdfProfile"
import {
  clipboardClearSecondsOptions,
  defaultClipboardClearSeconds,
  nearestClipboardClearSeconds,
} from "@/src/shared/clipboardClearSeconds"

const Settings: FunctionComponent = () => {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  // Lazy so the config read happens once at mount — the toggle below is
  // the only writer, so state and config cannot drift
  const [paranoid, setParanoid] = useState(
    () => window.api.invokeSync.getConfig("kdfProfile") === "paranoid"
  )
  // Snapped to a dropdown choice for a value the 2.2.0 config migration
  // has not seen yet (see src/utilities/config.ts) — development builds
  // run at the previous version, so the migration has not fired there
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState(() =>
    String(
      nearestClipboardClearSeconds(
        window.api.invokeSync.getConfig("clipboardClearSeconds") ??
          defaultClipboardClearSeconds
      )
    )
  )
  const [disableBlockBranding, setDisableBlockBranding] = useState(
    () => window.api.invokeSync.getConfig("disableBlockBranding") === true
  )
  // Fixed id so rapid toggles share one toast instead of stacking —
  // Mantine ignores show while that id is visible, so the toast simply
  // runs out its default auto-close
  const showSaved = () => {
    notifications.show({
      id: "settingsSaved",
      message: t("components.settings.saved"),
    })
  }
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
      opened={opened}
      onClose={() => {
        setOpened(false)
      }}
      title={t("components.settings.settings")}
      // Above disclaimers and overlays (≤300), below Loading (500) and
      // About (1000) — About always lands on top of the app
      zIndex={400}
    >
      {/* Applies to app copies only — the command-line interface reads
          its --clear flags (see src/utilities/config.ts) */}
      <Select
        allowDeselect={false}
        // The dropdown portals to the body at Mantine’s popover layer
        // (300), under this modal (400) — lifted to the notifications
        // layer so it opens above the modal
        comboboxProps={{ keepMounted: false, zIndex: 450 }}
        data={clipboardClearSecondsOptions.map((seconds) => ({
          label: `${seconds} ${t("components.settings.seconds")}`,
          value: String(seconds),
        }))}
        label={t("components.settings.clearClipboardAfter")}
        onChange={(value) => {
          if (value === null) {
            return
          }
          setClipboardClearSeconds(value)
          window.api.invokeSync.setConfig(
            "clipboardClearSeconds",
            Number(value)
          )
          showSaved()
        }}
        value={clipboardClearSeconds}
      />
      <Space h="lg" />
      {/* Read by the block renderer at creation, duplication and print
          time (see src/handlers/create.ts), so the toggle applies to the
          next block rendered — never to blocks already on screen */}
      <Switch
        checked={disableBlockBranding}
        label={t("components.settings.disableBlockBranding")}
        onChange={(event) => {
          const checked = event.currentTarget.checked
          setDisableBlockBranding(checked)
          window.api.invokeSync.setConfig("disableBlockBranding", checked)
          showSaved()
        }}
        withThumbIndicator={false}
      />
      {disableBlockBranding === true ? (
        <Fragment>
          <Space h="sm" />
          <Text c="dimmed" size="xs">
            {t("components.settings.disableBlockBrandingDescription", {
              // Quoted from the block’s own string so the description
              // cannot drift from what is printed
              notice: t("block.importantDocumentDoNotDiscard"),
            })}
          </Text>
        </Fragment>
      ) : null}
      <Space h="lg" />
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
          showSaved()
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
