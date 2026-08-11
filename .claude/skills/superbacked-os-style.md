---
name: superbacked-os-style
description: Superbacked OS development style — shell house style, typography, file-purpose boundaries, version pinning, AppArmor conventions, user-facing copy tone. Use when editing anything under superbacked-os-utilities/, docker/, superbacked-os-bootstrap-assets/, ubuntu-desktop-utilities/ or package.sh.
user_invocable: true
---

# Superbacked OS development style

## File-purpose boundaries

Isolate purpose per file — place logic by role, not convenience:

- `superbacked-os-utilities/superbacked-os-bootstrap.sh` **authors the OS**: every byte the image ships (packages, users, hardening, the Superbacked app, AppArmor profiles). Runs as root in a chroot of the source image overlay; in-image paths, no `/mnt/root` prefixes, no `sudo`.
- `docker/create-superbacked-os-live-image.sh` **assembles and sanitizes the artifact**: mounts, chroot invocation, build scaffolding (and its removal), kernel/initrd/ESP captures, the purge, squashfs, partitions, GRUB, checksums.
- The purge is a **gate on the artifact**, not an OS-authoring step: it must sit immediately before `mksquashfs` so nothing can land after it. Never move it into the bootstrap. Scaffolding is removed by whoever created it.
- AppArmor profiles are assets in `superbacked-os-bootstrap-assets/apparmor/`, one file per app, installed by the bootstrap.

## Shell style

- `#! /bin/bash`, `set -o errexit`, `set -o pipefail`.
- Long-form flags always **in the Linux scripts** (the bootstrap and the `docker/` scripts, which run in the container/image): `rm --force --recursive`, `mkdir --parents`, `grep --quiet`, `curl --fail --location`. Short-form only when no long form exists (`mkfs.ext4 -m 0`, `mksquashfs -b`) — say so in a comment when it looks like an oversight.
- **The macOS host scripts run BSD coreutils, which lack GNU long options — use short-form there.** These are `package.sh`, `superbacked-os-utilities/superbacked-os-image.sh` and `ubuntu-desktop-utilities/provision-ubuntu-desktop-iso.sh` (they drive `colima`/`docker`/`diskutil`/`dd` on the Mac). `mkdir --parents` fails there with “illegal option — -”; use `mkdir -p`, `rm -rf`, `split -b`. Rule of thumb: runs in the container → long-form; runs on the Mac → short-form.
- Section banners: `printf "%s\n" "Doing thing…"` with a typographic ellipsis (`…`), phrased as a gerund.
- Config files are written with `tee <path> > /dev/null << 'EOF'` heredocs (quoted delimiter unless interpolation is required).
- Fail loudly, never silently drift: verify downloaded keys by fingerprint, assert expected file shapes before `sed`-ing them (e.g. `grep --quiet '^Exec=firefox'`), and exit with `printf "%s\n" "Error: …" >&2; exit 1`. A broken build beats a silently wrong image.
- Bounded waits use the `for _ in $(seq 50); do … sleep 0.1; done` pattern — but prefer event-driven mechanisms (udev rules, systemd conditions) over polling when the kernel or systemd can deliver the trigger.

## Enumerations

Sort multi-item lists (paths, packages, env vars, purge targets, command flags) alphabetically **unless order is semantic**. When order is intentional, keep it and say why in a comment:

```bash
# dev/pts before dev — nested mounts unmount before their parents.
umount /mnt/root/dev/pts /mnt/root/dev /mnt/root/proc /mnt/root/sys
```

Precedent: the `mksquashfs` comment — “ordering is semantic where not alphabetical”.

## Comments

- Comments explain **why** — constraints, threat-model rationale, upstream quirks — not what the next line does. Density is deliberately high; match it.
- A comment must earn its place: explain only what a competent reader couldn’t infer from the code itself. When the _why_ is self-evident (obvious stock-package removals, a routine operation), omit it or keep it to a phrase — don’t restate or enumerate what the code already shows. Comment the non-obvious exception, not the rule.
- Comments describe the **current** design only. Never reference abandoned attempts, prior revisions or why a change is correct — that belongs in commit messages. (Exception: a cleanup step whose only purpose is migrating away from an earlier shipped state may say so.)

## Typography

Typographic punctuation in all prose: `’` for apostrophes, `“ ”` for quotes, `…` for ellipses, `—` for dashes (spaced, never `--`).

- **Applies to**: script comments (including comments inside heredoc-generated files), section banners (`printf "%s\n" "Configuring audio…"`), zenity dialog text, desktop-entry names, GRUB menu titles, guides and markdown docs.
- **Never in machine-matched text**: code and shell syntax, exact-match strings (the sudoers command line, `grep` patterns, udev rules), JSON policy keys and values, apt configuration, desktop-entry `Exec=` lines, AppArmor rules — a curly quote in any of these breaks matching silently.
- When editing near older prose with straight quotes, fix them in passing.

## Version pinning

- All version pins live together at the top of the bootstrap as `readonly` constants, so a release bump is one edit.
- The Ubuntu archive is pinned wholesale by snapshot timestamp (`apt_snapshot`, snapshot.ubuntu.com). Repositories without snapshots (Mozilla, PPAs, Yubico) are pinned by version with a glob tolerating packaging suffixes (`firefox=${firefox_version}*`) — a vanished version fails the build loudly; bumps are deliberate.
- Sources that cannot be version-pinned (PyPI, raw GitHub files) are integrity-verified (GPG signature or key fingerprint) and the float is acknowledged in a comment.

## Security defaults

- Fail closed: apps pin Wayland and refuse to run without it; hardware that cannot comply fails loudly rather than degrading.
- Amnesic by design: runtime state lands in the RAM overlay and vanishes at reboot — never rely on persistence, and never bake per-machine identity (machine-id, seeds, logs) into the image.
- Hardware-specific workarounds match narrowly (model **and** component identifiers, e.g. DMI product_version plus codec subsystem id) so healthy hardware keeps stock behavior; every failure mode must land on stock behavior, not on a wrongly applied workaround.
- AppArmor profiles: `abi <abi/4.0>`, confined (not `flags=(unconfined)`) for apps, a comment mapping each rule group to the snap interface or threat it replaces and `include if exists <local/…>` at the end.

## User-facing copy (zenity dialogs, GRUB entries)

State facts affirmatively; avoid alarming tone. Lead with what is true, then the constraint:

> Superbacked OS is running directly from the USB flash drive.
> The drive needs to stay plugged in for the session to keep running.

not “Keep the USB flash drive plugged in — unplugging it would crash the session.”

When a dialog exists to route the user to an action, the fact still leads, then a gentle “Please …” directive names the action:

> Superbacked OS is running in air-gapped mode.
> Please reboot and select “Superbacked OS (hardened browser)” to use the browser.

Dialog prose keeps articles (“the browser”); the terse, article-free register belongs to compressed surfaces (CLI help fragments, labels, buttons). Documentation prose also keeps articles — there they are semantic (“a” introduces a new object, “the” refers back to a defined one).

## Verification

- Minimum for any script change: `bash -n`.
- Anything touching boot, audio, AppArmor or the browser bridge needs a hardware boot to verify; list the concrete checks (commands and expected output) when handing off. AppArmor profile changes iterate with an `APPARMOR_MODE=complain` build against `journalctl -b -k | grep DENIED` before shipping enforce.
