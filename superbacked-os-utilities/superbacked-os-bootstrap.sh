#! /bin/bash
# Turns the vanilla Ubuntu Desktop 24.04 (amd64) source image into the
# complete Superbacked OS root filesystem — packages, hardening, the
# Superbacked app and its AppArmor profiles. Runs as root inside a
# chroot of the source image overlay, invoked by
# docker/create-superbacked-os-live-image.sh at packaging time.
#
# Contract with the caller: root, working DNS (the caller installs the
# container’s resolv.conf), /dev /dev/pts /proc /sys /run mounted, the
# app build and repository assets bind mounted at /run/dist and
# /run/superbacked-os-bootstrap-assets, and a policy-rc.d that keeps
# maintainer scripts from starting services. No systemd, dbus or logind
# is running — everything below is plain filesystem writes, offline
# systemctl symlinks, and apt/curl over the network. Each build starts
# from a pristine overlay, so nothing here guards against re-runs.
# Exporting APPARMOR_MODE=complain builds a test image whose app
# profiles log denials instead of enforcing them.
#
# Usage (inside the chroot):
# bash superbacked-os-bootstrap.sh 1.13.0

set -e
set -o pipefail

version="${1}"

if [ -z "${version}" ]; then
  printf "%s\n" "Error: usage: superbacked-os-bootstrap.sh version" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

printf "%s\n" "Starting bootstrap…"

# Version pins, grouped so a release bump is one edit. The Ubuntu
# archive is pinned wholesale by snapshot timestamp — every package it
# provides resolves against that instant, so the same timestamp always
# yields the same packages. Firefox, KeePassXC and Yubico Authenticator
# come from repositories without snapshots and are pinned by version
# instead: when an upstream drops a pinned version, the build fails
# loudly and the pin is bumped deliberately. The PyPI tools are pinned
# by version and by the sha256 of their wheel, verified before
# installation (bump both together after checking the “Download files”
# hashes on pypi.org) — their transitive dependencies still resolve at
# install time. (The raw GitHub downloads below still float; their
# signature checks pin integrity, not versions.)
readonly apt_snapshot="20260710T000000Z"
readonly firefox_version="152.0.5"
readonly keepassxc_version="2.7.12"
readonly trezor_sha256="6de50703102f90dc5399d40dd7c8134d13b6c54a617d41178b081baf2aeb2b91"
readonly trezor_version="0.20.1"
readonly yubico_authenticator_version="7.4.1"
readonly yubikey_manager_sha256="19a1173106b104bea37722e61ce748fb2d39c87a02880c1964461837ddaa7fba"
readonly yubikey_manager_version="5.9.2"

printf "%s\n" "Writing release marker…"

# Identifies the running system as Superbacked OS to the Superbacked app
# (which recommends provisioning YubiKey secrets here) — the marker gates
# recommendations only, not a security boundary, so a plain file is enough
tee /etc/superbacked-os-release > /dev/null << EOF
VERSION=${version}
EOF

printf "%s\n" "Configuring apt sources…"

# Replaces the installer’s mirror configuration outright so nothing
# keeps resolving against a moving archive. universe carries six
# dependencies (exfatprogs, keepassxc, libfuse2, pcscd, pipx, scdaemon
# and waypipe among them); everything else is in main.
tee /etc/apt/sources.list.d/ubuntu.sources > /dev/null << EOF
Types: deb
URIs: https://snapshot.ubuntu.com/ubuntu/${apt_snapshot}
Suites: noble noble-updates noble-security
Components: main universe
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
EOF

# Nothing may ever pull snapd back in as a dependency — Superbacked OS
# ships no snaps (snapd is purged below).
tee /etc/apt/preferences.d/superbacked-snapd > /dev/null << 'EOF'
Package: snapd
Pin: release *
Pin-Priority: -1
EOF

printf "%s\n" "Purging extraneous packages…"

# Removed before the upgrade so apt never spends time upgrading — or
# running a postinst for — a package about to leave. Most are obvious
# removals from the vanilla desktop; two are deliberate hardening:
#
# - snapd: Superbacked OS ships no snaps — Firefox and KeePassXC are debs
#   confined by AppArmor instead of snap interfaces (see
#   superbacked-os-bootstrap-assets/). The pin above keeps it from
#   returning; its leftover directories are wiped below.
# - xserver-xorg*: a session X server runs one flat trust domain where
#   any client can log every keystroke and read every window, so one
#   selection at the (publicly passworded) login screen would flip the
#   machine out of window isolation. Ubuntu ships it only as a Wayland
#   fallback, and xserver-xorg-legacy adds a setuid-root binary. Xwayland
#   stays (ubuntu-session depends on it) but is a rootless, unprivileged
#   client that never starts with every app pinned to Wayland.
#
# Build tools and curl are NOT here — later steps need them, so they
# leave at the end.
apt remove --purge --yes \
  apport \
  cloud-init \
  gnome-initial-setup \
  memtest86+ \
  network-manager-config-connectivity-ubuntu \
  snapd \
  ubuntu-advantage-desktop-daemon \
  ubuntu-advantage-tools \
  ubuntu-pro-client \
  ubuntu-pro-client-l10n \
  unattended-upgrades \
  update-manager \
  update-manager-core \
  update-notifier \
  update-notifier-common \
  whoopsie \
  xserver-xorg \
  xserver-xorg-core \
  xserver-xorg-legacy

