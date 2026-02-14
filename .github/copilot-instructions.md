# Coding preferences

## Visual Studio Code chat agent preferences

- When in agent-mode, avoid asking user to run commands

## Language preferences

- Avoid articles such as “a” or “the” when writing in English and avoid using commas before conjunctions such as “and” unless articles are necessary for clarity or readability but always include them for other languages
- Use em dash (—) when separating clauses or when providing explanatory information
- Use sentence case for headings, list labels and titles
- Use typographically correct curly apostrophe (’) for possessions and curly quotes (“”) for quoted words or sentences

## JavaScript and TypeScript preferences

- Avoid using `!` operator for negation and prefer explicit comparisons (use `value === null` instead of `!value`, `value !== null` instead of `value`, `booleanValue === false` instead of `!booleanValue`, `booleanValue === true` instead of `booleanValue`)
- Sort component props alphabetically
- Sort src/locales components, handlers and common child translation keys alphabetically
- Sort src/locales translation keys in order they appear in components
- Use `@src` imports rather than relative imports
- Use `import` over `import type` for all imports

## Bash and shell script preferences

- Prefer single-line commands when line length doesn’t significantly exceed 80 characters
- Use `${variable}` syntax when variable is concatenated with other characters (example: `${port}:127.0.0.1`)
- Use `${variable}` syntax when variable is enclosed in quotes
- Use and sort long-form flags or options for utilities when applicable
