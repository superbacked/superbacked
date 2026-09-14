---
name: superbacked-os-development-style
description: Superbacked OS development style — shell house style, file-purpose boundaries, version pinning, system configuration conventions, AppArmor, build variants, user-facing copy, verification. Use when editing anything under superbacked-os-utilities/, docker/, superbacked-os-bootstrap-assets/, ubuntu-desktop-utilities/ or package.sh.
user_invocable: true
---

# Superbacked OS development style

## File-purpose boundaries

Isolate purpose per file — place logic by role, not convenience:

- `superbacked-os-utilities/superbacked-os-bootstrap-base.sh` **installs the pinned software**: the apt snapshot upgrade and package set, Firefox, the PyPI tools, the Trezor udev rules, `yubikey-prov.sh`, Yubico Authenticator, then the build-package purge. Every upstream fetch and every pin lives here and nowhere else — the script takes no arguments, ignores `BUILD_VARIANT` and debug builds cache its result as an overlay layer keyed by its text. Runs as root in a chroot of the source image overlay; in-image paths, no `/mnt/root` prefixes, no `sudo`.
- `superbacked-os-utilities/superbacked-os-bootstrap-main.sh` **authors the OS on top**: users, hardening, the Superbacked app (the one local apt install), AppArmor profiles. Downloads nothing. Same execution contract as the base bootstrap.
- **Bootstrap stages are named by one word for what they lay down** (`base`, `main`) and every other identifier derives from it: the script `superbacked-os-utilities/superbacked-os-bootstrap-<stage>.sh`, the banners `Starting <stage> bootstrap…` and `<Stage> bootstrap complete`, the image-script lines `Running <stage> bootstrap in chroot…`, `Skipping <stage> bootstrap (cached as <key>)…` and `Saving <stage> layer <key>…`, the cache path `/cache/<stage>` and the flag `--clear-cache <stage>`. In prose, “the <stage> bootstrap” is the script or stage and “the <stage> layer” is its cached result — never fold “layer” into the stage name.
- `docker/create-superbacked-os-live-image.sh` **assembles and sanitizes the artifact**: mounts, chroot invocation, build scaffolding (and its removal), the apt cache bind mounts and their pre-hygiene unmount, superseded-kernel purge, kernel/initrd/ESP captures, live-boot/initramfs assertions, the purge, squashfs, partitions, GRUB, checksums.
- The purge is a **gate on the artifact**, not an OS-authoring step: it must sit immediately before `mksquashfs` so nothing can land after it. Never move it into the bootstrap. Scaffolding is removed by whoever created it, and scaffolding comments name their removal point at creation time (“restored in the purge below”, “removed with the unmount below”).
- AppArmor profiles are assets in `superbacked-os-bootstrap-assets/apparmor/`, one file per app, installed by the bootstrap.
- Every script opens with a contract header: what it does, the contract with its caller and environment, ending with a literal `Usage:` line showing a real invocation.

## Shell style

- The major build scripts (bootstrap, create-…-live-image, package.sh, update-pins, debug/) open with `#! /bin/bash`, `set -o errexit`, `set -o pipefail`. Exceptions exist deliberately: `superbacked-os-image.sh` is POSIX `#! /bin/sh`, and scripts that tolerate zero-match greps omit `pipefail` — preserve an exception only with its reason.
- **Runs in the container or image → GNU long-form flags** (`rm --force --recursive`, `mkdir --parents`, `grep --quiet`). Short-form only when no long form exists (`mkfs.ext4 -m 0`, `mksquashfs -b`) — say so in a comment when it looks like an oversight.
- **Runs on the macOS host → portable options**: `package.sh`, `superbacked-os-image.sh`, `superbacked-os-update-pins.sh` and `ubuntu-desktop-utilities/provision-ubuntu-desktop-iso.sh` drive BSD coreutils, which lack GNU long options (`mkdir -p`, `split -b`, `shasum -a 256`) — but tools that support long options everywhere (curl, docker, colima) keep them.
- Output uses `printf "%s\n"` (multi-line messages as multiple arguments), never `echo`. Section banners are gerunds with a typographic ellipsis: `printf "%s\n" "Configuring audio…"`.
- Downloads are always `curl --fail --location --proto '=https'`.
- Config files are written with `tee <path> > /dev/null << 'EOF'` heredocs in the bootstrap (quoted delimiter unless interpolation is required); plain redirection is acceptable where root already owns the shell (grub.cfg in the image assembler).
- Fail loudly, never silently drift: `printf "%s\n" "Error: …" >&2; exit 1`, with the observed unexpected value included in the message. Patches to third-party files are bracketed by assertions — assert the anchor exists exactly once before patching and assert the patch landed after.
- Host-script prompts: `tput bold`/`tput sgr0`, `read -r answer`, compare `= "y"`; declining is a clean exit — except when declining would silently drop a requested action, which fails loudly instead.
- Bounded waits use `for _ in $(seq 50); do … sleep 0.1; done` — but prefer event-driven mechanisms (udev rules, systemd conditions) over polling when the kernel or systemd can deliver the trigger.