rm --force --recursive \
  /home/*/snap \
  /root/snap \
  /snap \
  /var/lib/snapd \
  /var/snap

# Purge the dependencies those removals just orphaned as well, so the
# upgrade never touches them either. Safe this early: it can only remove
# what the late autoremove would remove anyway.
apt autoremove --purge --yes

printf "%s\n" "Updating Ubuntu…"

apt update
apt upgrade --yes

printf "%s\n" "Installing dependencies…"

# Build tools (build-essential, libpcsclite-dev, python3-dev, zlib1g-dev)
# compile the wallet and YubiKey tools installed just below — all but
# zlib1g-dev (which the Superbacked app needs) are removed at the end of
# provisioning. curl and gnupg download and verify software, dconf-cli
# compiles the system dconf database (see “Configuring GNOME” below),
# exfatprogs formats exFAT USB drives, qtwayland5 provides the Qt
# Wayland platform plugin KeePassXC’s launcher pins (its deb does not
# pull it in), language packs complete the English locale, libfuse2
# runs AppImages, pcscd and scdaemon talk to smartcards and YubiKeys,
# python3-pip downloads the pinned PyPI wheels just below,
# totem plays video with gstreamer1.0-libav decoding it (H.264
# including the 4:2:2 profile, plus AAC — the minimal install ships no
# video decoder), waypipe puts the browser on screen, wl-clipboard
# copies derived passwords to the clipboard (Wayland lets only a
# focused surface set the selection, and the command-line interface is
# windowless) and zenity shows error dialogs. (Firefox and KeePassXC
# come from their own repositories — see the install sections below.)
packages=(
  build-essential
  curl
  dconf-cli
  exfatprogs
  gnupg
  gstreamer1.0-libav
  language-pack-en
  # French is commented out but kept as a working example of how to add
  # a language — the app keeps its half in src/i18n.ts.
  # language-pack-fr
  language-pack-gnome-en
  # language-pack-gnome-fr
  libfuse2
  libpcsclite-dev
  pcscd
  pipx
  python3-dev
  python3-pip
  qtwayland5
  scdaemon
  totem
  waypipe
  wl-clipboard
  zenity
  zlib1g-dev
)

apt install --yes "${packages[@]}"

# live-boot provides the initramfs plumbing the distributed live image
# boots with (see docker/create-superbacked-os-live-image.sh, which
# regenerates the initramfs right after this script finishes).
# Recommends are skipped: they add only documentation and live-tools,
# whose service would run at every boot for nothing.
apt install --no-install-recommends --yes live-boot

# Wallet and YubiKey command-line tools, installed into
# /home/superbacked/.local/bin as the superbacked user (pipx refuses to
# run as root). PyPI has no snapshots, so each tool is pinned by
# version and by the sha256 of its wheel (see the pins at the top):
# the wheel is downloaded first, checked, and only then installed from
# the verified file. Transitive dependencies still resolve at install
# time — locking those too would take per-tool hash-locked
# requirements files.
runuser --user superbacked -- \
  env HOME=/home/superbacked PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  pipx ensurepath

# Downloads a pinned wheel, verifies its sha256 and installs it with
# pipx. Fails loudly on any drift — bump the version and sha256 pins
# together.
install_pinned_tool() {
  local spec="${1}"
  local version="${2}"
  local sha256="${3}"
  local name="${spec%%\[*}"
  local download_dir="/tmp/pipx-${name}"
  local wheel
  local wheel_sha256

  mkdir --parents "${download_dir}"

  python3 -m pip download "${name}==${version}" \
    --dest "${download_dir}" --no-deps

  wheel="$(find "${download_dir}" -type f)"
  wheel_sha256="$(sha256sum "${wheel}" | cut --delimiter ' ' --fields 1)"

  if [ "${wheel_sha256}" != "${sha256}" ]; then
    printf "%s\n" "Error: unexpected sha256 ${wheel_sha256} for ${wheel##*/}" >&2
    exit 1
  fi

  runuser --user superbacked -- \
    env HOME=/home/superbacked PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    pipx install "${spec} @ file://${wheel}"
}

