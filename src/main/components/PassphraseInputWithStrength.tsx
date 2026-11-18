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
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Trans, useTranslation } from "react-i18next"

import { KdfProfile } from "@/src/shared/kdfProfiles"
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

export interface PassphraseInputWithStrengthRef {
  // Cancelling the disclaimer returns focus to the field for editing
  focus: () => void
  // Requests the weak passphrase disclaimer when the current passphrase
  // is weak and not allowed — the submit path, as Enter inside the field
  // submits without blurring it
  promptWeakPassphrase: () => void
}

interface PassphraseInputWithStrengthProps extends TextareaProps {
  generatePassphrase: () => Promise<string>
  // Profile the passphrase will stretch under — scales the displayed
  // attack times and the gate together (see
  // src/shared/utilities/zxcvbn.ts). Omitted, the creation default applies
  kdfProfile?: KdfProfile
  onPopoverChange?: (opened: boolean) => void
  // Called at every decision point (blur and submit) while the passphrase
  // is weak and not allowed — the enclosing form hosts the disclaimer (see
  // src/main/components/WeakPassphraseDisclaimerModal.tsx) and records
  // the decision
  onWeakPassphrasePrompt: () => void
  // Called when the passphrase moves away from the allowed one — the
  // override covers one uninterrupted commit, so editing withdraws it
  // for good and returning to the same text prompts again
  onWeakPassphraseReset: () => void
  // The gate override is bound to the exact passphrase the disclaimer was
  // accepted for (see docs/technical-documentation/passphrase-strength.md)
  // — the enclosing form stores it so validation reads it
  weakPassphraseAllowedFor: null | string
}

export const PassphraseInputWithStrength = forwardRef<
  PassphraseInputWithStrengthRef,
  PassphraseInputWithStrengthProps
>((props, ref) => {
  const { t } = useTranslation()
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>(null)
  const [popoverOpened, setPopoverOpened] = useState(false)
  const [strength, setStrength] = useState<null | number>(null)
  const [time, setTime] = useState<null | Time>(null)
  const color =
    strength && strength >= minimumPassphraseStrength ? "pink" : "red"
  const {
    error,
    generatePassphrase,
    kdfProfile,
    onChange,
    onPopoverChange,
    onWeakPassphrasePrompt,
    onWeakPassphraseReset,
    weakPassphraseAllowedFor,
    ...otherProps
  } = props
  const value = otherProps.value as string
  // Handled where the value changes (typing, generating) rather than in
  // an effect, which would set host state during render
  const withdrawOverride = useCallback(
    (passphrase: string) => {
      if (
        weakPassphraseAllowedFor !== null &&
        passphrase !== weakPassphraseAllowedFor
      ) {
        onWeakPassphraseReset()
      }
    },
    [onWeakPassphraseReset, weakPassphraseAllowedFor]
  )
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
  // Evaluated on demand rather than from the debounced meter state — a
  // decision point must price the passphrase as it is at that instant.
  // Cancelling records nothing: the disclaimer returns at every decision
  // point until the passphrase is allowed or edited to pass
  const promptWeakPassphrase = useCallback(() => {
    if (
      value === "" ||
      zxcvbn(value, kdfProfile).strength >= minimumPassphraseStrength ||
      weakPassphraseAllowedFor === value
    ) {
      return
    }
    onWeakPassphrasePrompt()
  }, [kdfProfile, onWeakPassphrasePrompt, value, weakPassphraseAllowedFor])
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        textInputRef.current?.focus()
      },
      promptWeakPassphrase: promptWeakPassphrase,
    }),
    [promptWeakPassphrase]
  )
  // Allowed, the gate no longer blocks submission but the override stays
  // visible as an error — the meter stays red for the same reason
  const weakPassphraseAllowedError =
    weakPassphraseAllowedFor === value &&
    strength !== null &&
    strength < minimumPassphraseStrength
      ? t("components.passphraseInputWithStrength.weakPassphraseAllowed")
      : undefined
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
          error={error ?? weakPassphraseAllowedError}
          maxRows={4}
          onFocusCapture={() => {
            if (otherProps.value !== "") {
              setPopoverOpened(true)
            }
          }}
          onBlurCapture={(event) => {
            setPopoverOpened(false)
            // Focus leaving the window (switching apps, a native dialog)
            // is not a decision point
            if (document.hasFocus() === false) {
              return
            }
            // Neither is focus leaving the form — a modal’s close button,
            // its overlay or the page navigation, where the disclaimer
            // would block the dismissal. Blank space counts as staying:
            // clicking it focuses the nearest focusable ancestor (a
            // modal’s content panel, the create step’s container), which
            // contains the form
            const form = event.currentTarget.form
            const target = event.relatedTarget
            if (
              form === null ||
              target === null ||
              (form.contains(target) === false &&
                target.contains(form) === false)
            ) {
              return
            }
            promptWeakPassphrase()
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
            withdrawOverride(event.currentTarget.value)
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
                withdrawOverride(passphrase)
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
})

PassphraseInputWithStrength.displayName = "PassphraseInputWithStrength"

export default PassphraseInputWithStrength