## Enumerations

Sort multi-item lists (paths, packages, env vars, purge targets, command flags) alphabetically **unless order is semantic**. When order is intentional, keep it and say why in a comment:

```bash
# dev/pts before dev — nested mounts unmount before their parents.
umount /mnt/root/dev/pts /mnt/root/dev /mnt/root/proc /mnt/root/sys
```

Precedent: the `mksquashfs` comment — “ordering is semantic where not alphabetical”.

## Comments

- Comments explain **why** — constraints, threat-model rationale, upstream quirks — not what the next line does. Density is deliberately high; match it.
- A comment must earn its place: explain only what a competent reader couldn’t infer from the code itself. Comment the non-obvious exception, not the rule.
- Comments describe the **current** design only. Never reference abandoned attempts, prior revisions or why a change is correct — that belongs in commit messages. (Exception: a cleanup step whose only purpose is migrating away from an earlier shipped state may say so.)
- Cross-references cite banner names — “see “Disabling sudo” below” — and other files by repo path.

## Typography

Typographic punctuation in all prose: `’` for apostrophes, `“ ”` for quotes, `…` for ellipses, `—` for dashes (spaced, never `--`).

- **Applies to**: script comments (including comments inside heredoc-generated files), section banners, zenity dialog text, desktop-entry names, GRUB menu titles, guides and markdown docs.
- **Never in machine-matched text**: code and shell syntax, exact-match strings (the sudoers command line, `grep` patterns, udev rules), JSON policy keys and values, apt configuration, desktop-entry `Exec=` lines, AppArmor rules — a curly quote in any of these breaks matching silently.
- When editing near older prose with straight quotes, fix them in passing.
- All of the above is lint-enforced: [eslint/typography.ts](../../eslint/typography.ts) is the rule implementation (curly quotes and apostrophes, ellipsis character, no Oxford comma) and the ground truth when in doubt. Lint runs on the host (`npm run lint`).

## Version pinning

- All pins live together at the top of the base bootstrap as `readonly name="value"` constants, so a release bump is one edit — and the block is a machine-readable contract: `superbacked-os-utilities/superbacked-os-update-pins.sh` parses and rewrites it, failing loudly if its shape changes. Version and SHA-256 pins for one source always bump together. A pin outside the base bootstrap is a bug: the cached base layer is keyed by that file alone.
- The Ubuntu archive is pinned wholesale by snapshot timestamp (`apt_snapshot`, snapshot.ubuntu.com). Firefox is pinned by version with a glob tolerating packaging suffixes (`firefox=${firefox_version}*`); Yubico Authenticator by exact-version tarball URL with GPG signature checked against a pinned signer fingerprint; the pinned Python tools by version **and** wheel SHA-256, verified before install; `yubikey-prov.sh` by release tag **and** script SHA-256 (`sha256sum --check`); the Trezor udev rules, which carry no version, by SHA-256 alone.
- The remaining float — PyPI transitive dependencies — is pulled over HTTPS and acknowledged in a comment. A float without an acknowledging comment is a bug.

## System configuration

- **systemd**: modify stock units only via drop-ins; own services are `Type=oneshot` + `RemainAfterExit=yes` with `Description=Superbacked OS <mode> (<effect>)`; why-comments live inside the unit files; enable and mask with offline `systemctl` symlinks — no systemd runs in the chroot.
- **One kernel token is the mode switch**: air-gapped vs hardened browser is decided solely by `superbacked.browser` on the kernel command line (`ConditionKernelCommandLine=` both polarities, `grep --quiet … /proc/cmdline`, GRUB entries differing only by that token). Never add a second mode channel.
- **udev**: own files are `/etc/udev/rules.d/99-superbacked-*.rules` (upstream vendor files keep their names verbatim); one rule per line; a comment above each rule names the exact hardware, and the preceding shell comment says how to read the match values off a machine and dry-run with `udevadm test`.
- **nftables**: non-obvious rules carry inline `comment "…"` naming the protocol or threat; rulesets are replaced flush+load in a single `nft --file` transaction so there is never a moment without a firewall.
- **GNOME settings are a system dconf database, never gsettings** — gsettings needs a session bus the chroot lacks; write `/etc/dconf/db/local.d/` + the user profile and compile offline with `dconf update`.
- Root writes into homes freely during provisioning; ownership is handed over once, at the end — every write site carries the “(Ownership is handed back … at the end of provisioning.)” parenthetical so the deferral is visible locally.

## Security defaults

