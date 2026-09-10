# Superbacked OS security model

This document describes how Superbacked OS is hardened. It is written for two audiences: users who want to understand what the system does on their behalf, and security reviewers who want to get up to speed quickly before reading the source code.

It is deliberately an overview of **intent and approach**, not an exhaustive specification. Where a mechanism has a precise definition, the source code is the ground truth — the OS bootstrap ([`superbacked-os-utilities/superbacked-os-bootstrap.sh`](../../superbacked-os-utilities/superbacked-os-bootstrap.sh)), the image assembler ([`docker/create-superbacked-os-live-image.sh`](../../docker/create-superbacked-os-live-image.sh)) and the AppArmor profiles ([`superbacked-os-bootstrap-assets/apparmor/`](../../superbacked-os-bootstrap-assets/apparmor/)) — and this document points at it rather than restating it. We would rather be corrected than trusted: if something here is wrong, overstated or weaker than it should be, that feedback is welcome.

## Threat model and philosophy

Superbacked OS exists to create and restore encrypted paper backups (“blocks”) of high-stakes secrets — critical credentials, signing keys and digital assets — and the encrypted file archives that can accompany them. (The cryptographic design of what it creates is documented separately: blocks in the [block technical documentation](block.md), blocksets in the [blockset technical documentation](blockset.md) and the file archives in the [standalone archive](standalone-archive.md) and [detached archive](detached-archive.md) technical documentation; this document is about the operating system that surrounds them.) It assumes the machine may be a target and aims to make a single compromised component as inert as possible: unable to reach the network, observe the room, watch other applications or reach storage it has no business touching.

The design leans on a few principles rather than any single control:

- **Nothing persists.** The system runs from RAM and forgets everything at reboot. Persistence is the exception that must be justified, not the default.
- **Layered isolation.** No single mechanism is treated as sufficient. User separation, network policy, display isolation and per-application confinement are meant to overlap, so that bypassing one still leaves others in the way.
- **Least software.** Code that is not needed is removed rather than merely disabled — updaters, crash reporters, telemetry agents, the Xorg server, snapd.
- **Fail closed.** When the secure path is unavailable, the system stops rather than quietly falling back to an insecure one: applications pin Wayland and refuse to run without it; hardware that cannot run Wayland fails loudly at login rather than dropping into a snoopable X11 session.

None of this is claimed to be complete. Several measures below are defense in depth (redundant on purpose), some are best-effort and a few are explicitly untested in the field — those are called out.

## Application stack

The three bundled GUI applications sit on very different stacks, which matters to a reviewer deciding where to look. Rather than re-document each application’s internals, this is the map; the confinement details live in the profiles.

| Application          | Purpose                                                       | Stack                                         | Runs as       | Network             |
| -------------------- | ------------------------------------------------------------- | --------------------------------------------- | ------------- | ------------------- |
| Superbacked          | Create and restore blocks, blocksets and encrypted archives   | Electron (Chromium + Node.js), Debian package | `superbacked` | Denied              |
| Yubico Authenticator | Manage YubiKey TOTP secrets, passkeys, certificates and slots | Flutter, upstream tarball; speaks to `pcscd`  | `superbacked` | Denied              |
| Firefox              | Navigate the web in hardened browser mode                     | Gecko, Mozilla’s Debian package               | `clearnet`    | Allowed, firewalled |

Reviewers who know these stacks will already know their sharp edges — the Chromium sandbox and user namespaces for the Electron app, Gecko’s content sandbox for Firefox, Flutter’s bundled runtime and its `libpcsclite` for Yubico Authenticator. The confinement described below is written with those in mind, and corrections from people who know these stacks better than we do are exactly what we are hoping for.

## Isolation and hardening

### No data persistence

**Intent:** nothing a user does survives a reboot, and no per-machine identity is carried between users.

