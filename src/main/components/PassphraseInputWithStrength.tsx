import {
  ActionIcon,
  Popover,
  Progress,
  Space,
  Text,
  Textarea,
  TextareaProps,
} from "@mantine/core"
import { IconArrowsRandom } from "@tabler/icons-react"
import {
  FunctionComponent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Trans, useTranslation } from "react-i18next"

import { KdfProfile } from "@/src/shared/utilities/kdfProfiles"
import zxcvbn, {
  ZxcvbnTranslationKey,
  minimumPassphraseStrength,
} from "@/src/shared/utilities/zxcvbn"

interface Time {
  slowKey: ZxcvbnTranslationKey
  slowBase: number
  entropy: number
  entropyDeterministic: boolean
  fastKey: ZxcvbnTranslationKey
  fastBase: number
}

const underHourKeys: ZxcvbnTranslationKey[] = [
  "ltSecond",
  "second",
  "seconds",
  "minute",
  "minutes",
]

const overCenturyKeys: ZxcvbnTranslationKey[] = [
  "millionYears",
  "billionYears",
  "overTrillionYears",
]

// The bracket collapses to the scenario making the stronger claim:
// under an hour at the million-dollar budget, the billion-dollar figure
// adds nothing (weakness is proven by the smaller budget) — and once
// even the billion-dollar attacker needs a century, the million-dollar
// figure is implied (strength is proven by the larger)
const attackTimeScenariosKey = (
  time: Time
):
  | "components.passphraseInputWithStrength.attackTimeScenarioMillion"
  | "components.passphraseInputWithStrength.attackTimeScenarioBillion"
  | "components.passphraseInputWithStrength.attackTimeScenarios" => {
  if (underHourKeys.includes(time.slowKey)) {
    return "components.passphraseInputWithStrength.attackTimeScenarioMillion"
  }
  if (
    overCenturyKeys.includes(time.fastKey) ||
    (time.fastKey === "years" && time.fastBase >= 100)
  ) {
    return "components.passphraseInputWithStrength.attackTimeScenarioBillion"
  }
  return "components.passphraseInputWithStrength.attackTimeScenarios"
}

interface PassphraseInputWithStrengthProps extends TextareaProps {
  generatePassphrase: () => Promise<string>
  // Profile the passphrase will stretch under — scales the displayed
  // attack times and the gate together (see
  // src/shared/utilities/zxcvbn.ts). Omitted, the creation default applies
  kdfProfile?: KdfProfile
  onPopoverChange?: (opened: boolean) => void
}

export const PassphraseInputWithStrength: FunctionComponent<
  PassphraseInputWithStrengthProps
> = (props) => {
  const { t } = useTranslation()
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>(null)
  const [popoverOpened, setPopoverOpened] = useState(false)
  const [strength, setStrength] = useState<null | number>(null)
  const [time, setTime] = useState<null | Time>(null)
  const color =
    strength && strength >= minimumPassphraseStrength ? "pink" : "red"
  const {
    generatePassphrase,
    kdfProfile,
    onChange,
    onPopoverChange,
    ...otherProps
  } = props
  // Keyed on the profile so toggling Paranoid mode reprices a passphrase
  // that has not changed — the effect below re-runs when the identity
  // changes
  const updatePopover = useCallback(
    (passphrase: string) => {
      const result = zxcvbn(passphrase, kdfProfile)
      setStrength(result.strength)
      setTime({
        slowKey: result.slowKey,
        slowBase: result.slowBase,
        entropy: result.entropy,
        entropyDeterministic: result.entropyDeterministic,
        fastKey: result.fastKey,
        fastBase: result.fastBase,
      })
    },
    [kdfProfile]
  )
  useLayoutEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      updatePopover(otherProps.value as string)
    }, 0)
  }, [otherProps.value, updatePopover])
  return (
    <Popover
      onOpen={() => onPopoverChange?.(true)}
      onExitTransitionEnd={() => onPopoverChange?.(false)}
      opened={popoverOpened}
      width={"440px"}
      withArrow
    >
      <Popover.Dropdown>
        <Text fw="bold" size="sm" ta="center" variant="signatureGradient">
          {t("components.passphraseInputWithStrength.passphraseStrength")}
        </Text>
        <Space h="lg" />
        <Progress color={color} value={strength ?? 0} />
        <Space h="lg" />
        {time !== null ? (
          <Text
            c={
              strength && strength < minimumPassphraseStrength
                ? "red"
                : undefined
            }
            size="sm"
          >
            {t("components.passphraseInputWithStrength.estimatedAttackTime")}:{" "}
            <Trans
              components={{
                bold: <Text component="span" fw="bold" />,
              }}
              i18nKey={attackTimeScenariosKey(time)}
              values={{
                slow: t(
                  `components.passphraseInputWithStrength.zxcvbn.${time.slowKey}`,
                  { base: time.slowBase, count: time.slowBase }
                ),
                fast: t(
                  `components.passphraseInputWithStrength.zxcvbn.${time.fastKey}`,
                  { base: time.fastBase, count: time.fastBase }
                ),
              }}
            />{" "}
            (
            {t(
              time.entropyDeterministic
                ? "components.passphraseInputWithStrength.entropy"
                : "components.passphraseInputWithStrength.entropyEstimate",
              { bits: time.entropy }
            )}
            )
          </Text>
        ) : null}
      </Popover.Dropdown>
      <Popover.Target>
        <Textarea
          ref={textInputRef}
          autosize
          maxRows={4}
          onFocusCapture={() => {
            if (otherProps.value !== "") {
              setPopoverOpened(true)
            }
          }}
          onBlurCapture={() => {
            setPopoverOpened(false)
          }}
          onKeyDown={(event) => {
            // A newline inside a passphrase would silently change the
            // derived secret — Enter submits the enclosing form instead,
            // behaving like a single-line input
            if (event.key === "Enter") {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          onChange={(event) => {
            // Pasted newlines become spaces — wrapped text joins visibly
            // instead of embedding invisible characters in the secret
            event.currentTarget.value = event.currentTarget.value.replace(
              /\r?\n+/g,
              " "
            )
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
              disabled={otherProps.disabled}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
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
              <IconArrowsRandom size={16} />
            </ActionIcon>
          }
          rightSectionPointerEvents="auto"
          spellCheck={false}
          {...otherProps}
        />
      </Popover.Target>
    </Popover>
  )
}

export default PassphraseInputWithStrength