- Fail closed: apps pin Wayland and refuse to run without it; hardware that cannot comply fails loudly rather than degrading.
- Amnesic by design: runtime state lands in the RAM overlay and vanishes at reboot — never rely on persistence, and never bake per-machine identity (machine-id, seeds, logs) into the image.
- Hardware-specific workarounds match narrowly (model **and** component identifiers, e.g. DMI product_version plus codec subsystem id) so healthy hardware keeps stock behavior; every failure mode must land on stock behavior, not on a wrongly applied workaround.
- AppArmor profiles: `abi <abi/4.0>`, confined (never `flags=(unconfined)`); shared skeleton — header stating install path and why the stock profile is overwritten, alphabetical abstraction includes, broad grants first, sensitive denials in a closing block, the verbatim local-overrides closer before `include if exists <local/…>`. Use explicit `deny` where omission would suffice (quiet denies still hold on complain-mode debug images — say so in the comment) and `deny … quietly` only to keep enforce logs clean, each commented. Operation-scope any abstraction carve-out and state what blanket denial it avoids.

## Build variants and caching

- Debug gating is always `[ "${BUILD_VARIANT:-}" = "debug" ]`; the variable is forwarded explicitly through each env-scrubbed layer (package.sh `--env` → `env --ignore-environment` → bootstrap), and the host validates the value, failing loudly on a misspelling rather than silently building a release. Debug additions are strictly additive — the release path is never restructured. Debug images are test artifacts, never for distribution.
- The persistent apt cache is opt-out, detected by directory presence, bind-mounted into the chroot and removed (config and mounts) **before** image hygiene so it is neither wiped nor shipped; growth control is an explicit host flag, never an in-build heuristic.
- The base layer (debug builds only, same `/cache` volume) is the base bootstrap’s overlay upper reused as a lower layer, keyed by the base bootstrap’s text plus source image name and size. Scaffolding written before the base bootstrap lands in the layer, so every chroot-preparation step must tolerate its own result already existing. Release builds never read the layer.

## User-facing copy (zenity dialogs, GRUB entries)

State facts affirmatively; avoid alarming tone. Lead with what is true, then the constraint:

> Superbacked OS is running directly from the USB flash drive.
> The drive needs to stay plugged in for the session to keep running.

not “Keep the USB flash drive plugged in — unplugging it would crash the session.”

When a dialog exists to route the user to an action, the fact still leads, then a gentle “Please …” directive names the action:

> Superbacked OS is running in air-gapped mode.
> Please reboot and select “Superbacked OS (hardened browser)” to use browser.

Copy follows the repo language preference (`.github/copilot-instructions.md`): articles are dropped unless needed for clarity or readability — which is why the directive says “to use browser” while “The drive needs to stay plugged in” keeps them.

## Verification

- Minimum for any script change: `bash -n`.
- Anything touching boot, audio, AppArmor or the browser bridge needs a hardware boot to verify; list the concrete checks (commands and expected output) when handing off.
- AppArmor changes iterate through the `superbacked-os-utilities/debug/` loop on a `BUILD_VARIANT=debug` image: `update-apparmor-profiles.sh` installs the repository profiles (complain by default, `--enforce` to trial fixes) and clears the journal, `capture-apparmor-log.sh` harvests `apparmor="(ALLOWED|DENIED)"` events verbatim — failing loudly if printk rate-limit suppression is detected — and `summarize-apparmor-log.sh` collapses a capture into unique accesses for rule folding. Harvest after a profile reload (which clears the journal) and real use of the apps, never right after a runner — the runners’ probes provoke denials by design; the confinement runner checks its own Firefox launch window itself. `test-confinement.sh` exercises the boundaries with one PASS, FAIL or SKIP line each (the run launches Firefox, moves the compositor socket, unloads profiles, adds a dummy route and prompts for hardware — there is no partial mode; neither runner takes options) and refuses to run without a debug image; `test-hardening.sh` verifies the running system behaves as documented, needs no root and runs on release images too (it opens the bundled apps through their desktop entries for the label checks and closes them again; in hardened browser mode it opens Firefox the same way, checks the chain and waits for the window to be closed by hand; absent hardware is asked for; a SKIP is always a decision, never a default). Check descriptions name subjects consistently: users are the primary user, the browser user, root and the timesync user; profiles are the Superbacked app, Firefox, Yubico Authenticator, browser launcher and browser helper profiles; processes are the browser launcher, the browser helper and the bridge client. The split is by privilege, never by topic: a check the primary user can run with no root (boot composition, image contents, kernel state, what the primary user is refused, the launcher and helper refusing hostile inputs, the sudo policy on a release image) belongs in hardening; a check that needs `sudo`, enters a profile with `aa-exec` or disturbs the session belongs in confinement. No check appears in both. Neither reads back what the bootstrap wrote — a build that completed already guarantees file contents and unit enablement, so such a check cannot fail and earns no line. Outcomes that only a person can perform or observe (a drive not automounting, the app’s own link entering the chain, closing the Firefox window — the primary user can neither signal the browser user’s processes nor close another client’s window) go in the tests guide as manual steps. The full procedure across variants and boot modes is `superbacked-os-guides/superbacked-os-tests.md` — update it when a runner gains a flag or a step. `copy-debug-assets.sh` stages the profiles, the debug scripts and the newest app deb onto a drive from the host. Ship enforce only after a clean trial-enforcement pass on hardware.
