#! /bin/bash
# Authors everything Superbacked OS adds on top of the pinned software
# that superbacked-os-bootstrap-base.sh installed just before — GNOME
# configuration, users, hardening, the Superbacked app and its AppArmor
# profiles. Runs as root inside a chroot of the source image overlay,
# invoked by docker/create-superbacked-os-live-image.sh at packaging
# time, after the base bootstrap (or its cached layer) is in place.
#
# Contract with the caller: root, the base bootstrap’s result present,
# /dev /dev/pts /proc /sys /run mounted, the app build and repository
# assets bind mounted at /run/dist and
# /run/superbacked-os-bootstrap-assets, and a policy-rc.d that keeps
# maintainer scripts from starting services. No systemd, dbus or logind
# is running — everything below is plain filesystem writes, offline
# systemctl symlinks and one local apt install (the app deb). Nothing
# here downloads: every upstream fetch lives in the base bootstrap, so
# its cached layer is the only network-dependent stage. Each build
# starts from a pristine overlay above the base layer, so nothing here
# guards against re-runs. Exporting BUILD_VARIANT=debug builds the
# debug variant — app profiles log denials (complain) instead of
# enforcing and superbacked keeps sudo for on-device profile iteration
# (see “Disabling sudo” below).
#
# Usage (inside the chroot):
# bash superbacked-os-bootstrap-main.sh 2.0.0

set -o errexit
set -o pipefail

version="${1}"

if [ -z "${version}" ]; then
  printf "%s\n" "Error: usage: superbacked-os-bootstrap-main.sh version" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

printf "%s\n" "Starting main bootstrap…"

printf "%s\n" "Writing release marker…"

# Identifies the running system as Superbacked OS to the Superbacked app
# (which recommends provisioning YubiKey secrets here) — the marker
# gates recommendations only, not a security boundary, so a plain file
# is enough
tee /etc/superbacked-os-release > /dev/null << EOF
VERSION=${version}
EOF

printf "%s\n" "Configuring GNOME…"

# A quiet, dark desktop: black background, floating bottom dock
# limited to pinned apps and mounted drives, no icons on the desktop,
# no location services or telemetry, USB media never mounts itself, and
# the terminal is white text on black. Written as a system dconf
# database (the gsettings tool needs a session bus, which a chroot does
# not have); the profile makes every session read it, and dconf update
# compiles it offline.
mkdir --parents /etc/dconf/db/local.d /etc/dconf/profile

tee /etc/dconf/profile/user > /dev/null << 'EOF'
user-db:user
system-db:local
EOF

# Dock favorites show what the image is for: official apps first —
# Superbacked, then the bundled apps, Firefox closing the set (in
# air-gapped mode its launcher explains that hardened browser mode is
# required, making the pin the discovery path into that mode rather
# than a dead icon) — followed by Files and Terminal utilities.
# Favorites are desktop-file ids resolved at session start, so
# superbacked.desktop can be pinned now even though the app itself is
# injected later (which is what lets app updates ship without
# re-running this bootstrap).
tee /etc/dconf/db/local.d/00-superbacked > /dev/null << 'EOF'
[org/gnome/desktop/background]
picture-uri='none'
picture-uri-dark='none'
primary-color='#000000'

[org/gnome/desktop/interface]
color-scheme='prefer-dark'
# color-scheme darkens GNOME and libadwaita apps; legacy GTK apps
# follow gtk-theme instead — both are needed for a fully dark desktop.
gtk-theme='Yaru-dark'

[org/gnome/desktop/media-handling]
automount=false

[org/gnome/desktop/privacy]
remember-app-usage=false
remember-recent-files=false
report-technical-problems=false
send-software-usage-stats=false

[org/gnome/mutter]
center-new-windows=true

[org/gnome/shell]
favorite-apps=['superbacked.desktop', 'com.yubico.yubioath.desktop', 'firefox.desktop', 'org.gnome.Terminal.desktop', 'org.gnome.Nautilus.desktop']

[org/gnome/shell/extensions/dash-to-dock]
dash-max-icon-size=48
dock-position='BOTTOM'
extend-height=false
show-show-apps-button=false

[org/gnome/shell/extensions/ding]
show-home=false

[org/gnome/system/location]
enabled=false

[org/gnome/terminal/legacy/profiles:]
default='b1dcc9dd-5262-4d8d-a863-c897e6d979b9'
list=['b1dcc9dd-5262-4d8d-a863-c897e6d979b9']

[org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9]
background-color='rgb(0,0,0)'
foreground-color='rgb(255,255,255)'
use-theme-colors=false
EOF

dconf update

printf "%s\n" "Patching ubuntu-dock…"

# DING’s desktop helper flashes into the dock’s running-apps slot at
# login — its extension only adopts the window on the compositor map
# signal, and DING itself must stay (yubikey-prov.sh stages secrets on
# ~/Desktop). Pre-adoption the shell tracks the helper as a fallback
# window-backed app (id “window:N”), and every legitimate app on this
# image resolves to a real id (volumes included) — so window-backed
# apps are dropped from the running section. The assertions fail the
# build if ubuntu-dock drifts.
dock_dash=/usr/share/gnome-shell/extensions/ubuntu-dock@ubuntu.com/dash.js

if [ "$(grep --count "this\._appSystem\.get_running()" "${dock_dash}")" != "1" ]; then
  printf "%s\n" "Error: ubuntu-dock running-apps anchor not found exactly once in ${dock_dash}" >&2
  exit 1
fi

awk '{ print }
/this\._appSystem\.get_running\(\)/ {
  print "        // Superbacked: hide window-backed apps — DING’s pre-adoption"
  print "        // helper (see bootstrap)."
  print "        running = running.filter((app) => !app.get_id().startsWith(\"window:\"));"
}' "${dock_dash}" > "${dock_dash}.patched"

mv "${dock_dash}.patched" "${dock_dash}"

