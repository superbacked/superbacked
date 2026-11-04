# Claude Code instructions

## Environment boundaries

- Edit files using Edit/Write tools so changes surface as reviewable diffs — never rewrite files via sed, node or perl scripts
- Verify changes using `npm run format:check`, `npm run typecheck` and `npm run lint`, in that order (each layer assumes the previous one passes — unparseable code fails everything, type errors make type-aware lint rules noisy) — never `npm run format`, which rewrites unrelated drift across the repo
- Run all three against the whole repo (each finishes in seconds) — report findings in files you changed as yours to fix and pre-existing findings elsewhere separately, never fold unrelated fixes into the change; `npm run lint -- <paths>` is fine while iterating on a few files
- Before reporting done, re-read the sections of this file that govern the files touched and state in the final message which rules were checked and any deliberate deviation — self-assessment is a reporting obligation, not a memory
- `npm run lint` needs the Linux resolver binding, which host installs do not ship — when lint fails with “Cannot find native binding”, ask developer to run `node node_modules/unrs-resolver/postinstall.js` in this container (fetches the binding into `node_modules/@unrs/`, needed again after every host reinstall) and never run it or download the binding yourself
- Never run `npm install`, `npm rebuild`, `npm update` or `npx` in this container — `node_modules` is host-owned and npm runs with scripts ignored here
- Never run tests, builds or packaging in this container — `npm test` is slow on container resources, builds and packaging need the Electron binary and Colima (ask developer to run them on host and report output)
- Ask before invoking node, npm, perl or python3 for anything beyond verification
- `chmod +x` shell scripts after creating or editing them

## Core rules

- The implementation is the ground truth for documentation — verify claims against the source and update `docs/` in the same pass as behavior changes
- Mirror every `src/locales/en.json` change in `fr.json` (same keys, translated) in the same pass
- Describe UX and interaction changes and get approval before implementing — mechanical fixes can proceed
- Small visual glitches are product-quality issues, not “just cosmetic”

## Skills

- Editing `docs/guides/`: use `/guides`
- Editing `docs/technical-documentation/`: use `/technical-documentation`

## Language

- Locale strings and CLI output drop articles such as “a” or “the” in English unless clarity needs them (“Block and passphrase required to restore secret”) — French keeps them and documentation keeps them in both languages
- Use sentence case for headings, list labels and titles

## Typography

- Prose, user-facing copy, code comments and console messages use curly quotes (“ ” ’), an ellipsis (…) and an em dash (—) to separate clauses or add explanation — straight quotes (`'` and `"`) and three dots (`...`) belong inside code only
- Avoid a comma before “and” or “or” unless clarity needs it — the linter flags one when the sentence already has a comma, which catches an Oxford comma and a comma joining clauses after a parenthetical alike (a sentence ends at “. ”, “! ”, “? ”, “: ”, “… ” or “ — ” and parentheses count as sentences of their own)
- Rules come from the `@sunknudsen/typography` package, whose ESLint plugin the linter runs on JSX copy, locale JSON and markdown — comments and console messages are not linted, so follow the rules by hand there

## JavaScript and TypeScript

- Avoid object property shorthand and prefer explicit `key: value` syntax (use `{ recoveryAllowedOn: recoveryAllowedOn }` instead of `{ recoveryAllowedOn }`)
- Avoid using `!` operator for negation and prefer explicit comparisons (use `value === null` instead of `!value`, `value !== null` instead of `value`, `booleanValue === false` instead of `!booleanValue`, `booleanValue === true` instead of `booleanValue`)
- Sort component props alphabetically
- Sort src/locales components, handlers and common child translation keys alphabetically
- Sort src/locales translation keys in order they appear in components
- Use `@src` imports rather than relative imports
- Use `import` over `import type` for all imports
- When variable type is null or another type and defaults to null, use type `null | AnotherType` (example: `let session: null | http2.ClientHttp2Session = null`)

## Bash and shell scripts

- Prefer single-line commands when line length doesn’t significantly exceed 80 characters
- Use `${variable}` syntax when variable is concatenated with other characters (example: `${port}:127.0.0.1`)
- Use `${variable}` syntax when variable is enclosed in quotes
- Use and sort long-form flags or options for utilities when applicable
- Operator scripts (run by hand) accept `-h` and `--help`, print usage starting with `Usage: <script> …` (mirroring the contract header’s `Usage:` line) to stdout and exit 0 — handled as an ordinary case of the option loop when the script parses options, checked before any other argument handling otherwise; a missing required argument prints `Error: <name> is required` to stderr and exits 1 without printing usage; an unknown option prints `Error: Unknown option: <option>` to stderr and exits 1; error paths never exit 0
- Operator scripts that parse options do so in one `case` loop: a command, when the script has them, is the first argument and an unknown one prints `Error: Unknown command: <command>`; an option valid only for some commands is an unknown option elsewhere; `-*)` precedes the positional catch-all so an unknown option is never taken as an argument; an option missing its value prints `Error: <option> requires <value name>`, an invalid value prints `Error: <option> expects <values> (got “<value>”)` and a surplus positional prints `Error: Unexpected argument: <argument>` — all to stderr, exiting 1
- Internal scripts (invoked only by another script or container) have no help option — their contract header ending with a literal `Usage:` line is the documentation — and validate arguments using same error shape as operator scripts