install_pinned_tool trezor "${trezor_version}" "${trezor_sha256}"
install_pinned_tool yubikey-manager "${yubikey_manager_version}" "${yubikey_manager_sha256}"

# One-command Trezor initialization with the recommended flags:
# 256-bit strength (24-word mnemonic), PIN and passphrase protection,
# BIP39 backup. Only the label varies, so it is prompted for with an
# editable pre-filled default. Goes in .bashrc because GNOME Terminal
# runs interactive non-login shells, which skip .profile. (Ownership
# is handed back to superbacked at the end of provisioning.)
tee --append /home/superbacked/.bashrc > /dev/null << 'EOF'

trezor-setup() {
  local label
  read -e -i "My Trezor Safe 7" -p "Label: " label \
    && trezorctl device setup --backup-type bip39 --label "${label}" --passphrase-protection --pin-protection --strength 256
}
EOF

printf "%s\n" "Installing Firefox…"

# Firefox comes from Mozilla’s own apt repository — Ubuntu’s firefox
# deb is a transitional package that installs the snap. The repository
# signing key is fetched over HTTPS and its fingerprint checked against
# the one Mozilla publishes; provisioning stops rather than trust an
# unexpected key. The pin makes Mozilla’s origin win over Ubuntu’s
# transitional package for every overlapping name.
mkdir --parents /etc/apt/keyrings

curl --fail --location https://packages.mozilla.org/apt/repo-signing-key.gpg \
  --output /etc/apt/keyrings/packages.mozilla.org.asc

mozilla_fingerprint="$(gpg --quiet --with-colons --show-keys \
  /etc/apt/keyrings/packages.mozilla.org.asc | awk -F: '/^fpr:/ { print $10; exit }')"

if [ "${mozilla_fingerprint}" != "35BAA0B33E9EB396F59CA838C0BA5CE6DC6315A3" ]; then
  printf "%s\n" "Error: unexpected Mozilla apt signing key ${mozilla_fingerprint}" >&2
  exit 1
fi

tee /etc/apt/sources.list.d/mozilla.sources > /dev/null << 'EOF'
Types: deb
URIs: https://packages.mozilla.org/apt
Suites: mozilla
Components: main
Signed-By: /etc/apt/keyrings/packages.mozilla.org.asc
EOF

tee /etc/apt/preferences.d/superbacked-mozilla > /dev/null << 'EOF'
Package: *
Pin: origin packages.mozilla.org
Pin-Priority: 1000
EOF

apt update

# The glob tolerates Mozilla’s ~buildN version suffix; if the pinned
# version has left the repository (rapid release moves every four
# weeks), apt fails loudly here — bump firefox_version deliberately.
apt install --yes "firefox=${firefox_version}*"

printf "%s\n" "Installing KeePassXC…"

# KeePassXC comes from the team’s own PPA — Ubuntu’s archive carries a
# release several versions behind. Same fail-loud pattern as Mozilla’s
# repository: the signing key is fetched over HTTPS (Launchpad serves
# PPA keys through its keyserver) and its fingerprint checked before
# anything is trusted.
curl --fail --location \
  "https://keyserver.ubuntu.com/pks/lookup?op=get&options=mr&search=0xD89C66D0E31FEA2874EBD20561922AB60068FCD6" \
  --output /etc/apt/keyrings/keepassxc.asc

keepassxc_fingerprint="$(gpg --quiet --with-colons --show-keys \
  /etc/apt/keyrings/keepassxc.asc | awk -F: '/^fpr:/ { print $10; exit }')"

if [ "${keepassxc_fingerprint}" != "D89C66D0E31FEA2874EBD20561922AB60068FCD6" ]; then
  printf "%s\n" "Error: unexpected KeePassXC PPA signing key ${keepassxc_fingerprint}" >&2
  exit 1
fi

tee /etc/apt/sources.list.d/keepassxc.sources > /dev/null << 'EOF'
Types: deb
URIs: https://ppa.launchpadcontent.net/phoerious/keepassxc/ubuntu
Suites: noble
Components: main
Signed-By: /etc/apt/keyrings/keepassxc.asc
EOF

apt update

# The glob tolerates the PPA’s -1ppa1~noble1 version suffix; a dropped
# pinned version fails loudly here — bump keepassxc_version
# deliberately.
apt install --yes "keepassxc=${keepassxc_version}*"

printf "%s\n" "Configuring GNOME…"

# A quiet, dark desktop: black background, floating bottom dock
# limited to pinned apps and mounted drives, no icons on the desktop,
# no location services or telemetry, USB media never mounts itself, new
# USB devices are rejected while the screen is locked, and the terminal
# is white text on black. Written as a system dconf database (the
# gsettings tool needs a session bus, which a chroot does not have);
# the profile makes every session read it, and dconf update compiles it
# offline.
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
usb-protection=true
usb-protection-level='lockscreen'