if [ "$(grep --count 'startsWith("window:")' "${dock_dash}")" != "1" ]; then
  printf "%s\n" "Error: DING filter failed to apply to ${dock_dash}" >&2
  exit 1
fi

printf "%s\n" "Disabling Xorg login sessions…"

# Superbacked OS is Wayland-only — X11 has no window isolation (any
# client can observe other windows and keystrokes), which is why every
# bundled app pins Wayland and fails closed without it. Removing the
# Xorg session files removes “Ubuntu on Xorg” from the login screen,
# and the session cog with it (GDM only shows the cog when more than
# one session exists). Hardware that cannot run Wayland then fails
# loudly at login instead of silently offering a snoopable session.
# (The Xorg server packages themselves are uninstalled with the other
# extraneous software below.)
rm --force /usr/share/xsessions/*.desktop

printf "%s\n" "Configuring audio…"

# On the ThinkPad X1 Carbon Gen 10 the speaker amplifier ignores the
# hardware volume control — the volume keys move but the sound level
# never changes. Forcing software volume (api.alsa.soft-mixer) makes
# WirePlumber scale the samples itself, sidestepping the amplifier.
#
# The workaround must not apply everywhere: soft-mixer freezes the
# hardware mixer at whatever level the driver initialized it to, and on
# machines with a working amplifier that level can be low — capping
# audio at a whisper even at full volume (seen on the ThinkPad X1
# Carbon Gen 6). WirePlumber cannot scope the rule itself: its
# sandboxed Lua cannot read the model from DMI, and every property its
# matcher sees is generic (both ThinkPads above expose the same
# “HDA Intel PCH” device). So the rule ships inert in /usr/local/share
# and a udev rule copies it into WirePlumber’s config the moment the
# kernel registers a codec whose chip name and board subsystem id are
# known bad (the same key the kernel’s own HDA quirk tables use) on a
# matching machine model (DMI) — so a model variant with different
# audio hardware is left alone. Built-in codecs register during
# early-boot device discovery, long before the login screen brings up
# audio. The copy lands in the RAM overlay, so unaffected machines
# never see it.
#
# table.insert appends to the default rules — an assignment would
# replace them, dropping the rules that start the codec and silencing
# audio. This is WirePlumber 0.4 (Lua) syntax; 0.5 would need the
# SPA-JSON format under wireplumber.conf.d instead.
mkdir --parents /etc/wireplumber/main.lua.d /usr/local/share/superbacked

tee /usr/local/share/superbacked/51-alsa-soft-mixer.lua > /dev/null << 'EOF'
table.insert(alsa_monitor.rules, {
  matches = {
    {
      { "device.name", "matches", "alsa_card.*" },
    },
  },
  apply_properties = {
    ["api.alsa.soft-mixer"] = true,
  },
})
EOF

# One rule line per affected machine, matching codec and model
# together (the bracketed ATTR reads the DMI device, letting one rule
# match across devices) and copying the WirePlumber rule into place
# right there — cp is instant, well within what udev RUN allows. When
# adding a machine, read the values off it with:
#   cat /sys/class/dmi/id/product_version
#   cat /sys/class/sound/hwC*D*/chip_name
#   cat /sys/class/sound/hwC*D*/subsystem_id
# and dry-run the match with udevadm test /sys/class/sound/hwC0D0
tee /etc/udev/rules.d/99-superbacked-soft-mixer.rules > /dev/null << 'EOF'
# ThinkPad X1 Carbon Gen 10 (Realtek ALC287, Lenovo board 0x17aa22e7)
ACTION=="add", SUBSYSTEM=="sound", KERNEL=="hwC?D?", ATTR{chip_name}=="ALC287", ATTR{subsystem_id}=="0x17aa22e7", ATTR{[dmi/id]product_version}=="ThinkPad X1 Carbon Gen 10", RUN+="/usr/bin/cp /usr/local/share/superbacked/51-alsa-soft-mixer.lua /etc/wireplumber/main.lua.d/51-alsa-soft-mixer.lua"
EOF

printf "%s\n" "Configuring udev rules…"

# Hardware access rules are upstream’s (the Trezor rules installed by
# superbacked-os-bootstrap-base.sh, the YubiKey rule shipped by
# the Superbacked deb below); the rules here only shape what the
# desktop shows.
#
# Internal disks are invisible to the desktop: USB drives are the only
# user-facing storage on Superbacked OS, and offering to mount internal
# disks with one click would invite the persistence and exfiltration
# risks the OS exists to prevent. udisks skips devices marked
# UDISKS_IGNORE, which hides them from Files and the dock alike.
tee /etc/udev/rules.d/99-superbacked-ignore-internal-disks.rules > /dev/null << 'EOF'
SUBSYSTEM=="block", ENV{ID_BUS}!="usb", ENV{UDISKS_IGNORE}="1"
EOF

# The boot drive is not user-facing storage either: its SUPERBACKED
# partition (the ext4 boot partition holding the squashfs — see
# docker/create-superbacked-os-live-image.sh) is mounted by live-boot,
# not by the user, so it has no reason to appear in Files or the dock.
# Matching on filesystem type and label cannot catch backup drives,
# which are exFAT.
tee /etc/udev/rules.d/99-superbacked-ignore-boot-partition.rules > /dev/null << 'EOF'
SUBSYSTEM=="block", ENV{ID_FS_TYPE}=="ext4", ENV{ID_FS_LABEL}=="SUPERBACKED", ENV{UDISKS_IGNORE}="1"
EOF

# WebAuthn in the hardened browser: FIDO security keys are the one
# device the browser user may reach. Seat ACLs (uaccess) only ever
# cover the logged-in primary user, and the browser user has no seat,
# so the FIDO hidraw node is additionally group-owned by browser.
# systemd’s fido_id tags exactly the FIDO interface (usage page F1D0)
# of every vendor’s key; a YubiKey’s OTP interface, which the
# Superbacked app drives for challenge-response, is a separate hidraw
# node that stays out of the browser user’s reach. Read the match off a
# plugged-in key with udevadm info --query=property --name=/dev/hidrawN
# (look for ID_FIDO_TOKEN=1) and dry-run with udevadm test.
tee /etc/udev/rules.d/99-superbacked-browser-fido.rules > /dev/null << 'EOF'
SUBSYSTEM=="hidraw", ENV{ID_FIDO_TOKEN}=="1", GROUP="browser", MODE="0660"
EOF

