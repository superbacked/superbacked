import { Modal, NumberInput, Space, Switch, Text } from "@mantine/core"
import { Fragment, FunctionComponent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { kdfProfileChangedEvent } from "@/src/main/utilities/useActiveKdfProfile"
import {
  defaultClipboardClearSeconds,
  maximumClipboardClearSeconds,
  minimumClipboardClearSeconds,
} from "@/src/shared/clipboardClearSeconds"

const Settings: FunctionComponent = () => {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  // Lazy so the config read happens once at mount — the toggle below is
  // the only writer, so state and config cannot drift
  const [paranoid, setParanoid] = useState(
    () => window.api.invokeSync.getConfig("kdfProfile") === "paranoid"
  )
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState<
    number | string
  >(
    () =>
      window.api.invokeSync.getConfig("clipboardClearSeconds") ??
      defaultClipboardClearSeconds
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
      {/* Applies to app copies only — the command-line interface reads
          its --clear flags (see src/utilities/config.ts). Clearing the
          field restores the shared default rather than storing one */}
      <NumberInput
        allowDecimal={false}
        allowNegative={false}
        // Clamping on blur, not per keystroke — with a minimum above 9,
        // strict clamping rejects the first digit of every entry (a
        // lone “6” on the way to “60” is below the minimum), making the
        // field impossible to retype
        clampBehavior="blur"
        label={t("components.settings.clearClipboardAfter")}
        max={maximumClipboardClearSeconds}
        min={minimumClipboardClearSeconds}
        suffix={` ${t("components.settings.seconds")}`}
        onChange={(value) => {
          setClipboardClearSeconds(value)
          // Persist only settled in-range values — intermediate
          // keystrokes fall outside the bounds the config schema
          // enforces; the blur clamp re-fires onChange with the final
          // value
          if (
            typeof value === "number" &&
            value >= minimumClipboardClearSeconds &&
            value <= maximumClipboardClearSeconds
          ) {
            window.api.invokeSync.setConfig("clipboardClearSeconds", value)
          } else if (value === "") {
            window.api.invokeSync.unsetConfig("clipboardClearSeconds")
          }
        }}
        value={clipboardClearSeconds}
      />
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
