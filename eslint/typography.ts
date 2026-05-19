/**
 * ESLint plugin: typography
 *
 * Enforces typographically correct punctuation in user-facing copy.
 *
 * Rules:
 *   1. typography — checks JSX text nodes and string prop values in .jsx/.tsx files
 *   2. typography-content — checks content in JSON and markdown files via processors
 *
 * Conversions:
 *   Oxford comma (A, B, and C) → (A, B and C) — removes comma before final and/or
 *     in lists of 3+ items; leaves commas joining independent clauses alone
 *   Straight single quote (') → right single curly quote (\u2019)
 *   Straight double quotes ("text") → curly double quotes (\u201Ctext\u201D)
 *   Three dots (...) → ellipsis (\u2026)
 *
 * Skips (inherent to JSX rule):
 *   Import paths, string literals in logic, non-copy props (see SKIP_PROPS)
 *
 * Skips (explicit in markdown processor):
 *   Code blocks, inline code, HTML tags, URLs
 */

import { ESLint, Linter, Rule } from "eslint"
import { ExpressionStatement } from "estree"

const RIGHT_SINGLE_QUOTE = "\u2019"
const LEFT_DOUBLE_QUOTE = "\u201C"
const RIGHT_DOUBLE_QUOTE = "\u201D"
const ELLIPSIS = "\u2026"

// Oxford comma detection: find ", and " or ", or " that follows at least
// one more comma in the same clause (sentence fragment bounded by . ! ? or —).
const findOxfordComma = (
  text: string
): { index: number; length: number } | null => {
  const pattern = /, (and|or) /g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const before = text.substring(0, match.index)
    const sentenceStart = Math.max(
      before.lastIndexOf(". "),
      before.lastIndexOf("! "),
      before.lastIndexOf("? "),
      before.lastIndexOf(" — "),
      0
    )
    const clause = before.substring(sentenceStart)
    if (clause.includes(",")) {
      return { index: match.index, length: match[0].length }
    }
  }
  return null
}

const hasOxfordComma = (text: string): boolean => findOxfordComma(text) !== null

const hasStraightDoubleQuote = (text: string): boolean => text.includes('"')

const hasStraightEllipsis = (text: string): boolean => text.includes("...")

const hasStraightSingleQuote = (text: string): boolean => text.includes("'")

const fixDoubleQuotes = (text: string): string =>
  text.replace(/"([^"]*?)"/g, `${LEFT_DOUBLE_QUOTE}$1${RIGHT_DOUBLE_QUOTE}`)

const fixEllipsis = (text: string): string => text.replace(/\.\.\./g, ELLIPSIS)

const fixOxfordComma = (text: string): string => {
  let result = text
  while (true) {
    const oxford = findOxfordComma(result)
    if (oxford === null) break
    result =
      result.substring(0, oxford.index) + result.substring(oxford.index + 1)
  }
  return result
}