[org/gnome/mutter]
center-new-windows=true

[org/gnome/shell]
favorite-apps=['superbacked.desktop', 'org.keepassxc.KeePassXC.desktop', 'com.yubico.yubioath.desktop', 'firefox.desktop', 'org.gnome.Terminal.desktop', 'org.gnome.Nautilus.desktop']

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

# Let regular users talk to Trezor and YubiKey hardware over USB.
curl --fail --location https://data.trezor.io/udev/51-trezor.rules \
  --output /etc/udev/rules.d/51-trezor.rules
curl --fail --location https://raw.githubusercontent.com/Yubico/libfido2/main/udev/70-u2f.rules \
  --output /etc/udev/rules.d/70-u2f.rules

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

printf "%s\n" "Configuring yubikey-prov.sh…"

# Helper script that provisions YubiKeys. (Home folder ownership is
# handed back to superbacked at the end of provisioning.)
mkdir --parents /home/superbacked/.local/bin/

curl --fail --location https://raw.githubusercontent.com/sunknudsen/yubikey-prov/main/yubikey-prov.sh \
  --output /home/superbacked/.local/bin/yubikey-prov.sh

chmod +x /home/superbacked/.local/bin/yubikey-prov.sh

printf "%s\n" "Installing Yubico Authenticator…"

# Yubico Authenticator manages the two-factor codes stored on a YubiKey.
# It reads them straight off the key over USB, so it works fully offline.
# Yubico ships each release as a signed download (the Snap Store
# version is abandoned) — the version is pinned by
# yubico_authenticator_version at the top of this script, and the
# signature is checked before anything is installed: if a release is
# ever signed by an unexpected key, provisioning stops rather than
# install it. Yubico occasionally changes signers; when that happens,
# update the fingerprint below after checking
# https://developers.yubico.com/Software_Projects/Software_Signing.html.
yubico_authenticator_url="https://developers.yubico.com/yubioath-flutter/Releases/yubico-authenticator-${yubico_authenticator_version}-linux.tar.gz"

curl --fail --location --silent \
  "https://keys.openpgp.org/vks/v1/by-fingerprint/20EE325B86A81BCBD3E56798F04367096FBA95E8" \
  | gpg --import

curl --fail --location "${yubico_authenticator_url}" \
  --output /tmp/yubico-authenticator.tar.gz
curl --fail --location "${yubico_authenticator_url}.sig" \
  --output /tmp/yubico-authenticator.tar.gz.sig

gpg --verify \
  /tmp/yubico-authenticator.tar.gz.sig \
  /tmp/yubico-authenticator.tar.gz

# The folder inside the archive is named after the version, which is not
# known ahead of time — extract to a fixed path so the launcher below
# always finds the app.
mkdir --parents /opt/yubico-authenticator
tar --extract --gzip --strip-components 1 \
  --file /tmp/yubico-authenticator.tar.gz \
  --directory /opt/yubico-authenticator

rm /tmp/yubico-authenticator.tar.gz /tmp/yubico-authenticator.tar.gz.sig

# Pinned to Wayland so authentication codes are never drawn through X11,
# where other apps could observe them. The entry is named after the app
# id (com.yubico.yubioath) so GNOME pairs the running window with its
# icon.
mkdir --parents /usr/local/share/applications

tee /usr/local/share/applications/com.yubico.yubioath.desktop > /dev/null << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Yubico Authenticator
Exec=env GDK_BACKEND=wayland /opt/yubico-authenticator/authenticator
Icon=/opt/yubico-authenticator/linux_support/com.yubico.yubioath.png
StartupWMClass=com.yubico.yubioath
Terminal=false
Categories=Utility;Security;
EOF

printf "%s\n" "Installing Superbacked app…"

# The app build and repository assets are bind mounted into the chroot
# under /run by the caller — no tarball intermediary — and the mounts
# vanish with the /run tmpfs when provisioning ends, leaving no trace
# in the image. Ownership is handed to superbacked at the end of
# provisioning.
mkdir --parents \
  /home/superbacked/.local/share/applications \
  /home/superbacked/.local/superbacked

cp \
  /run/superbacked-os-bootstrap-assets/superbacked.desktop \
  /home/superbacked/.local/share/applications/superbacked.desktop
cp \
  "/run/dist/superbacked-x64-${version}.AppImage" \
  /home/superbacked/.local/superbacked/superbacked.AppImage
cp \
  /run/dist/.icon-icns/icon.icns \
  /home/superbacked/.local/superbacked/superbacked.icns

