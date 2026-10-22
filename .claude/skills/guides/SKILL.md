---
name: guides
description: Rules for guides under docs/guides/ that copying an existing guide does not show. Use when creating or editing anything under docs/guides/.
user_invocable: true
---

# Guides

- Copy the closest existing guide before writing a new one
- Shared sentences are identical across guides — Overview opener, high-stakes heads-up, arm64 heads-up, command-line availability sentence, printer line — change every copy in the same pass
- Sections: `## Overview` (abstract first, heads-ups last), optional `## Requirements` and `## Recommendations (optional)`, then `## Guide` or `## Setup guide`, `## Computer provisioning guide` where hardware is prepared and `## Usage guide`
- `### Step N:` headings only where order matters
- Step headings are sentence case with the qualifier in the heading (“Step 2 (optional):”)
- No numbered lists in guide content — click sequences read as prose
- A heads-up for a step sits immediately after its heading
- A heads-up for one command sits immediately before that command
- Transcripts are verbatim, warnings and prompts included
- Every command carries the `$ ` prefix, flush-left in a fenced `console` block, never inside a list
- A blank line separates commands; output sits beneath the command that produced it
- `${latestRelease}` appears only in download and install commands
- Download and install commands hardcode `x64` with the arm64 heads-up, except on Tails, which is x86-only
- Links between guides are relative (`../<slug>/README.md`); links to the site are absolute