**Approach:** the distributed image is a read-only squashfs that `live-boot` copies into RAM (`toram`) and overlays with a RAM tmpfs; the USB drive can be removed once the desktop appears. Machines with too little memory fall back to running tethered from the drive (a login-time notice explains this). The image is built to carry no installer-machine state — logs, histories, network profiles, entropy seed and `machine-id` are stripped, so `machine-id` regenerates fresh in RAM at each boot. `init_on_free=1` zeroes freed memory so secrets do not linger after the app releases them.

**Limits:** RAM is not instantly wiped on power loss; a cold-boot attacker with physical access remains a residual risk that `init_on_free` mitigates but does not eliminate. You can confirm persistence is off for yourself — see [How to verify data persistence is disabled](../guides/how-to-verify-data-persistence-is-disabled/README.md).

### Printing without traces

**Intent:** printing a block should leave no copy behind.

**Approach:** the printing system used by Linux and macOS (CUPS) writes a complete copy of every print job to disk (`/var/spool/cups`), where forensic tools can recover it even after the job is deleted. A block is encrypted, so the copy is not plaintext — but it is a persistent digital copy of a backup you meant to keep only on paper, left on the drive for anyone who later accesses it. On Superbacked OS those spool files land in the RAM overlay like everything else and vanish on shutdown. Avoiding this on-disk copy is one reason Superbacked OS exists. The broader one is a much smaller attack surface — far fewer ways for an attacker to reach a secret or exfiltrate it — which the rest of this document describes.

### Two boot modes

**Intent:** the default is a machine that is silent on the network; reaching the internet is a deliberate, separate choice.

**Approach:** the GRUB menu offers **air-gapped** (default) and **hardened browser** entries, distinguished by a kernel command-line flag. Air-gapped boots unattended and never brings up networking. Hardened browser mode brings up networking only behind the firewall described below. An unattended boot always lands air-gapped.

### Network isolation

**Intent:** no traffic in air-gapped mode; in browser mode, only the browser reaches the internet.

**Approach:** networking is _masked_ in the base image (not merely disabled), so it cannot be woken in the background. A default nftables ruleset drops all input, forward and output except loopback. Hardened browser mode replaces that ruleset with one that permits egress only for the browser user (TCP 80/443 and QUIC), `systemd-timesync` (NTP to two pinned Cloudflare IP addresses, since there is no system DNS) and root (DHCP). DNS resolves inside the browser’s encrypted DoH rather than a system resolver. Wi-Fi is held off by `rfkill` in air-gapped mode; Bluetooth is blocked at the kernel-module level and its service masked in both modes (keyboards and mice are wired).

**Limits:** this trusts the firewall ruleset and the kernel’s enforcement of it; the per-application network denials (below) exist partly so that a firewall mistake is not the only thing standing between a compromised app and the wire.

### Privilege and user separation

**Intent:** the browser cannot reach the secret-handling world, and a compromised session cannot escalate.

**Approach:** Firefox runs as a dedicated no-shell user, `clearnet`, which owns nothing the other applications touch; everything else runs as the primary user, `superbacked`. After provisioning, `superbacked` is removed from the `sudo` group, so a compromised desktop session cannot gain root, remount the disk or rewrite the firewall. The narrow, audited exception is a single `sudoers` rule that lets `superbacked` launch Firefox as `clearnet` through the display bridge — one exact command line and nothing else.

### Display isolation (Wayland and waypipe)

**Intent:** applications cannot observe each other’s windows or keystrokes, and the browser in particular cannot see the app that handles secrets.

**Approach:** the OS is Wayland-only and the Xorg server is removed (X11 offers no inter-window isolation). Because Wayland deliberately gives one user’s apps no way onto another user’s screen, Firefox (running as `clearnet`) is bridged to the display with `waypipe`: one end runs as `superbacked` and talks to the compositor, the other runs as `clearnet` and hands Firefox a private display socket. The compositor keeps Firefox from seeing the Superbacked app’s surfaces. Every bundled app pins Wayland and fails closed if it is unavailable.

