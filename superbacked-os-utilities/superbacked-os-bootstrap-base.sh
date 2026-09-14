#! /bin/bash
# Installs everything Superbacked OS ships from pinned upstream sources
# — the Ubuntu package set, Firefox, the Trezor tools (trezorctl and
# the Trezor udev rules), Yubico Authenticator, YubiKey Manager (ykman)
# and yubikey-prov.sh, in that order — into the vanilla Ubuntu Desktop
# 24.04 (amd64) source image. Everything authored by this repository
# (users, hardening, the Superbacked app, AppArmor profiles) is layered
# on top by superbacked-os-bootstrap-main.sh, which runs next. The split
# exists so debug builds can cache this script’s result as an overlay
# layer keyed by its own text (see
# docker/create-superbacked-os-live-image.sh): every pin lives here, so
# a pin bump invalidates the layer and nothing else does. Runs as root
# inside a chroot of the source image overlay.
#
# Contract with the caller: root, working DNS (the caller installs the
# container’s resolv.conf), /dev /dev/pts /proc /sys /run mounted, and a
# policy-rc.d that keeps maintainer scripts from starting services. No
# systemd, dbus or logind is running — everything below is plain
# filesystem writes and apt/curl over the network. Each run starts from
# a pristine overlay, so nothing here guards against re-runs. Takes no
# arguments and never reads BUILD_VARIANT: the result is identical for
# both variants, which is what makes it cacheable.
#
# Usage (inside the chroot):
# bash superbacked-os-bootstrap-base.sh

set -o errexit
set -o pipefail

export DEBIAN_FRONTEND=noninteractive

# Installs a PyPI command-line tool into /home/superbacked/.local/bin
# as the superbacked user (pipx refuses to run as root). PyPI has no
# snapshots, so each tool is pinned by version and by the sha256 of its
# wheel (see the pins below): the wheel is downloaded first, checked,
# and only then installed from the verified file — failing loudly on
# any drift, so version and sha256 pins bump together. Transitive
# dependencies still resolve at install time; locking those too would
# take per-tool hash-locked requirements files.
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

printf "%s\n" "Starting base bootstrap…"

# Version pins, grouped so a release bump is one edit. The Ubuntu
# archive is pinned wholesale by snapshot timestamp — every package it
# provides resolves against that instant, so the same timestamp always
# yields the same packages. Firefox and Yubico Authenticator come
# from repositories without snapshots and are pinned by version
# instead: when an upstream drops a pinned version, the build fails
# loudly and the pin is bumped deliberately. The PyPI tools are pinned
# by version and by the sha256 of their wheel, verified before
# installation (bump both together after checking the “Download files”
# hashes on pypi.org) — their transitive dependencies still resolve at
# install time. yubikey-prov.sh is pinned by release tag and by the
# sha256 of the script, verified before installation (bump both
# together — superbacked-os-update-pins.sh computes the hash). The
# Trezor udev rules have no versions, so their sha256 is the pin: an
# upstream edit fails the build until reviewed and re-pinned
# (superbacked-os-update-pins.sh computes that hash too).
readonly apt_snapshot="20260908T000000Z"
readonly firefox_version="155.0.1"
readonly trezor_sha256="1acd67664bdc1cf389e719c91a09e6069688afa05959715955d5c1c54a2fefde"
readonly trezor_udev_rules_sha256="f3b39b4537da6260a7b63af07710aedfab1fe87d8eeff0975d176b9b908b9d6e"
readonly trezor_version="0.20.2"
readonly yubico_authenticator_version="7.4.1"
readonly yubikey_manager_sha256="19a1173106b104bea37722e61ce748fb2d39c87a02880c1964461837ddaa7fba"
readonly yubikey_manager_version="5.9.2"
readonly yubikey_prov_sha256="a64ccafcb7526c1435655499a5cc9d854f49b4165906784c89cc19c56dc4c606"
readonly yubikey_prov_version="1.1.0"

printf "%s\n" "Configuring apt sources…"