printf "%s\n" "Installing Superbacked app…"

# The app build and repository assets are bind mounted into the chroot
# under /run by the caller — no tarball intermediary — and the mounts
# vanish with the /run tmpfs when provisioning ends, leaving no trace
# in the image. The deb installs the app to /opt/Superbacked and ships
# what the AppImage era hand-placed: the hicolor icons, the desktop
# entry (shadowed just below) and the command line entry point
# /usr/bin/superbacked (superbacked provision-yubikey, superbacked
# derive-password…) — an update-alternatives symlink chain the kernel
# resolves to /opt/Superbacked/superbacked, so AppArmor confinement
# holds for terminal launches. Its postinst also drops a stock
# unconfined AppArmor profile, overwritten below. Recommends are
# skipped: the deb’s only recommendation (libappindicator3-1, tray
# support) has no user here. The deb also ships the vendor-wide
# YubiKey hidraw udev rule that opens the OTP (challenge-response)
# interface to seat users — here and on stock Ubuntu installs alike,
# complementing systemd’s fido_id (FIDO interfaces) and the Trezor
# rules installed by superbacked-os-bootstrap-base.sh. The deb’s
# dependencies are already present from the base layer, so this is the
# one apt operation of this script and needs no network.
apt install --no-install-recommends --yes \
  "/run/dist/superbacked-x64-${version}.deb"

# The deb’s stock desktop entry launches the app without a display
# backend pin — shadow it with a same-name entry in the higher-priority
# directory that pins Wayland (the same mechanism “Overriding stock
# launchers” below uses for Firefox).
mkdir --parents /usr/local/share/applications

cp \
  /run/superbacked-os-bootstrap-assets/superbacked.desktop \
  /usr/local/share/applications/superbacked.desktop

printf "%s\n" "Installing AppArmor profiles…"

# Confinement for the bundled apps — what snap interfaces used to
# provide (each profile documents the mapping). Installed under the
# bare app name — the convention stock profiles use (Ubuntu’s firefox,
# the Superbacked deb postinst’s superbacked) — so where a stock
# profile exists it is deliberately overwritten: the stock ones are
# unconfined (they exist only to grant userns) and two profiles cannot
# share an attachment path.
cp \
  /run/superbacked-os-bootstrap-assets/apparmor/superbacked-browser \
  /etc/apparmor.d/superbacked-browser
cp \
  /run/superbacked-os-bootstrap-assets/apparmor/firefox \
  /etc/apparmor.d/firefox
cp \
  /run/superbacked-os-bootstrap-assets/apparmor/superbacked \
  /etc/apparmor.d/superbacked
cp \
  /run/superbacked-os-bootstrap-assets/apparmor/yubico-authenticator \
  /etc/apparmor.d/yubico-authenticator

# BUILD_VARIANT=debug builds a debug image whose app profiles log
# denials instead of enforcing them — used to iterate on the profiles
# against journalctl on hardware. Release builds enforce.
if [ "${BUILD_VARIANT:-}" = "debug" ]; then
  # Add complain to each profile’s flags — folded into an existing
  # flags=(…) when present (superbacked carries attach_disconnected),
  # otherwise added as a new flags=(complain). Anchoring on the closing
  # brace rather than the profile name tolerates the “{” in Firefox’s
  # attachment path; the t skips the second rule once the first fires.
  sed --in-place --regexp-extended \
    -e 's|flags=\(([^)]*)\) \{$|flags=(\1 complain) {|' \
    -e 't' \
    -e 's| \{$| flags=(complain) {|' \
    /etc/apparmor.d/superbacked-browser \
    /etc/apparmor.d/firefox \
    /etc/apparmor.d/superbacked \
    /etc/apparmor.d/yubico-authenticator
fi

# Compile without loading — catches profile syntax errors at build time
# instead of at the first boot.
for profile in superbacked-browser firefox superbacked yubico-authenticator; do
  apparmor_parser --skip-kernel-load "/etc/apparmor.d/${profile}"
done

# apparmor.service ships a live-media guard
# (ConditionPathExists=!/run/live/overlay/work) that would silently
# leave every profile unloaded on the always-live Superbacked OS — a
# drop-in resetting the condition is the established fix. History,
# precedents and runtime verification are documented in
# docs/technical-documentation/superbacked-os-security.md. The
# assertion fails the build if packaging ever changes the guard
# mechanism — resetting the condition would no longer be known
# sufficient, and a broken build beats an image that silently boots
# unconfined.
if ! grep --quiet '^ConditionPathExists=!/run/live/overlay/work$' \
  /usr/lib/systemd/system/apparmor.service; then
  printf "%s\n" "Error: apparmor.service no longer ships the live-system guard this override resets" >&2
  exit 1
fi

mkdir --parents /etc/systemd/system/apparmor.service.d

tee /etc/systemd/system/apparmor.service.d/superbacked-live.conf > /dev/null << 'EOF'
[Unit]
# Reset the packaged live-system guard — profiles must load on the
# (always live) Superbacked OS
ConditionPathExists=
EOF

printf "%s\n" "Configuring browser user…"

# Firefox runs as a separate user named browser — the only identity
# allowed to reach the internet in hardened browser mode (the “hardened
# browser” boot entry). It has no shell and no sudo rights; lingering
# keeps its user manager (session bus, XDG_RUNTIME_DIR) available
# without a graphical login.
useradd --create-home --shell /usr/sbin/nologin browser

# superbacked must be in the browser group to hand the browser bridge
# socket (created below) over to that user — files can only be
# re-grouped to a group their owner belongs to.
usermod --append --groups browser superbacked