### Application confinement (AppArmor)

**Intent:** each application can do only what its job requires; the secret-handling apps additionally deny all network access, enforcing the air-gap _inside_ the process — a second layer beneath the firewall.

**Approach:** Debian packages and tarballs ship unconfined, so each of the three apps has a confined profile ([`superbacked-os-bootstrap-assets/apparmor/`](../../superbacked-os-bootstrap-assets/apparmor/)) that grants what the app genuinely needs and denies the rest. Profiles are syntax-checked at build time (a syntax error fails the build) and compiled and loaded by `apparmor.service` at each boot; they ship enforcing, and were tuned against real behavior on hardware using the **debug variant**: building with `BUILD_VARIANT=debug` (off by default) compiles the profiles in complain mode, disables kernel printk rate limiting so audit harvests are complete and keeps `sudo` for the primary user so profiles can be edited and reloaded in place (`apparmor_parser --replace`) — each a reason debug images are test artifacts, never for distribution. The on-device tuning loop is scripted in [`superbacked-os-utilities/debug/`](../../superbacked-os-utilities/debug/): `update-apparmor-profiles.sh` installs the repository profiles onto a running debug image (complain by default, `--enforce` to test fixes under real enforcement) and clears the journal for a clean harvest baseline, `capture-apparmor-log.sh` captures the audit events verbatim and `summarize-apparmor-log.sh` collapses a capture into unique accesses for rule folding. Profile changes made after that initial tuning go through the same loop — new rules are harvested and trial-enforced on hardware before a release ships. A few cross-cutting decisions are worth noting:

- Yubico Authenticator must never reach the network and denies the four socket families explicitly — `inet`, `inet6`, `packet` and `bluetooth` — rather than using a bare `deny network`, which would also sweep the AF_UNIX sockets that D-Bus and Wayland depend on and the netlink sockets that interface enumeration needs. The Superbacked app’s air-gap is expressed as a whitelist instead: driverless printing needs exactly one TCP hop (libcups fetches printer attributes over IPP from ipp-usb on localhost), and an explicit deny always beats an allow — so only loopback peers are allowed, every other inet destination is denied by default and UDP, packet and bluetooth stay denied outright.
- Firefox and the Superbacked app both keep the `userns` grant their content sandboxes require under Ubuntu 24.04’s restricted-user-namespace policy; removing it would break the sandbox.
- The Superbacked profile (an Electron app whose Chromium sandbox creates user namespaces and pivots root) is the hardest to confine, and its namespace/mount grants are deliberately broad — the intended confinement there is the network denial and filesystem scope, not the sandbox internals. The app installs from its deb to `/opt/Superbacked`, so the profile attaches to a stable binary path; the bootstrap overwrites the stock unconfined profile the deb’s postinst installs, the same way the Firefox profile overwrites Ubuntu’s.
- Loading profiles on a live system requires overriding the packaging. Debian and Ubuntu ship `apparmor.service` with live-media guards (`ConditionPathExists=!/run/live/overlay/work` for `live-boot`, `!/rofs/etc/apparmor.d` for legacy casper), added when overlayfs canonicalized paths in ways that broke profile matching ([Debian #922378](https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=922378)) — without intervention, a live system silently boots with every profile unloaded and every app unconfined. The bootstrap installs a systemd drop-in resetting the condition, which is the established fix (Kicksecure ships the same; [Debian #995367](https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=995367) requests dropping the guard outright and Ubuntu’s own live ISOs enforce AppArmor on overlayfs) and asserts at build time that the packaged guard is still the mechanism being reset, so packaging drift fails the build instead of shipping an unconfined image. Should complain-mode journals ever show denials on `/run/live/…` paths — the historical live-media problem the guard was protecting against — alias tunables mapping those paths onto profile paths are the remedy (Tails’ approach on its older live-boot layout).

Rather than enumerate every rule here, this document defers to the [profiles themselves](../../superbacked-os-bootstrap-assets/apparmor/), each commented rule-group by rule-group with the intent behind it.

### Browser hardening

**Intent:** even the one app allowed online should carry, remember and reveal as little as possible.

**Approach:** Firefox is configured through a locked enterprise policy (`/etc/firefox/policies/policies.json`): always private browsing, DNS-over-HTTPS with no fallback, strict tracking protection, WebRTC off, no telemetry, studies, accounts or updates, camera and microphone requests blocked and locked and downloads written to a dedicated folder without prompts. It runs as `clearnet`, over waypipe, with no audio path (which also removes microphone capture).

### Storage and filesystem

**Intent:** the only user-facing storage is removable USB media; internal disks stay hidden.

**Approach:** the root filesystem is the read-only squashfs. Internal disks are marked so the desktop never offers to mount them: one-click access to an internal drive would invite the persistence and exfiltration risks the OS exists to prevent. USB drives are the only storage surfaced to the user, and browser downloads are confined to one folder, exposed to the primary user through a non-executable bind mount (who can read and clear it — the browser gains nothing in return).

### Desktop hardening

**Intent:** narrow what the desktop exposes at rest and on physical contact.

**Approach:** USB drives never automount, and new USB devices are rejected while the screen is locked, so a device cannot be slipped into a locked machine. GNOME telemetry, app-usage and recent-file tracking, location services and problem reporting are all off, so the session records nothing about what was done.

### Boot integrity and Secure Boot

**Intent:** preserve the signed boot chain so Secure Boot continues to work on end-user hardware.

**Approach:** the image ships the distribution’s signed shim and GRUB verbatim from the source image’s EFI system partition; only the GRUB configuration is rewritten, to point at the live boot partition and to pin the exact kernel captured at build time. Every release is signed, and you can verify a download before flashing it — see [How to verify integrity of release](../guides/how-to-verify-integrity-of-release/README.md).

**Limits:** this inherits the distribution’s signing trust; it is not a measured-boot or attestation scheme.

### Supply chain and build

**Intent:** builds should be inspectable, as reproducible as possible and free of software that updates itself or phones home.

**Approach:** the image is provisioned in a Docker chroot starting from a vanilla Ubuntu install. The pipeline is scripted end to end: a vanilla autoinstall image is captured once ([`ubuntu-desktop-utilities/autoinstall.yaml`](../../ubuntu-desktop-utilities/autoinstall.yaml), [source image guide](../../superbacked-os-guides/superbacked-os-source-image-guide.md)), then every build provisions and assembles it in a container ([`package.sh`](../../package.sh) → [`docker/create-superbacked-os-live-image.sh`](../../docker/create-superbacked-os-live-image.sh) → [`superbacked-os-bootstrap.sh`](../../superbacked-os-utilities/superbacked-os-bootstrap.sh)). Packages resolve against a pinned Ubuntu archive snapshot (a timestamp in the bootstrap), so the same inputs yield the same packages. Firefox and Yubico Authenticator are pinned by version; the Python command-line tools are pinned by version and by the SHA-256 of their wheels — and `yubikey-prov.sh` by release tag and SHA-256 — verified before install; the Mozilla repository key and the Yubico release signature are checked against pinned fingerprints, with the build failing loudly on any mismatch. Updaters, crash reporters, the Ubuntu Pro client, snapd and other phone-home software are removed outright.

**Limits:** a few inputs still float — the pinned tools’ transitive dependencies, and the udev rules fetched from upstream repositories at build time. These are pulled over HTTPS but are neither version-pinned nor signature-verified, so their integrity rests on the transport and the upstream host. Full byte-for-byte reproducibility (fixed timestamps, deterministic filesystem and partition identifiers) is a known gap and a direction we intend to pursue, not a property we claim today.

## Verifying the hardening

Every layer above can be checked from a running session as the unprivileged `superbacked` user — `sudo` is removed by provisioning, and deliberately nothing below needs it. Launch the applications you want confinement-checked first; a process that is not running has no label to inspect.

**Application confinement.** The kernel module, the loader service (see the live-system note above — an inactive service means every profile sits unloaded) and the per-process labels:

```console
cat /sys/module/apparmor/parameters/enabled
systemctl is-active apparmor.service
cat /proc/$(pgrep --full /opt/Superbacked/superbacked | head --lines 1)/attr/current
cat /proc/$(pgrep --full /opt/yubico-authenticator/authenticator | head --lines 1)/attr/current
```

Expected: `Y`, `active` and labels ending in `(enforce)`. `unconfined` means profiles did not load; a `(complain)` label means a `BUILD_VARIANT=debug` test build.

**Network isolation.** In air-gapped mode:

```console
systemctl is-enabled NetworkManager.service
ip route show default
systemctl is-active nftables.service
timeout 3 bash -c "exec 3<> /dev/tcp/1.1.1.1/443" && echo reachable || echo unreachable
```

Expected: `masked`, no output (no default route), `active`, `unreachable`. The egress probe must print `unreachable` in hardened browser mode too — only the `clearnet` user may reach the internet there.

**Privilege and user separation.**

```console
id --name --groups
ls /home/clearnet
```

Expected: a group list without `sudo`, and `Permission denied`.

**Persistence and storage.**

```console
findmnt --noheadings --output FSTYPE /
findmnt --noheadings --output OPTIONS /home/superbacked/Downloads
```

Expected: `overlay` (the RAM-backed live root), and Downloads options containing `noexec`. For deeper persistence verification, see [How to verify data persistence is disabled](../guides/how-to-verify-data-persistence-is-disabled/README.md).

**Least software.**

```console
ls /usr/bin/Xorg /usr/lib/xorg/Xorg /usr/bin/snap
```

Expected: `No such file or directory` for all three.

## Source of truth

Everything described above is defined in these files. They are the authority; this document is a summary.

| Area                                                                                    | File                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OS provisioning — packages, the clearnet user, hardening, AppArmor install              | [`superbacked-os-utilities/superbacked-os-bootstrap.sh`](../../superbacked-os-utilities/superbacked-os-bootstrap.sh)                                                                                                                            |
| Image assembly — chroot build, kernel/initrd/ESP capture, squashfs, partitions, GRUB    | [`docker/create-superbacked-os-live-image.sh`](../../docker/create-superbacked-os-live-image.sh)                                                                                                                                                |
| AppArmor profiles — one per app, commented rule-group by rule-group                     | [`firefox`](../../superbacked-os-bootstrap-assets/apparmor/firefox), [`superbacked`](../../superbacked-os-bootstrap-assets/apparmor/superbacked), [`yubico-authenticator`](../../superbacked-os-bootstrap-assets/apparmor/yubico-authenticator) |
| AppArmor tuning — on-device profile update, harvest and summary scripts (debug variant) | [`superbacked-os-utilities/debug/`](../../superbacked-os-utilities/debug/)                                                                                                                                                                      |
| Build orchestration — host-side build, image splitting, release signing                 | [`package.sh`](../../package.sh)                                                                                                                                                                                                                |
| Build container — the Docker image the build runs in                                    | [`docker/Dockerfile`](../../docker/Dockerfile)                                                                                                                                                                                                  |
| Source image — vanilla Ubuntu autoinstall definition and ISO build                      | [`ubuntu-desktop-utilities/autoinstall.yaml`](../../ubuntu-desktop-utilities/autoinstall.yaml), [`docker/provision-ubuntu-desktop-iso.sh`](../../docker/provision-ubuntu-desktop-iso.sh)                                                        |
| Firefox enterprise policy                                                               | [`firefox-policies.json`](../../superbacked-os-bootstrap-assets/firefox-policies.json)                                                                                                                                                          |
| Firewall rulesets (nftables)                                                            | inline in the bootstrap (search `nftables`)                                                                                                                                                                                                     |

The firewall rulesets stay inline as heredocs in the bootstrap so they sit next to the comments explaining them; the Firefox policy is a separate asset, validated as JSON at build time like the AppArmor profiles.

## Related documentation

- [Superbacked OS source image guide](../../superbacked-os-guides/superbacked-os-source-image-guide.md) — how the vanilla source image is produced (the one hardware step before the containerized build).
- [How to run Superbacked OS on desktop or laptop](../guides/how-to-run-superbacked-os-on-desktop-or-laptop/README.md) — the user-facing run guide, including the memory requirement and the run-from-drive fallback.
- [How to verify data persistence is disabled](../guides/how-to-verify-data-persistence-is-disabled/README.md) — confirming nothing persists for yourself.
- [How to verify integrity of release](../guides/how-to-verify-integrity-of-release/README.md) — verifying a signed download before flashing.
- [Block](block.md) and [Blockset](blockset.md) technical documentation — the cryptographic design of the blocks and blocksets this OS creates and restores.
- [Standalone archive](standalone-archive.md) and [Detached archive](detached-archive.md) technical documentation — the encrypted file archives Superbacked can also create (standalone on their own, or detached during block or blockset creation).

## Known limitations and residual risk

Collected honestly in one place:

- **Cold-boot / physical access.** `init_on_free` reduces but does not remove the risk from an attacker with physical access to RAM.
- **The AppArmor confinement is new.** This is the first Superbacked OS release with per-application AppArmor profiles. All three were tuned on hardware through the debug-variant loop described above — complain-mode harvests folded into rules, then per-app trial enforcement — but on one machine model and without third-party review, and the Superbacked (Electron) profile grants broad namespace/mount operations by necessity of the Chromium sandbox. The packaged live-media guard also means an unmodified live system silently loads no profiles at all — the bootstrap override described above prevents this, and the verification section exists so confinement is checked on the running system rather than assumed. One tightening is already backlogged: session D-Bus access is unscoped in the `superbacked` and `yubico-authenticator` profiles (`dbus (send, receive) bus=session,` — any interface on the session bus is reachable), and scoping it to named interfaces awaits a future debug-variant hardware pass, since D-Bus rules break too subtly to tighten without a harvest. All three profiles want review.
- **Reproducibility is partial.** Same-inputs-same-packages, not yet byte-for-byte identical images.
- **Floating inputs.** The pinned tools’ transitive Python dependencies and the upstream-fetched Trezor udev rules are pulled over HTTPS without a version pin or a pinned signature.
- **Upstream trust.** The system inherits the trust placed in Ubuntu, Mozilla, Yubico and their signing keys.
- **Single, well-known user.** The provisioning password is public by design; confidentiality does not rest on it, but it is worth knowing.
- **The clipboard is shared across the seat.** Copy and paste is the one deliberate data path between applications — it is how a restored secret or derived password reaches the login it unlocks — and on Wayland the clipboard is global to the session, spanning the `superbacked`/`clearnet` boundary in hardened browser mode (waypipe bridges Firefox to the same compositor). The compositor hands the selection only to a focused window, so background clipboard sniffing is not possible, but a compromised application could read what the user copied elsewhere whenever it next holds focus. The Superbacked app narrows the window on its side: copied secrets are cleared after a configurable delay, and a guard clears them should the app die before the delay elapses.
- **Browser printing is off.** Firefox is denied access to CUPS, so it cannot print to a physical printer — printing blocks is the Superbacked app’s job, and the browser is kept away from the printer and from other print jobs. Saving a page as a PDF still works, since that writes a file rather than reaching the printer.
- **Browser audio is off.** A deliberate trade to close microphone capture, since playback and capture share one socket.