const fixSingleQuotes = (text: string): string =>
  text.replace(/'/g, RIGHT_SINGLE_QUOTE)

const fixAll = (text: string): string =>
  fixSingleQuotes(fixOxfordComma(fixEllipsis(fixDoubleQuotes(text))))

const cleanContent = (text: string): string =>
  text
    .replace(/`[^`]*`/g, "")
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/<[^>]+>/g, "")

const hasTypographyIssue = (text: string): boolean =>
  hasOxfordComma(text) ||
  hasStraightDoubleQuote(text) ||
  hasStraightEllipsis(text) ||
  hasStraightSingleQuote(text)

const getMessageId = (
  text: string
):
  | "oxfordComma"
  | "straightDoubleQuote"
  | "straightEllipsis"
  | "straightSingleQuote" => {
  if (hasOxfordComma(text)) return "oxfordComma"
  if (hasStraightDoubleQuote(text)) return "straightDoubleQuote"
  if (hasStraightEllipsis(text)) return "straightEllipsis"
  return "straightSingleQuote"
}

const getIssueLocation = (
  text: string
): { index: number; length: number } | null => {
  const oxford = findOxfordComma(text)
  const doubleQuoteIdx = text.indexOf('"')
  const ellipsisIdx = text.indexOf("...")
  const singleQuoteIdx = text.indexOf("'")

  const candidates: { index: number; length: number }[] = []
  if (oxford !== null) candidates.push(oxford)
  if (doubleQuoteIdx !== -1) {
    const closeIdx = text.indexOf('"', doubleQuoteIdx + 1)
    candidates.push({
      index: doubleQuoteIdx,
      length: closeIdx !== -1 ? closeIdx - doubleQuoteIdx + 1 : 1,
    })
  }
  if (ellipsisIdx !== -1) candidates.push({ index: ellipsisIdx, length: 3 })
  if (singleQuoteIdx !== -1)
    candidates.push({ index: singleQuoteIdx, length: 1 })

  candidates.sort((a, b) => a.index - b.index)
  return candidates[0] ?? null
}

const MESSAGES = {
  oxfordComma:
    "Drop Oxford comma — no comma before the final \u201Cand\u201D/\u201Cor\u201D in lists.",
  straightDoubleQuote:
    'Use curly double quotes (\u201C\u201D) instead of straight double quotes (").',
  straightEllipsis:
    "Use ellipsis character (\u2026) instead of three dots (...).",
  straightSingleQuote:
    "Use curly single quote (\u2019) instead of straight single quote (').",
}

// Mantine style props — always skip (from https://mantine.dev/styles/style-props/)
const MANTINE_STYLE_PROPS = new Set([
  "bd",
  "bg",
  "bga",
  "bgp",
  "bgr",
  "bgsz",
  "bottom",
  "c",
  "display",
  "ff",
  "flex",
  "fs",
  "fw",
  "fz",
  "h",
  "inset",
  "left",
  "lh",
  "lts",
  "m",
  "mah",
  "maw",
  "mb",
  "me",
  "mih",
  "miw",
  "ml",
  "mr",
  "ms",
  "mt",
  "mx",
  "my",
  "opacity",
  "p",
  "pb",
  "pe",
  "pl",
  "pos",
  "pr",
  "ps",
  "pt",
  "px",
  "py",
  "right",
  "ta",
  "td",
  "top",
  "tt",
  "w",
])

// HTML attributes that accept free-form user-visible text (from https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes)
// These are the ONLY standard HTML attributes where users enter prose — all others accept
// URLs, booleans, numbers, enumerated values, or technical identifiers.
const HTML_COPY_ATTRIBUTES = new Set(["alt", "label", "placeholder", "title"])

// All standard HTML attributes in React camelCase (from https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes)
// Used to identify "this is a known HTML attribute" so we can skip non-copy ones.
const HTML_ALL_ATTRIBUTES = new Set([
  "accept",
  "acceptCharset",
  "accessKey",
  "action",
  "align",
  "allow",
  "alpha",
  "alt",
  "as",
  "async",
  "autoCapitalize",
  "autoComplete",
  "autoPlay",
  "background",
  "bgColor",
  "border",
  "capture",
  "charSet",
  "checked",
  "cite",
  "className",
  "color",
  "colorSpace",
  "cols",
  "colSpan",
  "content",
  "contentEditable",
  "controls",
  "coords",
  "crossOrigin",
  "csp",
  "data",
  "dateTime",
  "decoding",
  "default",
  "defer",
  "dir",
  "dirName",
  "disabled",
  "download",
  "draggable",
  "elementTiming",
  "encType",
  "enterKeyHint",
  "fetchPriority",
  "form",
  "formAction",
  "formEncType",
  "formMethod",
  "formNoValidate",
  "formTarget",
  "headers",
  "height",
  "hidden",
  "high",
  "href",
  "hrefLang",
  "htmlFor",
  "httpEquiv",
  "id",
  "inputMode",
  "integrity",
  "isMap",
  "itemProp",
  "key",
  "kind",
  "label",
  "lang",
  "language",
  "list",
  "loading",
  "loop",
  "low",
  "max",
  "maxLength",
  "media",
  "method",
  "min",
  "minLength",
  "multiple",
  "muted",
  "name",
  "noValidate",
  "open",
  "optimum",
  "pattern",
  "ping",
  "placeholder",
  "playsInline",
  "poster",
  "preload",
  "property",
  "readOnly",
  "referrerPolicy",
  "rel",
  "required",
  "reversed",
  "role",
  "rows",
  "rowSpan",
  "sandbox",
  "scope",
  "selected",
  "shape",
  "size",
  "sizes",
  "slot",
  "span",
  "spellCheck",
  "src",
  "srcDoc",
  "srcLang",
  "srcSet",
  "start",
  "step",
  "style",
  "summary",
  "tabIndex",
  "target",
  "title",
  "translate",
  "type",
  "useMap",
  "value",
  "width",
  "wrap",
])

// Determine if a prop should be skipped
const shouldSkipProp = (propName: string): boolean => {
  // Always skip Mantine style props
  if (MANTINE_STYLE_PROPS.has(propName)) return true
  // Known HTML attribute — skip unless it accepts free-form text
  if (HTML_ALL_ATTRIBUTES.has(propName))
    return HTML_COPY_ATTRIBUTES.has(propName) === false
  // Custom prop (not HTML, not Mantine style) — check it
  return false
}

const typographyRule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce typographic punctuation in JSX text and props",
    },
    fixable: "code",
    messages: MESSAGES,
    schema: [],
  },
  create(context) {
    return {
      JSXText(
        node: Rule.Node & {
          raw: string
          loc: { start: { line: number; column: number } }
        }
      ) {
        const raw = node.raw
        const cleaned = cleanContent(raw)
        if (hasTypographyIssue(cleaned) === false) return

        const startLine = node.loc.start.line
        const startCol = node.loc.start.column

        const locateInRaw = (
          index: number
        ): {
          line: number
          column: number
        } => {
          const before = raw.substring(0, index)
          const newlines = (before.match(/\n/g) ?? []).length
          const lastNewline = before.lastIndexOf("\n")
          return {
            line: startLine + newlines,
            column:
              lastNewline === -1 ? startCol + index : index - lastNewline - 1,
          }
        }

        const issue = getIssueLocation(raw)
        if (issue === null) return

        const loc = locateInRaw(issue.index)
        context.report({
          loc: {
            start: loc,
            end: { line: loc.line, column: loc.column + issue.length },
          },
          messageId: getMessageId(raw),
          fix(fixer) {
            return fixer.replaceText(node, fixAll(raw))
          },
        })
      },

      JSXAttribute(
        node: Rule.Node & {
          name: { name: string }
          value: null | (Rule.Node & { value: string; raw: string })
        }
      ) {
        const propName = node.name.name
        if (shouldSkipProp(propName)) return
        if (node.value?.type !== "Literal") return
        if (typeof node.value?.value !== "string") return

        const raw = node.value.value
        if (hasTypographyIssue(raw) === false) return

        context.report({
          node: node.value,
          messageId: getMessageId(raw),
          fix(fixer) {
            return fixer.replaceText(
              node.value as Rule.Node,
              `"${fixAll(raw).replace(/"/g, "&quot;")}"`
            )
          },
        })
      },
    }
  },
}

