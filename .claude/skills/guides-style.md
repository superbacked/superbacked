---
name: guides-style
description: Superbacked guide style — guide anatomy, console transcripts, placeholders and versions, copy, shared setup boilerplate. For all users. Use when editing anything under docs/guides/.
user_invocable: true
---

# Superbacked guide style

## Audience and publication

Guides are for all users — plain steps, no scheme internals (those live in `docs/technical-documentation/`). Guides are published on superbacked.com: the website repo embeds this repo as a submodule and renders each `docs/guides/<slug>/README.md`, so a guide’s slug is its URL and cross-guide links use `https://superbacked.com/guides/<slug>`.

## Ground truth

The implementation-is-ground-truth rule, shared vocabulary and typography lint rule live in `technical-documentation-style.md` and apply here too — verify claims against the source before writing, quoted strings mirror the implementation exactly.

## Guide anatomy

- One directory per guide, content in `README.md`, images in `assets/`.
- HTML comment frontmatter: `Title`, `Description`, `Publication date` (ISO 8601), `Pinned` (rank or empty).
- Sections: `## Overview`, then `## Setup guide` / `## Usage guide` (or a single `## Guide`), with `### Step N: …` headings — `(optional)` or `(if applicable)` qualifiers in the heading.
- Warnings are `> Heads-up:` blockquotes, placed immediately before the step or command they qualify.

## Console transcripts

- Transcripts match the implementation’s output verbatim — warnings, prompts, confirmations and messages included. Regenerate when CLI strings change; capture on real hardware where output depends on it (disks, partitions).
- Commands the user types are prefixed `$ `; copyable commands sit flush-left in fenced `console` blocks, never indented inside lists.
- The `$ ` prefix is for transcripts — blocks interleaving typed commands with captured output. Command-only blocks (the verification checklists in `superbacked-os-security.md`) carry no prompts and no output, so they paste into a terminal whole, with expected results stated in prose — better than baked transcripts where outputs legitimately vary (debug vs release labels).
- Illustrative values (hashes, keys, addresses) need no disclaimer, but must be internally consistent where a reader can check (a shown zpub must derive the shown addresses).
- Example labels reflect the feature’s intended use — `github` for a derived password, `hotwallet` for a derived wallet — never a use the feature’s own warnings argue against (`savings`).

## Placeholders and versions

- `${latestRelease}` is substituted by the website — use it only where the latest release is genuinely correct (download and install commands). Unknown tokens are not substituted, so never invent new ones.
- Download/install commands hardcode `x64` with the heads-up: “replace `x64` with `arm64` in the following command if applicable — and, when reading this guide on GitHub, the version placeholder with the [latest release](https://github.com/superbacked/superbacked/releases/latest) semver.”
- Commands referencing the user’s own artifact (for example a flashed Superbacked OS release) hardcode a semver with a “replace `<semver>` with…” heads-up — the latest release is the wrong value there.

## Copy

- Feature and mode names match the app UI and error strings exactly (“Protected with YubiKey”, “Enable paranoid mode”, “Single block”).
- Warnings state the loss precisely: “unrecoverable” for permanent loss; recovery from a lost YubiKey is “a backup of the secret or a second YubiKey provisioned with it”.

## Shared boilerplate

- The CLI guides’ setup sections are byte-identical across guides — drift is detected by hashing. Deliberate divergences only, stated by behavior: the udev step is unconditional where the YubiKey is mandatory (derive commands), conditional (“When planning to use a YubiKey…”) where `--yubikey` is opt-in.
- The high-stakes pointer to Superbacked OS is a standing Overview heads-up.