chmod +x \
  /home/superbacked/.local/share/applications/superbacked.desktop
chmod +x \
  /home/superbacked/.local/superbacked/superbacked.AppImage

# Command line entry point (superbacked provision-yubikey, superbacked
# derive-password…) — a symlink keeps AppArmor confinement intact, as the
# kernel resolves it to the AppImage path the profile attaches to
ln --symbolic \
  /home/superbacked/.local/superbacked/superbacked.AppImage \
  /usr/local/bin/superbacked

printf "%s\n" "Installing AppArmor profiles…"

# Confinement for the bundled apps — what snap interfaces used to
# provide (each profile documents the mapping). firefox deliberately
# overwrites Ubuntu’s stock profile of the same name: the stock one is
# unconfined (it exists only to grant userns) and two profiles cannot
# share an attachment path.
cp \
  /run/superbacked-os-bootstrap-assets/apparmor/firefox.profile \
  /etc/apparmor.d/firefox
cp \
  /run/superbacked-os-bootstrap-assets/apparmor/keepassxc.profile \
  /etc/apparmor.d/keepassxc.profile
cp \
  /run/superbacked-os-bootstrap-assets/apparmor/superbacked.profile \
  /etc/apparmor.d/superbacked.profile
cp \
  /run/superbacked-os-bootstrap-assets/apparmor/yubico-authenticator.profile \
  /etc/apparmor.d/yubico-authenticator.profile

# APPARMOR_MODE=complain builds a test image whose app profiles log
# denials instead of enforcing them — used to iterate on the profiles
# against journalctl on hardware. Release builds enforce.
if [ "${APPARMOR_MODE:-}" = "complain" ]; then
  # Add complain to each profile’s flags — folded into an existing
  # flags=(…) when present (superbacked carries attach_disconnected),
  # otherwise added as a new flags=(complain). Anchoring on the closing
  # brace rather than the profile name tolerates the “{” in Firefox’s
  # attachment path; the t skips the second rule once the first fires.
  sed --in-place --regexp-extended \
    -e 's|flags=\(([^)]*)\) \{$|flags=(\1 complain) {|' \
    -e 't' \
    -e 's| \{$| flags=(complain) {|' \
    /etc/apparmor.d/firefox \
    /etc/apparmor.d/keepassxc.profile \
    /etc/apparmor.d/superbacked.profile \
    /etc/apparmor.d/yubico-authenticator.profile
fi

# Compile without loading — catches profile syntax errors at build time
# instead of at the first boot.
for profile in firefox keepassxc.profile superbacked.profile yubico-authenticator.profile; do
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

printf "%s\n" "Configuring clearnet user…"

# Firefox runs as a separate user, clearnet — the only identity allowed
# to reach the internet in hardened browser mode (the “hardened browser”
# boot entry). It has no shell and no sudo rights; lingering keeps its
# user manager (session bus, XDG_RUNTIME_DIR) available without a
# graphical login.
useradd --create-home --shell /usr/sbin/nologin clearnet

# superbacked must be in the clearnet group to hand the browser bridge
# socket (created below) over to clearnet — files can only be re-grouped
# to a group their owner belongs to.
usermod --append --groups clearnet superbacked

# That membership is for the socket handover and the shared Downloads
# folder (2770), not for browsing clearnet’s home — which useradd left
# group-traversable (750), letting superbacked enumerate it and enter
# world-readable corners like .config. superbacked reaches Downloads
# through the bind mount at its own home, and path resolution through a
# mountpoint never walks /home/clearnet, so the home closes completely.
chmod 700 /home/clearnet

# What loginctl enable-linger records — logind is not running in the
# chroot, but all it does is create this marker.
mkdir --parents /var/lib/systemd/linger
touch /var/lib/systemd/linger/clearnet

# clearnet has no desktop session, so the desktop portal service Firefox
# consults at startup can never answer — every launch would stall for
# ~25 seconds waiting for it. Masking the service for clearnet makes
# those calls fail instantly, so Firefox starts right away.
# superbacked’s own portals are untouched. (Ownership is handed to
# clearnet at the end of provisioning.)
mkdir --parents /home/clearnet/.config/systemd/user
ln --force --symbolic /dev/null \
  /home/clearnet/.config/systemd/user/xdg-desktop-portal.service

printf "%s\n" "Configuring KeePassXC…"

# KeePassXC is pinned to Wayland (see the launcher override below) —
# stop provisioning if the Qt Wayland platform plugin is missing rather
# than ship an image where it cannot launch. Its confinement lives in
# an AppArmor profile installed at image creation time (see
# superbacked-os-bootstrap-assets/apparmor/keepassxc.profile): no network, no
# X11 — while home, USB drives and YubiKey challenge-response stay
# available.
if ! dpkg --listfiles qtwayland5 2> /dev/null \
  | grep --quiet 'plugins/platforms/libqwayland'; then
  printf "%s\n" "Error: Qt Wayland platform plugin not found for KeePassXC" >&2
  exit 1
