# Claude Code instructions

Read and apply all instructions in `.github/copilot-instructions.md` before starting any task.

## Skills

This project has skills that capture detailed conventions. Use them:

- `/guides-style` — guide anatomy, console transcripts, placeholders and versions, copy, shared setup boilerplate
- `/superbacked-os-development-style` — Superbacked OS build conventions: shell house style, file-purpose boundaries, version pinning, AppArmor, user-facing copy
- `/technical-documentation-style` — technical documentation anatomy, frozen-construction rule, source pointers, vocabulary, prose mechanics

## Environment boundaries

- Edit files using Edit/Write tools so changes surface as reviewable diffs — never rewrite files via sed, node or perl scripts
- Never run builds, tests, lint or packaging in this container — `npm test` fails and ESLint hangs here (ask developer to run them on host and report output); `npm run typecheck` works and is the in-container verification
- Ask before invoking node, npm, perl or python3
- `chmod +x` shell scripts after creating or editing them

## Core rules

- The implementation is the ground truth for documentation — verify claims against the source and update `docs/` in the same pass as behavior changes
- Mirror every `src/locales/en.json` change in `fr.json` (same keys, translated) in the same pass
- Describe UX and interaction changes and get approval before implementing — mechanical fixes can proceed
- Small visual glitches are product-quality issues, not “just cosmetic”
