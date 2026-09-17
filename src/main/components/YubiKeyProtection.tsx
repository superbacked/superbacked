import { Group, SegmentedControl, Switch } from "@mantine/core"
import { FunctionComponent, memo } from "react"
import { useTranslation } from "react-i18next"

interface YubiKeyProtectionProps {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
  onSlotChange: (slot: "1" | "2") => void
  slot: "1" | "2"
}

// The YubiKey switch and slot control shared by every protected form —
// memoized on primitive props, so unrelated form fields re-rendering do
// not redraw the row
const YubiKeyProtection: FunctionComponent<YubiKeyProtectionProps> = (
  props
) => {
  const { t } = useTranslation()
  return (
    <Group justify="space-between">
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        label={props.label}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        // The track transition exists for the on/off toggle, but the
        // disabled state swaps the track color through the same property —
        // without this, disabling fades over 150ms while every other form
        // element snaps
        styles={{
          track: props.disabled === true ? { transition: "none" } : {},
        }}
        withThumbIndicator={false}
      />
      {/* Always rendered so the row keeps the height of its tallest child —
        mounting on toggle would grow the form */}
      <SegmentedControl
        data={[
          { label: t("common.slot1"), value: "1" },
          { label: t("common.slot2"), value: "2" },
        ]}
        disabled={props.disabled}
        onChange={(value) => props.onSlotChange(value as "1" | "2")}
        size="xs"
        style={{
          visibility: props.checked === true ? "visible" : "hidden",
        }}
        value={props.slot}
      />
    </Group>
  )
}

export default memo(YubiKeyProtection)