# That membership is for the socket handover and the shared Downloads
# folder (2770), not for browsing the browser user’s home — which
# useradd left group-traversable (750), letting superbacked enumerate
# it and enter world-readable corners like .config. superbacked reaches
# Downloads through the bind mount at its own home, and path resolution
# through a mountpoint never walks /home/browser, so the home closes
# completely.
chmod 700 /home/browser

# What loginctl enable-linger records — logind is not running in the
# chroot, but all it does is create this marker.
mkdir --parents /var/lib/systemd/linger
touch /var/lib/systemd/linger/browser

# The browser user has no desktop session, so the desktop portal
# service Firefox consults at startup can never answer — every launch
# would stall for ~25 seconds waiting for it. Masking the service for
# that user makes those calls fail instantly, so Firefox starts right
# away. superbacked’s own portals are untouched. (Ownership is handed
# to the browser user at the end of provisioning.)
mkdir --parents /home/browser/.config/systemd/user
ln --force --symbolic /dev/null \
  /home/browser/.config/systemd/user/xdg-desktop-portal.service

printf "%s\n" "Configuring Firefox policies…"

# Firefox is configured through an enterprise policy, locked so nothing
# can be changed from inside the browser (the deb reads
# /etc/firefox/policies/policies.json natively). Its confinement lives
# in an AppArmor profile installed at image creation time (see
# superbacked-os-bootstrap-assets/apparmor/firefox): no camera, no
# microphone, no X11, no printing, no USB media, no home folders beyond
# its own profile and Downloads. Official policy keys are used wherever
# one exists; the Preferences block pins only settings that have none.
# The JSON keys are alphabetical; by intent:
#
#   Privacy — no Firefox accounts, Pocket, studies or telemetry, and no
#     first-run welcome or post-update pages (the amnesic profile would
#     show them every boot).
#   Devices — camera and microphone requests are blocked and locked, so
#     no site can prompt for them (the AppArmor profile denies the
#     hardware outright; this stops the request reaching that layer).
#   Updates — off entirely: the image is frozen, versions are decided
#     at image creation time by apt.
#   History — Firefox always runs in private browsing; nothing is
#     remembered between sessions.
#   Network — DNS goes exclusively through Quad9’s encrypted resolver,
#     never the system resolver (the pinned address bootstraps it);
#     HTTPS is required, tracking protection is strict, WebRTC is off.
#   Passwords — Firefox never saves, autofills or suggests credentials,
#     addresses or payment methods; Firefox Relay and profile
#     backup/restore are off.
#   Search — DuckDuckGo by default; address bar recommendations, search
#     suggestions and trending searches are off.
#   New tab — a blank page: no recommendations, shortcuts, sponsored
#     content or widgets. The FirefoxHome policy locks the sections
#     (and their sub-prefs with them); widgets.enabled is the one pref
#     the widgets need — every widget’s render is unconditionally gated
#     behind it (verified in the newtab source: rollout levers are
#     ANDed after it, and locked prefs resist experiment writes), so
#     there is no per-widget enumeration to chase across Firefox
#     releases.
#   AI — everything blocked through the official AIControls policy;
#     browser.ml.enable is also pinned off so the on-device inference
#     engine itself can never start (the policy deliberately leaves that
#     one alone).
#   Downloads — saved straight to the dedicated downloads folder, no
#     picker dialogs.
#   Dark mode — pinned; Firefox runs as the browser user and cannot see
#     the desktop’s dark-mode setting.
#   Desktop portals — disabled; the browser user has no desktop session
#     to answer portal calls, so they could only ever hang (see
#     “Configuring browser user” above).
mkdir --parents /etc/firefox/policies

cp /run/superbacked-os-bootstrap-assets/firefox-policies.json \
  /etc/firefox/policies/policies.json

# Validate the policy is well-formed JSON — a stray comma would
# otherwise surface only when Firefox silently ignores the policy at
# runtime.
python3 -m json.tool /etc/firefox/policies/policies.json > /dev/null

printf "%s\n" "Overriding stock launchers…"

# Replace the stock launcher with a same-name entry in a
# higher-priority directory, so the familiar icon does the right thing:
#   Firefox → starts through the superbacked-browser wrapper (hardened
#             browser mode only)
# The Exec assertion fails loudly if Mozilla ever reshapes its desktop
# file — better a broken build than a dock icon that bypasses the
# wrapper.
if ! grep --quiet '^Exec=firefox' /usr/share/applications/firefox.desktop; then
  printf "%s\n" "Error: unexpected Exec lines in firefox.desktop" >&2
  exit 1
fi

mkdir --parents /usr/local/share/applications

cp \
  /usr/share/applications/firefox.desktop \
  /usr/local/share/applications/firefox.desktop

# Only the main entry accepts a URL. Drop upstream desktop actions:
# the bridge does not implement new-window or private-window options.
sed --in-place \
  -e '/^\[Desktop Action /,$d' \
  -e '/^Actions=/d' \
  -e 's|^Exec=.*|Exec=/usr/local/bin/superbacked-browser %u|' \
  /usr/local/share/applications/firefox.desktop

# Same-name overrides shadow the stock entries including their MIME
# claims, which GIO only reads from a directory’s mimeinfo.cache. dpkg
# triggers maintain the cache for /usr/share/applications but nothing
# does for /usr/local — regenerate it so the Firefox override keeps
# its web-type associations.
update-desktop-database /usr/local/share/applications

printf "%s\n" "Configuring shared Downloads folder…"

# Firefox saves downloads here — the one place the confined browser can
# write outside its own profile (the AppArmor profile and policies.json
# both point at it). Created now so it exists on every boot; whatever
# lands in it disappears at reboot. superbacked (via the browser
# group) can read and clear it; no one else can.
mkdir --parents /home/browser/Downloads
chown browser:browser /home/browser/Downloads
chmod 2770 /home/browser/Downloads