const typographyContentRule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce typographic punctuation in content (JSON and markdown)",
    },
    fixable: "code",
    messages: MESSAGES,
    schema: [],
  },
  create(context) {
    return {
      ExpressionStatement(
        node: ExpressionStatement & Rule.NodeParentExtension
      ) {
        if (
          node.expression.type !== "Literal" ||
          !("value" in node.expression) ||
          typeof node.expression.value !== "string"
        ) {
          return
        }

        const raw = node.expression.value
        if (hasTypographyIssue(raw) === false) return

        context.report({
          node,
          messageId: getMessageId(raw),
          fix(fixer) {
            return fixer.replaceText(node, JSON.stringify(fixAll(raw)) + ";")
          },
        })
      },
    }
  },
}

interface LineMapping {
  column: number
  endColumn: number
  line: number
  sourceLength: number
  sourceOffset: number
}

let markdownLineMap: LineMapping[] = []

const markdownProcessor: Linter.Processor = {
  meta: {
    name: "markdown-content",
    version: "1.0.0",
  },
  supportsAutofix: true,
  preprocess(text) {
    const lines = text.split("\n")
    const jsLines: string[] = []
    markdownLineMap = []
    let inCodeBlock = false
    let offset = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line === undefined) continue
      const lineOffset = offset
      offset += line.length + 1

      if (line.trimStart().startsWith("```")) {
        inCodeBlock = !inCodeBlock
        continue
      }
      if (inCodeBlock) continue

      const cleaned = cleanContent(line.replace(/<!--|-->/g, ""))
      if (hasTypographyIssue(cleaned) === false) continue

      const issue = getIssueLocation(line)
      if (issue === null) continue

      jsLines.push(JSON.stringify(line) + ";")
      markdownLineMap.push({
        column: issue.index + 1,
        endColumn: issue.index + issue.length + 1,
        line: i + 1,
        sourceLength: line.length,
        sourceOffset: lineOffset,
      })
    }

    return [
      {
        text: jsLines.join("\n") || "// no content to check",
        filename: "0.js",
      },
    ]
  },

  postprocess(messages) {
    return messages.flat().map((message) => {
      const mapping = markdownLineMap[message.line - 1]
      if (mapping === undefined) return message
      const result = {
        ...message,
        column: mapping.column,
        endColumn: mapping.endColumn,
        endLine: mapping.line,
        line: mapping.line,
      }
      if (result.fix !== undefined && result.fix !== null) {
        result.fix = {
          range: [
            mapping.sourceOffset,
            mapping.sourceOffset + mapping.sourceLength,
          ] as [number, number],
          text: JSON.parse(result.fix.text.replace(/;$/, "")),
        }
      }
      return result
    })
  },
}

