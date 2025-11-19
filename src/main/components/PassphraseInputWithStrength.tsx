import {
  ActionIcon,
  Popover,
  Progress,
  Space,
  Text,
  TextInput,
  TextInputProps,
} from "@mantine/core"
import { FunctionComponent, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowsRandom as ArrowsRandomIcon } from "tabler-icons-react"

import zxcvbn, { ZxcvbnTranslationKey } from "@/src/main/utilities/zxcvbn"

interface Time {
  key: ZxcvbnTranslationKey
  base: number
}

interface PassphraseInputWithStrengthProps extends TextInputProps {
  generatePassphrase: () => Promise<string>
}

export const PassphraseInputWithStrength: FunctionComponent<
  PassphraseInputWithStrengthProps
> = (props) => {
  const { t } = useTranslation()
  const textInputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>(null)
  const [popoverOpened, setPopoverOpened] = useState(false)
  const [strength, setStrength] = useState<null | number>(null)
  const [time, setTime] = useState<null | Time>(null)
  const color =
    strength && strength === 100
      ? "teal"
      : strength && strength >= 50
        ? "yellow"
        : "red"
  const { generatePassphrase, onChange, ...otherProps } = props
  const updatePopover = (passphrase: string) => {
    const result = zxcvbn(passphrase)
    setStrength(result.strength)
    setTime({
      key: result.crackTimesDisplay.offlineSlowHashing1e4PerSecond,
      base: result.base,
    })
  }
  useLayoutEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      updatePopover(otherProps.value as string)
    }, 0)
  }, [otherProps.value])
  return (
    <Popover opened={popoverOpened} width={"440px"} withArrow>
      <Popover.Dropdown>
        <Text c="dimmed" fw="bold" size="sm" ta="center">
          {t("components.passphraseInputWithStrength.passphraseStrength")}
        </Text>
        <Space h="lg" />
        <Progress color={color} value={strength ?? 0} />
        <Space h="lg" />
        {time !== null ? (
          <Text c={strength && strength < 50 ? "red" : "dimmed"} size="sm">
            {t("components.passphraseInputWithStrength.estimatedAttackTime")}:{" "}
            {t(`components.passphraseInputWithStrength.zxcvbn.${time.key}`, {
              base: time.base,
            })}
          </Text>
        ) : null}
      </Popover.Dropdown>
      <Popover.Target>
        <TextInput
          ref={textInputRef}
          onFocusCapture={() => {
            if (otherProps.value !== "") {
              setPopoverOpened(true)
            }
          }}
          onBlurCapture={() => setPopoverOpened(false)}
          onChange={(event) => {
            if (onChange) {
              onChange(event)
            }
            if (event.currentTarget.value !== "") {
              setPopoverOpened(true)
            } else {
              setPopoverOpened(false)
            }
          }}
          rightSection={
            <ActionIcon
              color="pink"
              disabled={otherProps.disabled}
              onClick={async () => {
                if (textInputRef.current) {
                  textInputRef.current.focus()
                }
                const passphrase = await generatePassphrase()
                updatePopover(passphrase)
                setPopoverOpened(true)
              }}
              variant="transparent"
            >
              <ArrowsRandomIcon size={16} />
            </ActionIcon>
          }
          rightSectionPointerEvents="auto"
          {...otherProps}
        />
      </Popover.Target>
    </Popover>
  )
}

export default PassphraseInputWithStrength