fi

# The desktop is dark-mode only — pin the theme so KeePassXC never
# launches in light mode regardless of what it can read from the
# session.
mkdir --parents /home/superbacked/.config/keepassxc

tee /home/superbacked/.config/keepassxc/keepassxc.ini > /dev/null << 'EOF'
[General]
ConfigVersion=2

[GUI]
ApplicationTheme=dark
EOF

printf "%s\n" "Configuring Firefox policies…"

# Firefox is configured through an enterprise policy, locked so nothing
# can be changed from inside the browser (the deb reads
# /etc/firefox/policies/policies.json natively). Its confinement lives
# in an AppArmor profile installed at image creation time (see
# superbacked-os-bootstrap-assets/apparmor/firefox.profile): no camera, no
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
#   Network — DNS goes exclusively through Mullvad’s encrypted resolver,
#     never the system resolver (the pinned address bootstraps it);
#     HTTPS is required, tracking protection is strict, WebRTC is off.
#   Passwords — Firefox never saves, autofills or suggests credentials,
#     addresses or payment methods (KeePassXC is the password manager
#     here); Firefox Relay and profile backup/restore are off.
#   Search — DuckDuckGo by default; address bar recommendations, search
#     suggestions and trending searches are off.
#   New tab — a blank page: no recommendations, shortcuts, sponsored
#     content or widgets — the widgets system is off and every widget
#     (clocks, lists, sports, timer, weather…) is pinned off
#     individually, because experiments can force the system back on.
#   AI — everything blocked through the official AIControls policy;
#     browser.ml.enable is also pinned off so the on-device inference
#     engine itself can never start (the policy deliberately leaves that
#     one alone).
#   Downloads — saved straight to the dedicated downloads folder, no
#     picker dialogs.
#   Dark mode — pinned; Firefox runs as clearnet and cannot see the
#     desktop’s dark-mode setting.
#   Desktop portals — disabled; clearnet has no desktop session to answer
#     portal calls, so they could only ever hang (see “Configuring
#     clearnet user” above).
mkdir --parents /etc/firefox/policies

cp /run/superbacked-os-bootstrap-assets/firefox-policies.json \
  /etc/firefox/policies/policies.json

# Validate the policy is well-formed JSON — a stray comma would
# otherwise surface only when Firefox silently ignores the policy at
# runtime.
python3 -m json.tool /etc/firefox/policies/policies.json > /dev/null

printf "%s\n" "Overriding stock launchers…"

# Replace the stock launchers with same-name entries in a
# higher-priority directory, so the familiar icons do the right thing:
#   Firefox   → starts through the clearnet wrapper (hardened browser
#               mode only)
#   KeePassXC → pinned to Wayland
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

sed --in-place \
  's|^Exec=.*|Exec=/usr/local/bin/clearnet-browser|' \
  /usr/local/share/applications/firefox.desktop

cp \
  /usr/share/applications/org.keepassxc.KeePassXC.desktop \
  /usr/local/share/applications/org.keepassxc.KeePassXC.desktop

sed --in-place \
  's|^Exec=|Exec=env QT_QPA_PLATFORM=wayland |' \
  /usr/local/share/applications/org.keepassxc.KeePassXC.desktop

# Same-name overrides shadow the stock entries including their MIME
# claims, which GIO only reads from a directory’s mimeinfo.cache. dpkg
# triggers maintain the cache for /usr/share/applications but nothing
# does for /usr/local — without one, double-clicking a .kdbx file
# reports that no application is installed. Regenerate it so the
# overrides keep their associations (KeePassXC claims
# application/x-keepass2, Firefox its web types).
update-desktop-database /usr/local/share/applications

printf "%s\n" "Configuring shared Downloads folder…"

# Firefox saves downloads here — the one place the confined browser can
# write outside its own profile (the AppArmor profile and policies.json
# both point at it). Created now so it exists on every boot; whatever
# lands in it disappears at reboot. superbacked (via the clearnet
# group) can read and clear it; no one else can.
mkdir --parents /home/clearnet/Downloads
chown clearnet:clearnet /home/clearnet/Downloads
chmod 2770 /home/clearnet/Downloads

# Show the same folder at superbacked’s ~/Downloads so downloaded files
# are easy to reach and move to external storage. This is one-way —
# superbacked gets a view into the browser’s downloads, the browser
# gains nothing — and nothing in it can be executed in place.
mkdir --parents /home/superbacked/Downloads