# Show the same folder at superbacked’s ~/Downloads so downloaded files
# are easy to reach and move to external storage. This is one-way —
# superbacked gets a view into the browser’s downloads, the browser
# gains nothing — and nothing in it can be executed in place. The view
# is for the user’s own tools (a shell, Files): the files are
# browser-owned and the confined app’s home grant is owner-scoped, so
# the app cannot read them directly — a download meant for the app is
# copied out first.
mkdir --parents /home/superbacked/Downloads

tee /etc/systemd/system/home-superbacked-Downloads.mount > /dev/null << 'EOF'
[Unit]
Description=Shared browser Downloads (browser user → superbacked)
# No After=local-fs.target here — it would create an ordering cycle that
# leaves the mount dead at boot. The default mount dependencies already
# order it correctly.

[Mount]
What=/home/browser/Downloads
Where=/home/superbacked/Downloads
Type=none
# x-gvfs-hide keeps the bind mount out of the file manager sidebar —
# it would otherwise show as a mounted volume, inviting users to
# unmount their own Downloads folder.
Options=bind,noexec,nosuid,nodev,nosymfollow,x-gvfs-hide

[Install]
WantedBy=multi-user.target
EOF

systemctl enable home-superbacked-Downloads.mount

printf "%s\n" "Configuring toram status…"

# live-boot copies Superbacked OS to memory (toram) when there is
# enough of it and silently falls back to running from the USB flash
# drive when there is not — and users can also remove toram on purpose
# at the GRUB menu to run tethered from the drive (documented in the
# run guide). The desktop looks identical either way, and unplugging
# the drive while running from it crashes the session. This warning,
# shown at login only when running from the drive, states that fact
# without guessing why — it is the only signal a user gets. When the OS
# is in memory no dialog appears and the drive can simply be unplugged,
# as documented. Exits quietly on non-live boots (the source system).
tee /usr/local/bin/superbacked-toram-status > /dev/null << 'EOF'
#! /bin/bash

medium_fstype="$(findmnt --noheadings --output FSTYPE /run/live/medium 2> /dev/null)"

if [ -n "${medium_fstype}" ] && [ "${medium_fstype}" != "tmpfs" ]; then
  zenity --warning \
    --no-wrap \
    --text "Superbacked OS is running directly from the USB flash drive.\nThe drive needs to stay plugged in for the session to keep running." \
    --title "Superbacked OS" 2> /dev/null
fi
EOF

chmod +x /usr/local/bin/superbacked-toram-status

tee /etc/xdg/autostart/superbacked-toram-status.desktop > /dev/null << 'EOF'
[Desktop Entry]
Type=Application
Name=Superbacked toram status
Exec=/usr/local/bin/superbacked-toram-status
EOF

printf "%s\n" "Configuring hardened browser launcher…"

# Directory for the browser bridge socket — superbacked creates the
# socket, the browser user connects to it. (The tmpfiles.d file is
# applied at every boot by systemd-tmpfiles-setup.service.)
tee /etc/tmpfiles.d/browser-bridge.conf > /dev/null << 'EOF'
d /run/browser-bridge 0750 superbacked browser -
EOF

# The launcher never connects to the compositor by its public name.
# Connecting to a Wayland socket needs the same AppArmor permission as
# replacing it, so a compromised app — which must reach the compositor
# — could unlink wayland-0 and bind a fake in its place, or bind one
# under another name and rename it over, and a name-based check cannot
# tell (the kernel records a socket’s bind-time string, which need not
# be the path). A hard link references the inode instead, and
# connect() resolves a path to its inode, so a link made at session
# start keeps reaching mutter’s original socket whatever later happens
# to the name. It lives in a directory the app profile grants nothing
# under, so the app can neither replace nor remove it. This user unit
# makes the link once the session is up; the launcher fails closed
# without it. A compositor restart mid-session leaves the link stale
# until the next login — the safe direction.
mkdir --parents /usr/local/libexec
tee /usr/local/libexec/superbacked-browser-compositor > /dev/null << 'EOF'
#! /bin/bash

set -o errexit

# The user manager imports WAYLAND_DISPLAY from the session before
# graphical-session.target is reached; it must be a plain socket name.
display="${WAYLAND_DISPLAY:-wayland-0}"
if [[ ! "${display}" =~ ^wayland-[0-9]+$ ]]; then
  printf "%s\n" "Error: unsupported Wayland display ${display}" >&2
  exit 1
fi

socket="${XDG_RUNTIME_DIR:?}/${display}"
link_dir="${XDG_RUNTIME_DIR}/superbacked-browser"

for _ in $(seq 100); do
  if [ -S "${socket}" ]; then
    break
  fi
  sleep 0.1
done

if [ ! -S "${socket}" ]; then
  printf "%s\n" "Error: ${socket} is not a socket" >&2
  exit 1
fi

mkdir --parents "${link_dir}"
ln --force "${socket}" "${link_dir}/compositor"
EOF

chown root:root /usr/local/libexec/superbacked-browser-compositor
chmod 755 /usr/local/libexec/superbacked-browser-compositor

# Both boot modes need it: the air-gapped notice is a Wayland dialog
# too. Ordered after the session target so mutter is up; the script
# still waits for the socket rather than trusting the ordering.
tee /etc/systemd/user/superbacked-browser-compositor.service > /dev/null << 'EOF'
[Unit]
Description=Superbacked OS hardened browser (compositor socket link)
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/libexec/superbacked-browser-compositor

[Install]
WantedBy=graphical-session.target
EOF

systemctl --global enable superbacked-browser-compositor.service

tee /usr/local/bin/superbacked-browser > /dev/null << 'EOF'
#! /bin/bash -p

set -o errexit

# Standard input and output come from the caller — a compromised app
# could read Firefox’s output back through them — so both are closed
# off here for everything below. Standard error stays inherited: it is
# how terminal launches show their errors.
exec < /dev/null > /dev/null