let jsonLineMap: LineMapping[] = []

const jsonProcessor: Linter.Processor = {
  meta: {
    name: "json-content",
    version: "1.0.0",
  },
  supportsAutofix: true,
  preprocess(text) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return [{ text: "// invalid JSON", filename: "0.js" }]
    }

    const jsLines: string[] = []
    jsonLineMap = []
    const lines = text.split("\n")
    const foundOffsets = new Set<number>()

    const findStringInSource = (value: string): LineMapping | null => {
      const escaped = JSON.stringify(value)
      let offset = 0
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line === undefined) continue
        let searchFrom = 0
        let col = line.indexOf(escaped, searchFrom)
        while (col !== -1) {
          const absoluteOffset = offset + col
          if (foundOffsets.has(absoluteOffset) === false) {
            foundOffsets.add(absoluteOffset)
            return {
              column: col + 1,
              endColumn: col + escaped.length + 1,
              line: i + 1,
              sourceLength: escaped.length,
              sourceOffset: absoluteOffset,
            }
          }
          searchFrom = col + 1
          col = line.indexOf(escaped, searchFrom)
        }
        offset += line.length + 1
      }
      return null
    }

    const walk = (obj: unknown): void => {
      if (typeof obj === "string") {
        const cleaned = cleanContent(obj)
        if (hasTypographyIssue(cleaned)) {
          jsLines.push(JSON.stringify(obj) + ";")
          const loc = findStringInSource(obj)
          if (loc !== null) {
            jsonLineMap.push(loc)
          } else {
            jsonLineMap.push({
              column: 1,
              endColumn: 1,
              line: 1,
              sourceLength: 0,
              sourceOffset: 0,
            })
          }
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(walk)
      } else if (obj !== null && typeof obj === "object") {
        Object.values(obj).forEach(walk)
      }
    }

    walk(parsed)

    return [
      {
        text: jsLines.join("\n") || "// no content to check",
        filename: "0.js",
      },
    ]
  },

  postprocess(messages) {
    return messages.flat().map((message) => {
      const mapping = jsonLineMap[message.line - 1]
      if (mapping === undefined) return message
      const result = {
        ...message,
        column: mapping.column,
        endColumn: mapping.endColumn,
        endLine: mapping.line,
        line: mapping.line,
      }
      if (
        result.fix !== undefined &&
        result.fix !== null &&
        mapping.sourceLength > 0
      ) {
        const fixedValue = JSON.parse(result.fix.text.replace(/;$/, ""))
        result.fix = {
          range: [
            mapping.sourceOffset,
            mapping.sourceOffset + mapping.sourceLength,
          ] as [number, number],
          text: JSON.stringify(fixedValue),
        }
      }
      return result
    })
  },
}

const plugin: ESLint.Plugin = {
  meta: {
    name: "eslint-plugin-typography",
    version: "1.0.0",
  },
  rules: {
    typography: typographyRule,
    "typography-content": typographyContentRule,
  },
  processors: {
    json: jsonProcessor,
    markdown: markdownProcessor,
  },
}

export const configs = {
  jsx: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      plugins: { typography: plugin },
      rules: { "typography/typography": "warn" as const },
    },
  ],
  json: (patterns: string[]) => [
    {
      files: patterns,
      plugins: { typography: plugin },
      processor: "typography/json" as const,
    },
    {
      files: patterns.map((p) => `${p}/*.js`),
      plugins: { typography: plugin },
      rules: { "typography/typography-content": "warn" as const },
    },
  ],
  markdown: [
    {
      files: ["**/*.md"],
      plugins: { typography: plugin },
      processor: "typography/markdown" as const,
    },
    {
      files: ["**/*.md/*.js"],
      plugins: { typography: plugin },
      rules: { "typography/typography-content": "warn" as const },
    },
  ],
}

export default plugin