tee /etc/systemd/system/home-superbacked-Downloads.mount > /dev/null << 'EOF'
[Unit]
Description=Shared browser Downloads (clearnet → superbacked)
# No After=local-fs.target here — it would create an ordering cycle that
# leaves the mount dead at boot. The default mount dependencies already
# order it correctly.

[Mount]
What=/home/clearnet/Downloads
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

printf "%s\n" "Configuring clearnet browser launcher…"

# Directory for the browser bridge socket — superbacked creates the
# socket, clearnet connects to it. (The tmpfiles.d file is applied at
# every boot by systemd-tmpfiles-setup.service.)
tee /etc/tmpfiles.d/clearnet-bridge.conf > /dev/null << 'EOF'
d /run/clearnet-bridge 0750 superbacked clearnet -
EOF

tee /usr/local/bin/clearnet-browser > /dev/null << 'EOF'
#! /bin/bash

set -e

if ! grep --quiet superbacked.browser /proc/cmdline; then
  zenity --info \
    --no-wrap \
    --text "Superbacked OS is running in air-gapped mode.\nPlease reboot and select “Superbacked OS (hardened browser)” to use browser." \
    --title "Superbacked OS" 2> /dev/null
  exit 1
fi

clearnet_uid="$(id --user clearnet)"
bridge_socket="/run/clearnet-bridge/waypipe.sock"

# Wayland deliberately has no way for one user’s apps to appear on
# another user’s screen, so waypipe bridges the two: one end runs as
# superbacked and talks to the compositor, the other runs as clearnet
# and gives Firefox its own private display socket. The compositor keeps
# Firefox from seeing the Superbacked app or KeePassXC.
rm --force "${bridge_socket}"

waypipe --oneshot --socket "${bridge_socket}" client &

waypipe_pid=$!

for _ in $(seq 50); do
  if [ -S "${bridge_socket}" ]; then
    break
  fi
  sleep 0.1
done

if [ ! -S "${bridge_socket}" ]; then
  kill "${waypipe_pid}" 2> /dev/null || true
  zenity --error \
    --no-wrap \
    --text "Browser bridge failed to start" \
    --title "Superbacked OS" 2> /dev/null
  exit 1
fi

chgrp clearnet "${bridge_socket}"
chmod 660 "${bridge_socket}"

# The launcher inherits superbacked’s home as working directory, which
# clearnet cannot read — move somewhere neutral before switching users.
cd /

# Firefox needs clearnet’s session bus — lingering (enabled at
# provisioning time) is what provides it. GTK_USE_PORTAL=0 keeps the
# toolkit from waiting on desktop portals clearnet cannot answer; dark
# mode is pinned by policy, so nothing is lost. --display pins the name
# of the private Wayland socket waypipe creates for Firefox (the
# default is randomized) so the Firefox AppArmor profile can allow that
# exact path.
if ! sudo --user clearnet --set-home \
  /usr/bin/env \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${clearnet_uid}/bus" \
    GTK_USE_PORTAL=0 \
    MOZ_ENABLE_WAYLAND=1 \
    XDG_RUNTIME_DIR="/run/user/${clearnet_uid}" \
  /usr/bin/waypipe --oneshot --socket "${bridge_socket}" --display wayland-firefox server -- \
  /usr/bin/firefox --no-remote; then
  zenity --error \
    --no-wrap \
    --text "Browser failed to start" \
    --title "Superbacked OS" 2> /dev/null
fi

kill "${waypipe_pid}" 2> /dev/null || true
EOF

chmod +x /usr/local/bin/clearnet-browser

# Allow superbacked to start Firefox as clearnet — this exact command
# line and nothing else (it survives the sudo removal at the end). If
# the launcher above changes, this line must change with it.
tee /etc/sudoers.d/clearnet-browser > /dev/null << 'EOF'
superbacked ALL=(clearnet) SETENV: NOPASSWD: /usr/bin/env DBUS_SESSION_BUS_ADDRESS=* GTK_USE_PORTAL=0 MOZ_ENABLE_WAYLAND=1 XDG_RUNTIME_DIR=* /usr/bin/waypipe --oneshot --socket /run/clearnet-bridge/waypipe.sock --display wayland-firefox server -- /usr/bin/firefox --no-remote
EOF

chmod 440 /etc/sudoers.d/clearnet-browser

visudo --check

printf "%s\n" "Configuring NTP…"

# Hardened browser mode has no system DNS, so the clock syncs against
# time.cloudflare.com by IP address. Accurate time matters when
# enrolling two-factor codes.
tee /etc/systemd/timesyncd.conf > /dev/null << 'EOF'
[Time]
NTP=162.159.200.1 162.159.200.123
EOF