# Privileged shell mode ignores caller-controlled startup files and
# functions. Export only explicit session values to child processes;
# nothing is taken from the caller’s environment.
uid="$(/usr/bin/env --ignore-environment /usr/bin/id --user)"
environment=(
  GDK_BACKEND=wayland
  GSETTINGS_BACKEND=memory
  GTK_A11Y=none
  GTK_USE_PORTAL=0
  HOME=/home/superbacked
  LANG=C.UTF-8
  LOGNAME=superbacked
  NO_AT_BRIDGE=1
  PATH=/usr/bin:/bin
  USER=superbacked
  "WAYLAND_DISPLAY=/run/user/${uid}/superbacked-browser/compositor"
  "XDG_CACHE_HOME=/run/user/${uid}/superbacked-browser/cache"
  "XDG_CONFIG_HOME=/run/user/${uid}/superbacked-browser/config"
  "XDG_RUNTIME_DIR=/run/user/${uid}"
)
run() {
  /usr/bin/env --ignore-environment "${environment[@]}" "$@"
}

# Dialogs carry the desktop’s activation token. GNOME Shell hands one
# to whatever a dock click launches and keeps the icon in its
# “starting” state — spinner on, further clicks ignored — until a
# window presents that token or the app id the desktop entry names, or
# a timeout runs out. Firefox’s window matches by app id; a zenity
# dialog does not, so without the token the air-gapped notice leaves
# the icon starting for the timeout’s length after it is dismissed.
# The token is single-use and names nothing but this launch, so it is
# the one caller variable passed through.
dialog() {
  run /usr/bin/env ${XDG_ACTIVATION_TOKEN:+"XDG_ACTIVATION_TOKEN=${XDG_ACTIVATION_TOKEN}"} /usr/bin/zenity "$@"
}

# The compositor is reached only through the hard link the session
# unit made (see superbacked-browser-compositor above): never by the
# public name a compromised app could replace, and never from the
# caller’s environment. Without the link there is no trusted
# compositor, so nothing is shown and nothing is bridged.
if [ ! -S "/run/user/${uid}/superbacked-browser/compositor" ]; then
  printf "%s\n" "Error: compositor link missing — the session unit did not run" >&2
  exit 1
fi

# The launcher inherits superbacked’s home as working directory, which
# the browser user cannot read — move somewhere neutral before
# switching users.
cd /

