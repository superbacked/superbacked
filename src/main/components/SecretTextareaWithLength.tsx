import {
  Badge,
  Divider,
  Group,
  Mark,
  Popover,
  Progress,
  rgba,
  Space,
  Text,
  Textarea,
  TextareaProps,
  useMantineColorScheme,
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

import { DataLengths } from "@/src/main/routes/Create"
import { extract, ExtractionType } from "@/src/main/utilities/regexp"
import {
  captureSelection,
  SelectionWithElement,
} from "@/src/main/utilities/selection"

interface SecretTextareaProps extends TextareaProps {
  dataLengths: DataLengths
  secretNumber: number
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

const SecretTextareaWithLength: FunctionComponent<SecretTextareaProps> = (
  props
) => {
  const { t } = useTranslation()
  const theme = useMantineTheme()
  const { colorScheme } = useMantineColorScheme()
  const textRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevousSelectionRef = useRef<SelectionWithElement>(null)
  const [popoverOpened, setPopoverOpened] = useState(false)
  const [currentSelection, setCurrentSelection] =
    useState<SelectionWithElement>(() => captureSelection())
  const {
    dataLengths,
    secretNumber,
    onBlur,
    onChange,
    onFocus,
    ...otherProps
  } = props
  const lengthPercentage = useMemo(() => {
    const contextualizedMaxDataLength =
      secretNumber === 1
        ? dataLengths.totalDataLength
        : dataLengths.maxHiddenSecretsDataLength
    const contextualizedRemainingMaxDataLength =
      secretNumber === 1
        ? dataLengths.totalDataLength - dataLengths.secret1DataLength
        : dataLengths.maxRemainingHiddenDataLength
    const length =
      contextualizedMaxDataLength - contextualizedRemainingMaxDataLength
    return Math.min(Math.ceil((length / contextualizedMaxDataLength) * 100))
  }, [secretNumber, dataLengths])
  const memoizedExtractions = useMemo(() => {
    const { start, end } = currentSelection
    const results = extract(otherProps.value as string)
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
      if (result.type === "validBip39Mnemonic") {
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
      }
    }
    return extractions
  }, [currentSelection, otherProps.value, theme])
  const color = lengthPercentage > 100 ? "red" : "teal"
  const updateScrollTop = useCallback(() => {
    if (textRef.current && textareaRef.current) {
      textRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])
  const handleSelectionChange = useCallback(() => {
    if (document.activeElement === textareaRef.current) {
      const newSelection = captureSelection()
      if (
        !prevousSelectionRef.current ||
        prevousSelectionRef.current.start !== newSelection.start ||
        prevousSelectionRef.current.end !== newSelection.end
      ) {
        prevousSelectionRef.current = newSelection
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
                    transition: "background-color 0.15s",
                    width: "60px",
                  },
                  inner: {
                    color:
                      colorScheme === "dark" ? theme.colors.dark[0] : "#000",
                  },
                }}
              >
                {badge.label}
              </Badge>
              <Text c="dimmed" size="sm">
                {badge.count}{" "}
                {t(`components.secretTextareaWithLength.${type}`, {
                  count: badge.count,
                })}{" "}
                {t("components.secretTextareaWithLength.found", {
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
      textChildren.push(
        <Mark
          key={`${memoizedExtraction.string}-${textChildren.length}`}
          dangerouslySetInnerHTML={{
            __html: value.substring(
              memoizedExtraction.start,
              memoizedExtraction.end
            ),
          }}
          sx={{
            backgroundColor: memoizedExtraction.color,
            color: "transparent",
            overflowWrap: "anywhere",
            transition: "background-color 0.15s",
            whiteSpace: "pre-wrap",
          }}
        />
      )
      startIndex = memoizedExtraction.end
    }
    textChildren.push(value.substring(startIndex).replace(/\n$/, "\n\n"))
  }
  return (
    <Popover opened={popoverOpened} width={"440px"} withArrow>
      <Popover.Dropdown>
        <Text c="dimmed" fw="bold" size="sm" ta="center">
          {t("components.secretTextareaWithLength.secretLength")}
        </Text>
        <Space h="lg" />
        <Progress color={color} value={lengthPercentage} />
        <Space h="lg" />
        <Text c={lengthPercentage > 100 ? "red" : "dimmed"} size="sm">
          {t("components.secretTextareaWithLength.lengthRemaining")}:{" "}
          {100 - lengthPercentage}%
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
          onBlurCapture={() => setPopoverOpened(false)}
          sx={() => ({
            position: "relative",
            width: "100%",
          })}
        >
          <Text
            ref={textRef}
            sx={{
              position: "absolute",
              top: "25px",
              right: 0,
              bottom: otherProps.error ? undefined : 0,
              left: 0,
              backgroundColor:
                colorScheme === "dark" ? theme.colors.dark[6] : "#fff",
              border: `solid 1px ${
                colorScheme === "dark" ? theme.colors.dark[6] : "#fff"
              }`,
              borderRadius: "4px",
              color: "transparent",
              fontSize: "14px",
              overflowX: "hidden",
              overflowY: "scroll",
              paddingTop: "5.5px",
              paddingRight: "12px",
              paddingBottom: "5.5px",
              paddingLeft: "12px",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              "::-webkit-scrollbar": {
                width: "10px",
              },
              "::-webkit-scrollbar-track": {
                backgroundColor:
                  colorScheme === "dark"
                    ? theme.colors.dark[5]
                    : theme.colors.pink[0],
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
            styles={{
              root: {
                width: "100%",
              },
              input: {
                backgroundColor: "transparent",
                overflowX: "hidden",
                overflowY: "scroll",
                "::-webkit-scrollbar": {
                  width: "10px",
                },
                "::-webkit-scrollbar-track": {
                  backgroundColor:
                    colorScheme === "dark"
                      ? theme.colors.dark[5]
                      : theme.colors.gray[0],
                  borderTopRightRadius: "3px",
                  borderBottomRightRadius: "3px",
                },
                "::-webkit-scrollbar-thumb": {
                  backgroundColor:
                    colorScheme === "dark"
                      ? theme.colors.dark[7]
                      : theme.colors.gray[2],
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

export default SecretTextareaWithLength