printf "%s\n" "Configuring hardened browser mode firewall…"

# Used only in hardened browser mode — replaces the default
# rules with exactly three allowances:
#   clearnet         → web traffic (Firefox; DNS rides inside HTTPS)
#   systemd-timesync → time sync, to Cloudflare’s addresses only
#   root             → DHCP (joining the network)
tee /usr/local/sbin/superbacked-browser-firewall.sh > /dev/null << 'EOF'
#! /bin/bash

set -e

# Old rules are flushed and new ones loaded in a single transaction, so
# there is never a moment without a firewall.
nft --file - << 'RULESET'
flush ruleset

table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    iif lo accept
    ct state established,related accept
    udp sport 67 udp dport 68 accept comment "DHCP replies"
  }
  chain forward {
    type filter hook forward priority 0; policy drop;
  }
  chain output {
    type filter hook output priority 0; policy drop;
    oif lo accept
    meta skuid clearnet tcp dport { 80, 443 } accept
    meta skuid clearnet udp dport 443 accept comment "QUIC"
    meta skuid systemd-timesync ip daddr { 162.159.200.1, 162.159.200.123 } udp dport 123 accept comment "NTP (Cloudflare)"
    meta skuid root udp dport { 67, 68 } accept comment "DHCP client"
  }
}
RULESET
EOF

chmod +x /usr/local/sbin/superbacked-browser-firewall.sh

tee /etc/systemd/system/superbacked-browser.service > /dev/null << 'EOF'
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
# below). In hardened browser mode only, this service unmasks it, installs the
# Firefox-only firewall, and then brings the network up — the firewall
# is always in place before the machine goes online. The unmask lives in
# RAM, so offline boots stay offline. Wi-Fi is unblocked explicitly so
# stale rfkill state can never leave the radio off.
ExecStartPre=/usr/sbin/rfkill unblock wifi
ExecStartPre=/usr/bin/systemctl unmask NetworkManager.service
ExecStartPre=/usr/bin/systemctl daemon-reload
ExecStart=/usr/local/sbin/superbacked-browser-firewall.sh
ExecStartPost=/usr/bin/systemctl start --no-block NetworkManager.service

[Install]
WantedBy=multi-user.target
EOF

systemctl enable superbacked-browser.service

printf "%s\n" "Purging build packages…"

# The packages needed only while building the image, removed now that
# they have done their job: build-essential compiled the pinned PyPI
# wheels, curl downloaded and verified software, and libpcsclite-dev and
# python3-dev supplied the headers those wheels built against. None are
# needed in the shipped image (zlib1g-dev stays — the Superbacked app
# needs it). Everything else Ubuntu ships that the image will not keep
# was purged before the upgrade — see “Purging extraneous packages”
# above.
apt remove --purge --yes \
  build-essential \
  curl \
  libpcsclite-dev \
  python3-dev

apt autoremove --purge --yes

apt clean

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
    iif lo accept
  }
  chain forward {
    type filter hook forward priority 0; policy drop;
  }
  chain output {
    type filter hook output priority 0; policy drop;
    oif lo accept
  }
}
EOF

printf "%s\n" "Disabling Bluetooth…"

# Bluetooth has no role on this machine — keyboards and mice are wired.
# A radio is a second way into hardware that handles secrets, so the
# kernel driver is blocked and the service masked. Unlike networking,
# hardened browser mode does not bring it back.
tee /etc/modprobe.d/superbacked-bluetooth.conf > /dev/null << 'EOF'
install btusb /bin/false
EOF

systemctl mask bluetooth.service

printf "%s\n" "Disabling Wi-Fi in air-gapped mode…"

# In air-gapped mode the Wi-Fi radio is switched off — masked networking
# already prevents connections; a blocked radio stops the card from
# transmitting at all. Hardened browser mode keeps Wi-Fi available (not every
# machine has Ethernet), managed by NetworkManager behind the
# Firefox-only firewall.
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

printf "%s\n" "Disabling sudo…"

# superbacked keeps day-to-day use but loses root — a compromised
# session cannot escalate, make the disk writable or rewrite the
# firewall. (The browser grant above is unaffected; it does not rely on
# sudo group membership.)
deluser superbacked sudo

printf "%s\n" "Finishing provisioning…"

# GNOME initial setup would otherwise greet the first login with a
# welcome wizard on machines where the purge above left the gdm hook
# behind — the marker makes it a no-op either way.
mkdir --parents /home/superbacked/.config
touch /home/superbacked/.config/gnome-initial-setup-done

# Everything written into the home folders above was written as root —
# hand them to their owners.
chown --recursive clearnet:clearnet /home/clearnet
chown --recursive superbacked:superbacked /home/superbacked

printf "%s\n" "Bootstrap complete"
