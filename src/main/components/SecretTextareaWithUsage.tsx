import {
  Badge,
  Divider,
  Group,
  Mark,
  Popover,
  Progress,
  Space,
  Text,
  Textarea,
  TextareaProps,
  rgba,
  useMantineTheme,
} from "@mantine/core"
import {
  Fragment,
  FunctionComponent,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { ExtractionType, extract } from "@/src/main/utilities/regexp"
import {
  SelectionWithElement,
  captureSelection,
} from "@/src/main/utilities/selection"
import { BlockUsage } from "@/src/utilities/core/block"

interface SecretTextareaProps extends TextareaProps {
  blockUsage: BlockUsage
  blockset?: boolean
  onPopoverChange?: (opened: boolean) => void
}

interface Extraction {
  string: string
  type: ExtractionType
  color: string
  label: string
  start: number
  end: number
  selected: boolean
}

interface ExtractionBadge {
  color: string
  label: string
  count: number
}

type ExtractionBadges = {
  [type in ExtractionType]?: ExtractionBadge
}

// Count-line nouns per extraction type — the YubiKey type's noun drops
// the brand (its badge already carries it)
const badgeCountKeys = {
  bip39Mnemonic: "bip39Mnemonic",
  bip39Passphrase: "bip39Passphrase",
  totpUri: "totpUri",
  yubikeyChallengeResponseSecret: "challengeResponseSecret",
} as const satisfies Record<ExtractionType, string>

const SecretTextareaWithUsage: FunctionComponent<SecretTextareaProps> = (
  props
) => {
  const { t } = useTranslation()
  const theme = useMantineTheme()
  const textRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previousSelectionRef = useRef<SelectionWithElement>(null)
  const [popoverOpened, setPopoverOpened] = useState(false)
  const [currentSelection, setCurrentSelection] =
    useState<SelectionWithElement>(() => captureSelection())
  const {
    blockUsage,
    blockset = false,
    onBlur,
    onChange,
    onFocus,
    onPopoverChange,
    ...otherProps
  } = props
  const usagePercentage = useMemo(() => {
    // All secrets share the same block, so measure usage against the shared
    // pool consistently (rather than against each secret’s own budget).
    const usedSpace = blockUsage.blockSize - blockUsage.remainingSpace
    return Math.ceil((usedSpace / blockUsage.blockSize) * 100)
  }, [blockUsage])
  const memoizedExtractions = useMemo(() => {
    const { start, end } = currentSelection
    // Two passes, as in the restore view: mnemonics gate passphrase
    // extraction, so a recognized passphrase is highlighted before
    // printing exactly when restoration will highlight it
    const preliminary = extract(otherProps.value as string)
    const results = preliminary.some(
      (result) => result.type === "bip39Mnemonic"
    )
      ? extract(otherProps.value as string, true)
      : preliminary
    const extractions: Extraction[] = []
    for (const result of results) {
      let selected = false
      if (
        (start > result.start && start < result.end) ||
        (end > result.start && end < result.end) ||
        (start <= result.start && end >= result.end)
      ) {
        selected = true
      }
      if (
        result.type === "bip39Mnemonic" ||
        result.type === "bip39Passphrase"
      ) {
        // One family tag for both — the counts line distinguishes the
        // nouns
        extractions.push({
          string: result.string,
          type: result.type,
          color: rgba(theme.colors.pink[8], selected ? 0.7 : 0.35),
          label: "BIP39",
          start: result.start,
          end: result.end,
          selected: selected,
        })
      } else if (result.type === "totpUri") {
        extractions.push({
          string: result.string,
          type: result.type,
          color: rgba(theme.colors.pink[8], selected ? 0.7 : 0.35),
          label: "TOTP",
          start: result.start,
          end: result.end,
          selected: selected,
        })
      } else if (result.type === "yubikeyChallengeResponseSecret") {
        extractions.push({
          string: result.string,
          type: result.type,
          color: rgba(theme.colors.pink[8], selected ? 0.7 : 0.35),
          label: "YubiKey",
          start: result.start,
          end: result.end,
          selected: selected,
        })
      }
    }
    return extractions
  }, [currentSelection, otherProps.value, theme])
  const color = usagePercentage > 100 ? "red" : "pink"
  const updateScrollTop = useCallback(() => {
    if (textRef.current && textareaRef.current) {
      textRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])
  const handleSelectionChange = useCallback(() => {
    if (document.activeElement === textareaRef.current) {
      const newSelection = captureSelection()
      if (
        previousSelectionRef.current?.start !== newSelection.start ||
        previousSelectionRef.current?.end !== newSelection.end
      ) {
        previousSelectionRef.current = newSelection
        setCurrentSelection(newSelection)
      }
    }
  }, [])
  useEffect(() => {
    const textareaElement = textareaRef.current
    if (textareaElement) {
      textareaElement.addEventListener("scroll", updateScrollTop)
    }
    document.addEventListener("selectionchange", handleSelectionChange)
    return () => {
      if (textareaElement) {
        textareaElement.removeEventListener("scroll", updateScrollTop)
      }
      document.removeEventListener("selectionchange", handleSelectionChange)
    }
  }, [updateScrollTop, handleSelectionChange])
  useLayoutEffect(() => {
    if (otherProps.error && textareaRef.current && textRef.current) {
      textRef.current.style.height = `${textareaRef.current.offsetHeight}px`
    } else if (textRef.current) {
      textRef.current.style.height = "auto"
    }
  }, [otherProps.error, otherProps.value])
  const markBadges: ReactNode[] = []
  const badges: ExtractionBadges = {}
  for (const memoizedExtraction of memoizedExtractions) {
    if (memoizedExtraction.selected) {
      const badgeType = badges[memoizedExtraction.type]
      if (badgeType) {
        badgeType.count++
      } else {
        badges[memoizedExtraction.type] = {
          color: memoizedExtraction.color,
          label: memoizedExtraction.label,
          count: 1,
        }
      }
    }
  }
  if (badges) {
    const types = Object.keys(badges) as Array<keyof typeof badges>
    let typeCount = 0
    for (const type of types) {
      typeCount++
      const badge = badges[type]
      if (badge) {
        markBadges.push(
          <Fragment key={type}>
            <Group>
              <Badge
                styles={{
                  root: {
                    backgroundColor: badge.color,
                    transition: "background-color 100ms ease",
                    // Wide enough for the widest label (YUBIKEY) — fixed
                    // so the counts align in a column across badges
                    width: "80px",
                  },
                  label: {
                    color: theme.colors.dark[9],
                  },
                }}
              >
                {badge.label}
              </Badge>
              <Text size="sm">
                {badge.count}{" "}
                {t(
                  `components.secretTextareaWithUsage.${badgeCountKeys[type]}`,
                  {
                    count: badge.count,
                  }
                )}{" "}
                {t("components.secretTextareaWithUsage.found", {
                  count: badge.count,
                })}
              </Text>
            </Group>
            {typeCount < types.length ? <Space h="xs" /> : null}
          </Fragment>
        )
      }
    }
  }
  const value = otherProps.value as string
  const textChildren: ReactNode[] = []
  let startIndex = 0
  if (memoizedExtractions.length === 0) {
    textChildren.push(value.replace(/\n$/, "\n\n"))
  } else {
    for (const memoizedExtraction of memoizedExtractions) {
      textChildren.push(value.substring(startIndex, memoizedExtraction.start))
      // Plain child text, never innerHTML — the overlay must render the
      // exact characters the textarea holds to stay aligned, and secret
      // content must not reach an HTML parser (a passphrase containing
      // “<” would otherwise start a tag and swallow the rest of the mark)
      textChildren.push(
        <Mark
          key={`${memoizedExtraction.string}-${textChildren.length}`}
          sx={{
            backgroundColor: memoizedExtraction.color,
            // Layout-neutral rounding (no padding — the overlay must
            // keep character-for-character alignment with the textarea)
            borderRadius: "var(--mantine-radius-sm)",
            color: "transparent",
            overflowWrap: "anywhere",
            transition: "background-color 100ms ease",
            whiteSpace: "pre-wrap",
          }}
        >
          {value.substring(memoizedExtraction.start, memoizedExtraction.end)}
        </Mark>
      )
      startIndex = memoizedExtraction.end
    }
    textChildren.push(value.substring(startIndex).replace(/\n$/, "\n\n"))
  }
  return (
    <Popover
      onExitTransitionEnd={() => onPopoverChange?.(false)}
      onOpen={() => onPopoverChange?.(true)}
      opened={popoverOpened}
      width={"440px"}
      withArrow
    >
      <Popover.Dropdown>
        <Text fw="bold" size="sm" ta="center" variant="signatureGradient">
          {t(
            blockset
              ? "components.secretTextareaWithUsage.blocksetCapacity"
              : "components.secretTextareaWithUsage.blockCapacity"
          )}
        </Text>
        <Space h="lg" />
        <Progress color={color} value={usagePercentage} />
        <Space h="lg" />
        <Text c={usagePercentage > 100 ? "red" : undefined} size="sm">
          {t("components.secretTextareaWithUsage.spaceRemaining")}:{" "}
          {100 - usagePercentage}%
        </Text>
        {markBadges.length > 0 ? (
          <Fragment>
            <Divider my="md" variant="dotted" />
            {markBadges}
          </Fragment>
        ) : null}
      </Popover.Dropdown>
      <Popover.Target>
        <Group
          onFocusCapture={() => {
            if (otherProps.value !== "") {
              setPopoverOpened(true)
            }
          }}
          onBlurCapture={() => {
            setPopoverOpened(false)
            setCurrentSelection({
              start: 0,
              end: 0,
              element: textareaRef.current as HTMLTextAreaElement,
            })
          }}
          sx={() => ({
            position: "relative",
            width: "100%",
          })}
        >
          <Text
            ref={textRef}
            sx={{
              position: "absolute",
              top: "33px",
              right: 0,
              bottom: otherProps.error ? undefined : 0,
              left: 0,
              backgroundColor: theme.colors.dark[7],
              border: `solid 2px ${theme.colors.dark[7]}`,
              borderRadius: "4px",
              color: "transparent",
              fontSize: "14px",
              overflowX: "hidden",
              overflowY: "scroll",
              paddingTop: "8px",
              paddingRight: "8px",
              paddingBottom: "8px",
              paddingLeft: "8px",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              "::-webkit-scrollbar": {
                width: "10px",
              },
              "::-webkit-scrollbar-track": {
                backgroundColor: theme.colors.dark[6],
                borderTopRightRadius: "3px",
                borderBottomRightRadius: "3px",
              },
            }}
          >
            {textChildren}
          </Text>
          <Textarea
            ref={textareaRef}
            onBlur={(event) => {
              if (onBlur) {
                onBlur(event)
              }
            }}
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
            onFocus={(event) => {
              if (onFocus) {
                onFocus(event)
              }
            }}
            {...otherProps}
            spellCheck={false}
            styles={{
              root: {
                width: "100%",
              },
              input: {
                backgroundColor: "transparent !important",
                overflowX: "hidden",
                overflowY: "scroll",
                "::-webkit-scrollbar": {
                  width: "10px",
                },
                "::-webkit-scrollbar-track": {
                  backgroundColor: theme.colors.dark[6],
                  borderTopRightRadius: "3px",
                  borderBottomRightRadius: "3px",
                },
                "::-webkit-scrollbar-thumb": {
                  backgroundColor: theme.colors.dark[4],
                  borderRadius: "5px",
                },
              },
            }}
          />
        </Group>
      </Popover.Target>
    </Popover>
  )
}

export default SecretTextareaWithUsage