# Replaces the installer’s mirror configuration outright so nothing
# keeps resolving against a moving archive. universe carries six
# dependencies (exfatprogs, libfuse2, pcscd, pipx, scdaemon and
# waypipe among them); everything else is in main.
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
# - snapd: Superbacked OS ships no snaps — Firefox is a deb confined
#   by AppArmor instead of snap interfaces (see
#   superbacked-os-bootstrap-assets/). The pin above keeps it from
#   returning; its leftover directories are wiped below.
# - xserver-xorg*: a session X server runs one flat trust domain where
#   any client can log every keystroke and read every window, so one
#   selection at the (publicly passworded) login screen would flip the
#   machine out of window isolation. Ubuntu ships it only as a Wayland
#   fallback, and xserver-xorg-legacy adds a setuid-root binary.
#   Xwayland stays (ubuntu-session depends on it) but is a rootless,
#   unprivileged client that never starts with every app pinned to
#   Wayland.
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

# Build tools (build-essential, libpcsclite-dev, python3-dev,
# zlib1g-dev) compile the Trezor and YubiKey tools installed below
# (see “Installing Trezor tools” and “Installing YubiKey Manager”) —
# all are removed at the end of this script. curl and gnupg download
# and verify software, dconf-cli compiles the system dconf database
# (see “Configuring GNOME” in superbacked-os-bootstrap-main.sh),
# exfatprogs formats exFAT USB drives, language packs complete the
# English locale, libfuse2 runs AppImages, pcscd and scdaemon talk to
# smartcards and YubiKeys, python3-pip downloads the pinned PyPI wheels
# below, totem plays video with gstreamer1.0-libav decoding it (H.264
# including the 4:2:2 profile, plus AAC — the minimal install ships no
# video decoder), waypipe puts the browser on screen, wl-clipboard
# copies derived passwords to the clipboard (Wayland lets only a
# focused surface set the selection, and the command-line interface is
# windowless) and zenity shows error dialogs. (Firefox comes from its
# own repository — see the install section below.)
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
# regenerates the initramfs after the bootstrap scripts finish).
# Recommends are skipped: they add only documentation and live-tools,
# whose service would run at every boot for nothing.
apt install --no-install-recommends --yes live-boot

# pipx puts /home/superbacked/.local/bin on the superbacked user’s
# PATH once, ahead of the tools installed there below.
runuser --user superbacked -- \
  env HOME=/home/superbacked PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  pipx ensurepath

printf "%s\n" "Installing Firefox…"

# Firefox comes from Mozilla’s own apt repository — Ubuntu’s firefox
# deb is a transitional package that installs the snap. The repository
# signing key is fetched over HTTPS and its fingerprint checked against
# the one Mozilla publishes; provisioning stops rather than trust an
# unexpected key. The pin makes Mozilla’s origin win over Ubuntu’s
# transitional package for every overlapping name.
mkdir --parents /etc/apt/keyrings

curl --fail --location --proto '=https' https://packages.mozilla.org/apt/repo-signing-key.gpg \
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

printf "%s\n" "Installing Trezor tools…"

# trezorctl, the Trezor command-line tool.
install_pinned_tool trezor "${trezor_version}" "${trezor_sha256}"

# One-command Trezor initialization and mnemonic recovery with the
# recommended flags: 256-bit strength (24-word mnemonic) on setup, PIN
# and passphrase protection on both, BIP39. What varies is prompted
# with an editable pre-filled default — the label, and on recovery the
# word count (a restored mnemonic may predate the 24-word
# recommendation). Word entry itself happens on the device. Goes in
# .bashrc because GNOME Terminal runs interactive non-login shells,
# which skip .profile. (Ownership is handed back to superbacked at the
# end of provisioning, by superbacked-os-bootstrap-main.sh.)
tee --append /home/superbacked/.bashrc > /dev/null << 'EOF'

trezor-setup() {
  local label
  read -e -i "My Trezor Safe 7" -p "Label: " label \
    && trezorctl device setup --backup-type bip39 --label "${label}" --passphrase-protection --pin-protection --strength 256
}

trezor-recover() {
  local label words
  read -e -i "My Trezor Safe 7" -p "Label: " label \
    && read -e -i "24" -p "Words: " words \
    && trezorctl device recover --label "${label}" --passphrase-protection --pin-protection --words "${words}"
}
EOF

