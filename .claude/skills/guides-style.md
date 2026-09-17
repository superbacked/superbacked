---
name: guides-style
description: Superbacked guide style — guide anatomy, console transcripts, placeholders and versions, copy, shared setup boilerplate. For all users. Use when editing anything under docs/guides/.
user_invocable: true
---

# Superbacked guide style

## Audience and publication

Guides are for all users — plain steps, no scheme internals (those live in `docs/technical-documentation/`). Guides are published on superbacked.com: the website repo embeds this repo as a submodule and renders each `docs/guides/<slug>/README.md`, so a guide’s slug is its URL. Cross-guide links are relative — `../<slug>/README.md` — so they resolve on GitHub and the website alike (the website maps them to the guide route of the version being read); links to non-guide pages use `https://superbacked.com/<path>`.

## Ground truth

The implementation-is-ground-truth rule, shared vocabulary and typography lint rule live in `technical-documentation-style.md` and apply here too — verify claims against the source before writing, quoted strings mirror the implementation exactly.

## Guide anatomy

- One directory per guide, content in `README.md`, images in `assets/`.
- HTML comment frontmatter: `Title`, `Description`, `Keywords` (optional, comma-separated, lowercase, searchable only — broadest context first: platform such as `macos`, `linux` or `superbacked-os`, then surface such as `app` or `cli`, then specifics such as `yubikey`; every command-line guide carries `cli`), `Publication date` (ISO 8601), `Category` (optional index category label — `Superbacked app`, `Superbacked OS`, `Command-line interface` or `Releases`; the website orders categories), `Pinned` (rank within the category, or empty).
- Sections: `## Overview`, then `## Setup guide` / `## Usage guide` (or a single `## Guide`), with `### Step N: …` headings — `(optional)` or `(if applicable)` qualifiers in the heading.
- Warnings are `> Heads-up:` blockquotes, placed immediately before the step or command they qualify.

## Console transcripts

- Transcripts match the implementation’s output verbatim — warnings, prompts, confirmations and messages included. Regenerate when CLI strings change; capture on real hardware where output depends on it (disks, partitions).
- Commands the user types are prefixed `$ `; copyable commands sit flush-left in fenced `console` blocks, never indented inside lists.
- Every command in a guide block carries the `$ ` prefix, with a blank line between commands and any captured output shown beneath the command that produced it — command-only blocks included. The one exception is the verification checklists in `superbacked-os-security.md`, which carry no prompts and no output so they paste into a terminal whole, with expected results stated in prose — better than baked transcripts where outputs legitimately vary (debug vs release labels).
- Illustrative values (hashes, keys, addresses) need no disclaimer, but must be internally consistent where a reader can check (a shown zpub must derive the shown addresses).
- Example labels reflect the feature’s intended use — `github` for a derived password, `hotwallet` for a derived wallet — never a use the feature’s own warnings argue against (`savings`).

## Placeholders and versions

- `${latestRelease}` is substituted by the website — use it only where the latest release is genuinely correct (download and install commands). Unknown tokens are not substituted, so never invent new ones.
- Download/install commands hardcode `x64` with the heads-up: “on ARM computers (such as Raspberry Pis), replace `x64` with `arm64` in the following command. When reading this guide on GitHub, also replace the version placeholder with the [latest release](https://github.com/superbacked/superbacked/releases/latest) version.”
- Commands referencing the user’s own artifact (for example a flashed Superbacked OS release) hardcode a semver with a “replace `<semver>` with…” heads-up — the latest release is the wrong value there.

## Copy

- Feature and mode names match the app UI and error strings exactly (“Protected with YubiKey”, “Enable paranoid mode”, “Single block”).
- Instructions are imperative with “you” implied (“Download latest release”, “Run following command”); “your” only for something that belongs to the reader (“your Mac”, “your username”), never to narrate (“you will see”).
- Numbered `### Step N:` headings only where order matters (install then run, create then restore, provision then back up); independent uses of a command get plain `###` headings (derive wallet, reveal mnemonic). A section with a single subsection drops the subheading — its heads-ups and prose sit directly under the `##` heading (derive passwords usage guide).
- Prerequisites are Overview heads-ups, not steps: the derive guides state that a provisioned YubiKey is required and link the provisioning guide (which owns the slot, touch and backup explanations); the macOS Input Monitoring heads-up stays on the first step that opens the YubiKey.
- Bold (`**…**`) renders as signature-gradient text on the website and plain bold on GitHub — reserved for a warning the CLI itself prints in red (today only the signing device sentence in the derive Bitcoin wallets guide), never for ordinary emphasis.
- Option sentences start “Use `--flag` to …”, one per paragraph, the root `--paranoid` flag first, then the command’s own options.
- “Bitcoin” capitalized for the network, protocol and concept (“Bitcoin wallet”, “derived Bitcoin wallets”); “bitcoin” lowercase for the currency (“sending bitcoin to it”) — the bitcoin.org and AP convention.
- YubiKey vocabulary mirrors the app strings: “protect with YubiKey” / “Protected with YubiKey” for the feature, “a YubiKey provisioned with the same challenge-response secret” for the requirement, “connected YubiKey” for presence — never “second factor” (a technical-documentation concept, fine on the website), “YubiKey mode” or “holding”.
- Warnings state the loss precisely: “unrecoverable” for permanent loss; recovery from a lost YubiKey is “a backup of the secret or a second YubiKey provisioned with it”.

## Shared boilerplate

- Command-line setup lives in the platform guides, never in a standalone guide: Ubuntu Desktop (the deb puts `superbacked` on the path) and Superbacked OS (preinstalled) need nothing beyond a sentence in their usage step; the macOS and Tails guides carry an optional final setup step (macOS alias; AppImage install to `~/.local/bin` with profile reload — the udev rule is the Tails guide’s own YubiKey step). Other Linux systems are untested and not addressed. Every CLI guide’s `## Setup guide` is the one-sentence availability statement linking the four platform guides, byte-identical across guides — never a copy of the steps.
- The high-stakes pointer to Superbacked OS (“for high-stakes secrets, use Superbacked OS — …”) is an Overview heads-up on every guide whose steps put a secret on a computer — creating, restoring, deriving or provisioning — and on none of the others (setup, verification and Superbacked OS guides).