# Keep this list identical to src/shared/allowedExternalUrls.ts and
# the other browser script. Match literally, without normalization.
allowed_urls=(
  "https://superbacked.com/superbacked-os"
)
allowed=false
if (( $# == 0 )); then
  allowed=true
elif (( $# == 1 )); then
  for allowed_url in "${allowed_urls[@]}"; do
    if [[ "$1" == "${allowed_url}" ]]; then
      allowed=true
      break
    fi
  done
fi
if [[ "${allowed}" != true ]]; then
  printf "%s\n" "Error: expected zero arguments or one allowed external URL" >&2
  exit 1
fi

if ! run /usr/bin/grep --quiet superbacked.browser /proc/cmdline; then
  dialog --info \
    --no-wrap \
    --text "Superbacked OS is running in air-gapped mode.\nPlease reboot and select “Superbacked OS (hardened browser)” to use browser." \
    --title "Superbacked OS" 2> /dev/null
  exit 1
fi

bridge_socket="/run/browser-bridge/waypipe.sock"

# Wayland deliberately has no way for one user’s apps to appear on
# another user’s screen, so waypipe bridges the two: one end runs as
# superbacked and talks to the compositor, the other runs as the
# browser user and gives Firefox its own private display socket. The
# compositor keeps Firefox from seeing the Superbacked app. Not
# oneshot: the server side must create a display socket (see the
# helper below), and each Wayland connection Firefox opens arrives at
# this end as its own bridge connection; the listener is killed on exit
# below.
run /usr/bin/rm --force "${bridge_socket}"

/usr/bin/env --ignore-environment "${environment[@]}" \
  /usr/bin/waypipe --socket "${bridge_socket}" client &

waypipe_pid=$!

# Keep the PID of waypipe itself and reap it on success or failure.
cleanup() {
  kill "${waypipe_pid}" 2> /dev/null || true
  wait "${waypipe_pid}" 2> /dev/null || true
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

for _ in $(run /usr/bin/seq 50); do
  if [ -S "${bridge_socket}" ]; then
    break
  fi
  run /usr/bin/sleep 0.1
done

if [ ! -S "${bridge_socket}" ]; then
  dialog --error \
    --no-wrap \
    --text "Browser bridge failed to start" \
    --title "Superbacked OS" 2> /dev/null
  exit 1
fi

run /usr/bin/chgrp browser "${bridge_socket}"
run /usr/bin/chmod 660 "${bridge_socket}"

# The helper builds the environment and fixed browser command itself.
# A non-zero exit covers both a browser that never started and one
# that died mid-session (for instance when the bridge breaks), so the
# dialog states the fact common to both rather than guessing which.
if ! run /usr/bin/sudo --user browser --set-home \
  /usr/local/libexec/superbacked-browser-helper "$@"; then
  dialog --error \
    --no-wrap \
    --text "Browser exited with an error.\nPlease try opening it again." \
    --title "Superbacked OS" 2> /dev/null
fi

EOF

chmod +x /usr/local/bin/superbacked-browser

# The helper runs as the browser user, never root. Bash privileged mode
# ignores BASH_ENV, exported functions and shell-option startup inputs
# before the body executes. sudo scrubs loader variables; NOSETENV
# prevents callers bypassing that filtering. env --ignore-environment
# gives waypipe and Firefox only the values constructed here.
tee /usr/local/libexec/superbacked-browser-helper > /dev/null << 'EOF'
#! /bin/bash -p

set -o errexit

# The launcher already refuses air-gapped mode with a notice; the helper
# is callable directly through sudo, so the mode boundary holds here
# too rather than resting on the caller.
if ! /usr/bin/grep --quiet superbacked.browser /proc/cmdline; then
  printf "%s\n" "Error: hardened browser mode is not active" >&2
  exit 1
fi

# Keep this list identical to src/shared/allowedExternalUrls.ts and
# the other browser script. Match literally, without normalization.
allowed_urls=(
  "https://superbacked.com/superbacked-os"
)
allowed=false
if (( $# == 0 )); then
  allowed=true
elif (( $# == 1 )); then
  for allowed_url in "${allowed_urls[@]}"; do
    if [[ "$1" == "${allowed_url}" ]]; then
      allowed=true
      break
    fi
  done
fi
if [[ "${allowed}" != true ]]; then
  printf "%s\n" "Error: expected zero arguments or one allowed external URL" >&2
  exit 1
fi

browser_uid="$(/usr/bin/id --user)"
url_args=()
if (( $# == 1 )); then
  url_args=(--url "$1")
fi

# Lingering provides the browser user’s session bus. Disable portals it
# cannot answer, and pin the private display name allowed by Firefox’s
# profile. Not oneshot: in that mode waypipe hands the application a
# pre-connected WAYLAND_SOCKET and unsets WAYLAND_DISPLAY, and Firefox
# refuses to start without WAYLAND_DISPLAY or DISPLAY — the display
# socket mode sets WAYLAND_DISPLAY to the pinned name instead.
cd /
exec /usr/bin/env --ignore-environment \
  HOME=/home/browser \
  USER=browser \
  LOGNAME=browser \
  PATH=/usr/bin:/bin \
  LANG=C.UTF-8 \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${browser_uid}/bus" \
  GTK_USE_PORTAL=0 \
  MOZ_ENABLE_WAYLAND=1 \
  XDG_RUNTIME_DIR="/run/user/${browser_uid}" \
  /usr/bin/waypipe --socket /run/browser-bridge/waypipe.sock --display wayland-firefox server -- \
  /usr/bin/firefox --no-remote "${url_args[@]}"
EOF

chown root:root /usr/local/libexec/superbacked-browser-helper
chmod 755 /usr/local/libexec/superbacked-browser-helper

# Arguments are validated by the root-owned helper, not sudo globbing.
# Tag order carries no meaning; it is the order sudo --list prints, so
# the file and the listing read the same.
tee /etc/sudoers.d/superbacked-browser > /dev/null << 'EOF'
Defaults!/usr/local/libexec/superbacked-browser-helper env_reset
superbacked ALL=(browser) NOSETENV: NOPASSWD: /usr/local/libexec/superbacked-browser-helper
EOF

chmod 440 /etc/sudoers.d/superbacked-browser

visudo --check

printf "%s\n" "Configuring NTP…"

# Hardened browser mode has no system DNS, so the clock syncs against
# time.cloudflare.com by IP address. Accurate time matters when
# enrolling two-factor codes.
tee /etc/systemd/timesyncd.conf > /dev/null << 'EOF'
[Time]
NTP=162.159.200.1 162.159.200.123
EOF

printf "%s\n" "Disabling IPv6…"

# Superbacked OS is IPv4-only by design: with IPv6 off the firewall
# polices one address family and never has to admit the
# neighbour-discovery and DHCPv6 traffic IPv6 needs to configure
# itself. Off by sysctl on every interface, loopback included, so no
# interface ever carries an IPv6 address and nothing IPv6 reaches the
# wire. Not ipv6.disable=1 on the kernel command line: that deletes the
# address family outright, and software written for a normal Linux
# assumes it exists even when unused — ipp-usb, the only path from the
# app to a USB printer, stops answering requests without it.
tee /etc/sysctl.d/99-superbacked-ipv6.conf > /dev/null << 'EOF'
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.ipv6.conf.lo.disable_ipv6 = 1
EOF

printf "%s\n" "Configuring hardened browser mode firewall…"

# Used only in hardened browser mode — replaces the default
# rules with exactly three allowances:
#   browser          → web traffic (Firefox; DNS rides inside HTTPS)
#   systemd-timesync → time sync, to Cloudflare’s addresses only
#   root             → DHCP (joining the network)
# Loopback stays open for everyone except the browser user: cupsd and
# ipp-usb listen on localhost TCP, and the browser user has no business
# reaching root daemons on the trusted side. Firefox loses nothing —
# its display, session-bus and waypipe-bridge traffic ride unix
# sockets, which this inet filter never touches. The system is
# IPv4-only (IPv6 is off by sysctl above), and the table says so too:
# IPv6 is dropped first in both chains, before the loopback accepts,
# so the allowances below only ever apply to IPv4 and the property
# does not depend on the absence of a neighbour-discovery or DHCPv6
# rule. The inet family is kept so the drop is there to be hit if IPv6
# were ever re-enabled.
tee /usr/local/sbin/superbacked-browser-firewall.sh > /dev/null << 'EOF'
#! /bin/bash

set -o errexit

# Old rules are flushed and new ones loaded in a single transaction, so
# there is never a moment without a firewall.
nft --file - << 'RULESET'
flush ruleset

table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    meta nfproto ipv6 drop comment "IPv4-only: IPv6 is off by sysctl, dropped here regardless"
    iif lo accept
    ct state established,related accept
    udp sport 67 udp dport 68 accept comment "DHCP replies"
  }
  chain forward {
    type filter hook forward priority 0; policy drop;
  }
  chain output {
    type filter hook output priority 0; policy drop;
    meta nfproto ipv6 drop comment "IPv4-only: IPv6 is off by sysctl, dropped here regardless"
    meta skuid browser oif lo drop comment "no browser path to cupsd/ipp-usb"
    oif lo accept
    meta skuid browser tcp dport { 80, 443 } accept
    meta skuid browser udp dport 443 accept comment "QUIC"
    meta skuid systemd-timesync ip daddr { 162.159.200.1, 162.159.200.123 } udp dport 123 accept comment "NTP (Cloudflare)"
    meta skuid root udp dport { 67, 68 } accept comment "DHCP client"
  }
}
RULESET
EOF

chmod +x /usr/local/sbin/superbacked-browser-firewall.sh

tee /etc/systemd/system/superbacked-browser-firewall.service > /dev/null << 'EOF'
[Unit]
Description=Superbacked OS hardened browser mode (Firefox-only egress)
ConditionKernelCommandLine=superbacked.browser
After=nftables.service
Before=NetworkManager.service
Wants=systemd-timesyncd.service

[Service]
Type=oneshot
RemainAfterExit=yes
# Networking is masked in the base image (see “Disabling networking”
# below). In hardened browser mode only, this service unmasks it,
# installs the Firefox-only firewall, and then brings the network up —
# the firewall is always in place before the machine goes online. The
# unmask lives in RAM, so offline boots stay offline. Wi-Fi is
# unblocked explicitly so stale rfkill state can never leave the radio
# off.
ExecStartPre=/usr/sbin/rfkill unblock wifi
ExecStartPre=/usr/bin/systemctl unmask NetworkManager.service
ExecStartPre=/usr/bin/systemctl daemon-reload
ExecStart=/usr/local/sbin/superbacked-browser-firewall.sh
ExecStartPost=/usr/bin/systemctl start --no-block NetworkManager.service

[Install]
WantedBy=multi-user.target
EOF

systemctl enable superbacked-browser-firewall.service

printf "%s\n" "Purging orphaned packages…"

# Build tools left with superbacked-os-bootstrap-base.sh and the
# vanilla desktop’s extras before the upgrade (“Purging extraneous
# packages” there). Nothing above is expected to orphan a package, so
# this is a guard against future steps, not a cleanup of known ones.
apt autoremove --purge --yes

printf "%s\n" "Disabling networking…"

# Networking is masked, not merely disabled — a disabled service can
# still be woken in the background (the desktop’s network indicator does
# this at login), and its DHCP traffic slips past the firewall. Masked,
# it cannot start at all: air-gapped mode is silent on the network.
# Hardened browser mode unmasks it (see “Configuring hardened browser
# mode firewall” above).
systemctl mask NetworkManager-wait-online.service NetworkManager.service

systemctl enable nftables

# The default firewall, loaded at every boot: nothing in, nothing out.
# Hardened browser mode replaces it with the Firefox-only rules above.
# (Loaded by nftables.service at boot — nothing to apply inside the
# chroot.)
tee /etc/nftables.conf > /dev/null << 'EOF'
#!/usr/sbin/nft --file

flush ruleset

table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    meta nfproto ipv6 drop comment "IPv4-only: IPv6 is off by sysctl, dropped here regardless"
    iif lo accept
  }
  chain forward {
    type filter hook forward priority 0; policy drop;
  }
  chain output {
    type filter hook output priority 0; policy drop;
    meta nfproto ipv6 drop comment "IPv4-only: IPv6 is off by sysctl, dropped here regardless"
    oif lo accept
  }
}
EOF

printf "%s\n" "Disabling Bluetooth…"

# Bluetooth has no role on this machine — keyboards and mice are
# built-in or wired.
# A radio is a second way into hardware that handles secrets, so the
# kernel modules are blocked and the service masked. Unlike networking,
# hardened browser mode does not bring it back. Blocking the bluetooth
# core module covers every transport driver, since each depends on it
# (USB, UART and SDIO controllers alike); btusb is listed as well so a
# direct load fails on its own name rather than on a dependency.
tee /etc/modprobe.d/superbacked-bluetooth.conf > /dev/null << 'EOF'
install bluetooth /bin/false
install btusb /bin/false
EOF

systemctl mask bluetooth.service

printf "%s\n" "Disabling Wi-Fi in air-gapped mode…"

# In air-gapped mode the Wi-Fi radio is switched off — masked
# networking already prevents connections; a blocked radio stops the
# card from transmitting at all. Hardened browser mode keeps Wi-Fi
# available (not every machine has Ethernet), managed by
# NetworkManager behind the Firefox-only firewall.
tee /etc/systemd/system/superbacked-airgap.service > /dev/null << 'EOF'
[Unit]
Description=Superbacked OS air-gapped mode (Wi-Fi radio off)
ConditionKernelCommandLine=!superbacked.browser

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/rfkill block wifi

[Install]
WantedBy=multi-user.target
EOF

systemctl enable superbacked-airgap.service

printf "%s\n" "Configuring fstab…"

# Replace the installer’s fstab outright. Its entries pin the installer
# machine partitions by UUID: /boot/efi does not exist on the live
# image (so its mount fails and drops boot to emergency mode) and the
# root entry’s ro option makes systemd remount the live overlay
# read-only, crashing everything that writes. live-boot mounts all the
# live system needs.
tee /etc/fstab > /dev/null << 'EOF'
# Intentionally empty — the root filesystem is assembled by live-boot
# (squashfs copied to RAM with a tmpfs overlay); nothing is mounted
# from disk.
EOF

# superbacked keeps day-to-day use but loses root — a compromised
# session cannot escalate, make the disk writable or rewrite the
# firewall. (The browser grant above is unaffected; it does not rely on
# sudo group membership.) Debug images keep sudo: the
# profile iteration loop needs root (edit /etc/apparmor.d/<profile>,
# apparmor_parser --replace, relaunch the app — all in the RAM overlay,
# so nothing survives a reboot) and a debug image is already
# unshippable, as nothing in it enforces.
if [ "${BUILD_VARIANT:-}" = "debug" ]; then
  printf "%s\n" "Keeping sudo (BUILD_VARIANT=debug)…"
else
  printf "%s\n" "Disabling sudo…"

  deluser superbacked sudo
fi

printf "%s\n" "Finishing provisioning…"

# GNOME initial setup would otherwise greet the first login with a
# welcome wizard on machines where the purge above left the gdm hook
# behind — the marker makes it a no-op either way.
mkdir --parents /home/superbacked/.config
touch /home/superbacked/.config/gnome-initial-setup-done

# Everything written into the home folders above was written as root —
# hand them to their owners.
chown --recursive browser:browser /home/browser
chown --recursive superbacked:superbacked /home/superbacked

printf "%s\n" "Main bootstrap complete"