# Let regular users talk to Trezor hardware — the official rules
# uaccess-tag its usb and hidraw device nodes (wallet operations and
# FIDO alike). The upstream file keeps its name verbatim. YubiKey needs
# nothing here: systemd’s fido_id tags the FIDO interface of every
# vendor’s key, and the Superbacked deb (installed by
# superbacked-os-bootstrap-main.sh) ships a vendor-wide hidraw rule for
# the OTP (challenge-response) interface.
curl --fail --location --proto '=https' https://data.trezor.io/udev/51-trezor.rules \
  --output /etc/udev/rules.d/51-trezor.rules

printf "%s  %s\n" "${trezor_udev_rules_sha256}" /etc/udev/rules.d/51-trezor.rules \
  | sha256sum --check

printf "%s\n" "Installing Yubico Authenticator…"

# Yubico Authenticator manages the two-factor codes stored on a YubiKey.
# It reads them straight off the key over USB, so it works fully
# offline. Yubico ships each release as a signed download (the Snap
# Store version is abandoned) — the version is pinned by
# yubico_authenticator_version at the top of this script, and the
# signature is checked before anything is installed: if a release is
# ever signed by an unexpected key, provisioning stops rather than
# install it. Yubico occasionally changes signers; when that happens,
# update the fingerprint below after checking
# https://developers.yubico.com/Software_Projects/Software_Signing.html.
yubico_authenticator_url="https://developers.yubico.com/yubioath-flutter/Releases/yubico-authenticator-${yubico_authenticator_version}-linux.tar.gz"

curl --fail --location --proto '=https' --silent \
  "https://keys.openpgp.org/vks/v1/by-fingerprint/20EE325B86A81BCBD3E56798F04367096FBA95E8" \
  | gpg --import

curl --fail --location --proto '=https' "${yubico_authenticator_url}" \
  --output /tmp/yubico-authenticator.tar.gz
curl --fail --location --proto '=https' "${yubico_authenticator_url}.sig" \
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
StartupNotify=true
Terminal=false
Categories=Utility;Security;
EOF

printf "%s\n" "Installing YubiKey Manager…"

# ykman, the YubiKey command-line tool, for managing keys from the
# terminal (the Superbacked app speaks to YubiKeys directly and does
# not call it).
install_pinned_tool yubikey-manager "${yubikey_manager_version}" "${yubikey_manager_sha256}"

printf "%s\n" "Installing yubikey-prov.sh…"

# Helper script that provisions YubiKeys through GnuPG (gpg 2.3 or
# later and scdaemon, installed under “Installing dependencies”) —
# pinned by release tag with its sha256 verified before use, failing
# loudly on any drift. (Home folder ownership is handed back to
# superbacked at the end of provisioning, by
# superbacked-os-bootstrap-main.sh.)
mkdir --parents /home/superbacked/.local/bin/

curl --fail --location --proto '=https' "https://raw.githubusercontent.com/sunknudsen/yubikey-prov/v${yubikey_prov_version}/yubikey-prov.sh" \
  --output /home/superbacked/.local/bin/yubikey-prov.sh

printf "%s  %s\n" "${yubikey_prov_sha256}" /home/superbacked/.local/bin/yubikey-prov.sh \
  | sha256sum --check

chmod +x /home/superbacked/.local/bin/yubikey-prov.sh

printf "%s\n" "Purging build packages…"

# The packages needed only while building the image, removed now that
# they have done their job: build-essential compiled the pinned PyPI
# wheels, curl downloaded and verified software, and libpcsclite-dev,
# python3-dev and zlib1g-dev supplied the headers those wheels built
# against. None are needed in the shipped image (zlib1g-dev used to
# stay for the AppImage runtime, which dlopens the unversioned libz.so
# only the dev package ships — the deb-installed app has no such need).
# Removed here rather than at the very end of provisioning so a cached
# base layer never carries them either — the main bootstrap downloads
# nothing and compiles nothing.
apt remove --purge --yes \
  build-essential \
  curl \
  libpcsclite-dev \
  python3-dev \
  zlib1g-dev

apt autoremove --purge --yes

printf "%s\n" "Base bootstrap complete"
