#! /bin/bash
# Turns a stock Ubuntu Desktop 24.04.4 LTS (amd64) install into the
# Superbacked OS source image (the Superbacked app is provisioned
# later, at live image creation time — see
# docker/create-superbacked-os-live-image.sh).
#
# Usage:
# bash superbacked-os-amd64-bootstrap.sh

set -e
set -o pipefail

# Disconnects a snap permission, tolerating ones that are already
# disconnected (so the script can safely be re-run) while still failing
# loudly when a name does not exist (a sign it was renamed upstream).
snap_disconnect() {
  local state
  state="$(snap connections "${1%%:*}" | awk -v plug="$1" '$2 == plug { print $3; exit }')"
  if [ -z "${state}" ]; then
    printf "%s\n" "Error: unknown snap plug ${1}" >&2
    exit 1
  fi
  if [ "${state}" != "-" ]; then
    sudo snap disconnect "$1"
  fi
}

printf "%s\n" "Configuring GNOME…"

# A quiet, dark desktop: black background, no icons on the desktop, no
# location services or telemetry, USB media never mounts itself, new
# USB devices are rejected while the screen is locked, and the terminal
# is white text on black.
gsettings set org.gnome.desktop.background picture-uri 'none'
gsettings set org.gnome.desktop.background picture-uri-dark 'none'
gsettings set org.gnome.desktop.background primary-color '#000000'
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
gsettings set org.gnome.desktop.media-handling automount false
gsettings set org.gnome.desktop.privacy remember-app-usage false
gsettings set org.gnome.desktop.privacy remember-recent-files false
gsettings set org.gnome.desktop.privacy report-technical-problems false
gsettings set org.gnome.desktop.privacy send-software-usage-stats false
gsettings set org.gnome.desktop.privacy usb-protection true
gsettings set org.gnome.desktop.privacy usb-protection-level 'lockscreen'
gsettings set org.gnome.mutter center-new-windows true
gsettings set org.gnome.shell.extensions.ding show-home false
gsettings set org.gnome.system.location enabled false
gsettings set \
  org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/ \
  background-color 'rgb(0,0,0)'
gsettings set \
  org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/ \
  foreground-color 'rgb(255,255,255)'
gsettings set \
  org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/ \
  use-theme-colors false
gsettings set \
  org.gnome.Terminal.ProfilesList default 'b1dcc9dd-5262-4d8d-a863-c897e6d979b9'
gsettings set \
  org.gnome.Terminal.ProfilesList list "['b1dcc9dd-5262-4d8d-a863-c897e6d979b9']"

# Dock shows what the image is for: official apps first — Superbacked,
# then the bundled apps, Firefox closing the set (in air-gapped mode
# its launcher explains that hardened browser mode is required, making
# the pin the discovery path into that mode rather than a dead icon) —
# followed by Files and Terminal utilities. Favorites are
# desktop-file ids resolved at session start, so superbacked.desktop
# can be pinned now even though the app itself is injected later, at
# image provisioning time (which is what lets app updates ship without
# re-running this bootstrap).
gsettings set org.gnome.shell favorite-apps "[
  'superbacked.desktop',
  'keepassxc_keepassxc.desktop',
  'com.yubico.yubioath.desktop',
  'firefox_firefox.desktop',
  'org.gnome.Terminal.desktop',
  'org.gnome.Nautilus.desktop'
]"

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
sudo rm --force /usr/share/xsessions/*.desktop

printf "%s\n" "Configuring audio…"

# On some laptops the speaker amplifier ignores the hardware volume
# control, so the volume keys move but the sound level never changes.
# Forcing software volume makes WirePlumber scale the samples itself,
# which always works. table.insert appends to the default rules — an
# assignment would replace them, dropping the rules that start the codec
# and silencing audio. This is WirePlumber 0.4 (Lua) syntax; 0.5 would
# need the SPA-JSON format under wireplumber.conf.d instead.
sudo mkdir --parents /etc/wireplumber/main.lua.d
sudo tee /etc/wireplumber/main.lua.d/51-alsa-soft-mixer.lua > /dev/null << 'EOF'
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

printf "%s\n" "Adding universe repository…"

# Six dependencies below (exfatprogs, libfuse2, pcscd, pipx, scdaemon
# and waypipe) come from universe; everything else is in main.
sudo add-apt-repository --yes universe

printf "%s\n" "Updating Ubuntu…"

sudo apt update
sudo apt upgrade --yes

printf "%s\n" "Installing dependencies…"

# Build tools (build-essential, libpcsclite-dev, python3-dev, zlib1g-dev)
# compile the wallet and YubiKey tools installed just below — all but
# zlib1g-dev (which the Superbacked app needs) are removed at the end of
# provisioning. curl and gnupg download and verify software, exfatprogs
# formats exFAT USB drives, language packs complete the English locale,
# libfuse2 runs AppImages, overlayroot makes the system forget everything
# at reboot, pcscd and scdaemon talk to smartcards and YubiKeys, totem
# plays video with gstreamer1.0-libav decoding it (H.264 including the
# 4:2:2 profile, plus AAC — the minimal install ships no video decoder),
# waypipe puts the browser on screen, and zenity shows error dialogs.
packages=(
  build-essential
  curl
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
  overlayroot
  pcscd
  pipx
  python3-dev
  scdaemon
  totem
  waypipe
  zenity
  zlib1g-dev
)

sudo apt install --yes "${packages[@]}"

# live-boot provides the initramfs plumbing the distributed live image
# boots with (see docker/create-superbacked-os-live-image.sh) —
# installed at provisioning time so image creation needs no network.
# Inert on this installed system: it only activates when boot=live is
# on the kernel command line. Recommends are skipped: they add only
# documentation and live-tools, whose service would run at every boot
# for nothing.
sudo apt install --no-install-recommends --yes live-boot

pipx ensurepath

# --force lets the script be re-run without errors on already-installed
# packages.
pipx install --force 'ckcc-protocol[cli]' trezor yubikey-manager

printf "%s\n" "Configuring udev rules…"

# Let regular users talk to COLDCARD, Trezor and YubiKey hardware over USB.
sudo curl --fail --location https://raw.githubusercontent.com/Coldcard/ckcc-protocol/master/51-coinkite.rules \
  --output /etc/udev/rules.d/51-coinkite.rules
sudo curl --fail --location https://data.trezor.io/udev/51-trezor.rules \
  --output /etc/udev/rules.d/51-trezor.rules
sudo curl --fail --location https://raw.githubusercontent.com/Yubico/libfido2/main/udev/70-u2f.rules \
  --output /etc/udev/rules.d/70-u2f.rules

# Internal disks are invisible to the desktop: USB drives are the only
# user-facing storage on Superbacked OS, and offering to mount internal
# disks with one click would invite the persistence and exfiltration
# risks the OS exists to prevent. udisks skips devices marked
# UDISKS_IGNORE, which hides them from Files and the dock alike.
sudo tee /etc/udev/rules.d/99-superbacked-ignore-internal-disks.rules > /dev/null << 'EOF'
SUBSYSTEM=="block", ENV{ID_BUS}!="usb", ENV{UDISKS_IGNORE}="1"
EOF

printf "%s\n" "Configuring yubikey-prov.sh…"

# Helper script that provisions YubiKeys.
mkdir --parents /home/superbacked/.local/bin/

curl --fail --location https://raw.githubusercontent.com/sunknudsen/yubikey-prov/main/yubikey-prov.sh \
  --output /home/superbacked/.local/bin/yubikey-prov.sh

chmod +x /home/superbacked/.local/bin/yubikey-prov.sh

printf "%s\n" "Installing Yubico Authenticator…"

# Yubico Authenticator manages the two-factor codes stored on a YubiKey.
# It reads them straight off the key over USB, so it works fully offline.
# Yubico ships the current app as a signed download (the Snap Store
# version is abandoned), and the signature is checked before anything is
# installed — if a release is ever signed by an unexpected key,
# provisioning stops rather than install it. Yubico occasionally changes
# signers; when that happens, update the fingerprint below after checking
# https://developers.yubico.com/Software_Projects/Software_Signing.html.
yubico_authenticator_url="https://developers.yubico.com/yubioath-flutter/Releases/yubico-authenticator-latest-linux.tar.gz"

curl --fail --location --silent \
  "https://keys.openpgp.org/vks/v1/by-fingerprint/20EE325B86A81BCBD3E56798F04367096FBA95E8" \
  | gpg --import

curl --fail --location --output /tmp/yubico-authenticator.tar.gz \
  "${yubico_authenticator_url}"
curl --fail --location --output /tmp/yubico-authenticator.tar.gz.sig \
  "${yubico_authenticator_url}.sig"

gpg --verify \
  /tmp/yubico-authenticator.tar.gz.sig \
  /tmp/yubico-authenticator.tar.gz

# The folder inside the archive is named after the version, which is not
# known ahead of time — extract to a fixed path so the launcher below
# always finds the app.
sudo rm --recursive --force /opt/yubico-authenticator
sudo mkdir --parents /opt/yubico-authenticator
sudo tar --extract --gzip --strip-components 1 \
  --file /tmp/yubico-authenticator.tar.gz \
  --directory /opt/yubico-authenticator

rm /tmp/yubico-authenticator.tar.gz /tmp/yubico-authenticator.tar.gz.sig

# Pinned to Wayland so authentication codes are never drawn through X11,
# where other apps could observe them. The entry is named after the app
# id (com.yubico.yubioath) so GNOME pairs the running window with its
# icon.
sudo mkdir --parents /usr/local/share/applications

sudo tee /usr/local/share/applications/com.yubico.yubioath.desktop > /dev/null << 'EOF'
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

printf "%s\n" "Configuring clearnet user…"

# Firefox runs as a separate user, clearnet — the only identity allowed
# to reach the internet in hardened browser mode (the “hardened browser”
# boot entry). It has no shell and no sudo rights; lingering keeps its
# session available without a graphical login, which snaps need.
if ! getent passwd clearnet > /dev/null; then
  sudo useradd --create-home --shell /usr/sbin/nologin clearnet
fi

# superbacked must be in the clearnet group to hand the browser bridge
# socket (created below) over to clearnet — files can only be re-grouped
# to a group their owner belongs to. Effective after the post-bootstrap
# reboot.
sudo usermod --append --groups clearnet superbacked

sudo loginctl enable-linger clearnet

# clearnet has no desktop session, so the desktop portal service Firefox
# consults at startup can never answer — every launch would stall for
# ~25 seconds waiting for it. Masking the service for clearnet makes
# those calls fail instantly, so Firefox starts right away.
# superbacked’s own portals are untouched.
sudo --user clearnet mkdir --parents /home/clearnet/.config/systemd/user
sudo --user clearnet ln --symbolic --force /dev/null \
  /home/clearnet/.config/systemd/user/xdg-desktop-portal.service

printf "%s\n" "Installing KeePassXC snap…"

if ! snap list keepassxc &> /dev/null; then
  sudo snap install keepassxc
fi

printf "%s\n" "Refreshing snaps…"

# Update all snaps before configuring and freezing them — the install
# media ships an older Firefox, and the freeze below locks in whatever is
# installed at that moment. Updating first means every build ships
# current versions.
sudo snap refresh

printf "%s\n" "Configuring KeePassXC snap interfaces…"

# home: users save databases in the home folder to drag and drop them
# into Superbacked — nothing there survives a reboot.
# raw-usb: needed for YubiKey challenge-response.
# removable-media: needed to save databases to USB — the only place a
# database survives a reboot.
sudo snap connect keepassxc:home
sudo snap connect keepassxc:raw-usb
sudo snap connect keepassxc:removable-media

# network/network-bind: a password manager has no business on the
# network (this also disables favicon downloads and update checks —
# intended).
# x11: KeePassXC may only run on Wayland, where other apps cannot watch
# its windows or keystrokes — without this, the Wayland pin in its
# launcher could be bypassed.
snap_disconnect keepassxc:network
snap_disconnect keepassxc:network-bind
snap_disconnect keepassxc:x11

# KeePassXC is pinned to Wayland — stop provisioning if the Qt Wayland
# plugin is missing rather than ship an image where it cannot launch.
# (Qt comes from the KDE frameworks snap, not the app itself.)
if ! find /snap/keepassxc/current/ /snap/kf5-*/current/ \
  -name "libqwayland*" 2> /dev/null | grep -q .; then
  printf "%s\n" "Error: Qt Wayland platform plugin not found for KeePassXC" >&2
  exit 1
fi

printf "%s\n" "Hardening Firefox snap interfaces…"

# audio-record/camera: a compromised browser must not hear or see the
# room where blockcards are printed and handled.
# avahi-observe: no local network discovery.
# cups-control: blockcards are printed on this machine — the browser gets
# no access to printing.
# dot-mozilla-firefox/home: no access to home folders — a browser
# launched as the wrong user could otherwise read superbacked’s files.
# Downloads still work; they go to a dedicated folder (see “Configuring
# shared Downloads folder” below).
# removable-media: nothing the browser downloads can reach USB media, and
# it cannot read USB drives superbacked has mounted.
# x11/unity7: Wayland only — X11 would let other apps watch the browser,
# and unity7 would quietly reopen it.
# u2f-devices: stays connected so websites can use hardware security
# keys.
snap_disconnect firefox:audio-record
snap_disconnect firefox:avahi-observe
snap_disconnect firefox:camera
snap_disconnect firefox:cups-control
snap_disconnect firefox:dot-mozilla-firefox
snap_disconnect firefox:home
snap_disconnect firefox:removable-media
snap_disconnect firefox:unity7
snap_disconnect firefox:x11

printf "%s\n" "Configuring Firefox policies…"

sudo mkdir --parents /etc/firefox/policies

# Firefox is configured through an enterprise policy, locked so nothing
# can be changed from inside the browser. Official policy keys are used
# wherever one exists; the Preferences block pins only settings that have
# none. The JSON keys are alphabetical; by intent:
#
#   Privacy — no Firefox accounts, Pocket, studies or telemetry, and no
#     first-run prompts (the amnesic profile would show them every boot).
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
sudo tee /etc/firefox/policies/policies.json > /dev/null << 'EOF'
{
  "policies": {
    "AIControls": {
      "Default": {
        "Value": "blocked",
        "Locked": true
      }
    },
    "AutofillAddressEnabled": false,
    "AutofillCreditCardEnabled": false,
    "BrowserDataBackup": {
      "AllowBackup": false,
      "AllowRestore": false
    },
    "CaptivePortal": false,
    "DisableFirefoxAccounts": true,
    "DisableFirefoxStudies": true,
    "DisablePocket": true,
    "DisableTelemetry": true,
    "DNSOverHTTPS": {
      "Enabled": true,
      "Fallback": false,
      "ProviderURL": "https://dns.mullvad.net/dns-query",
      "Locked": true
    },
    "DontCheckDefaultBrowser": true,
    "DownloadDirectory": "/home/clearnet/snap/firefox/common/Downloads",
    "EnableTrackingProtection": {
      "Category": "strict",
      "Value": true,
      "Locked": true
    },
    "FirefoxHome": {
      "Highlights": false,
      "Pocket": false,
      "Search": true,
      "SponsoredPocket": false,
      "SponsoredTopSites": false,
      "TopSites": false,
      "Weather": false,
      "Locked": true
    },
    "FirefoxSuggest": {
      "ImproveSuggest": false,
      "SponsoredSuggestions": false,
      "WebSuggestions": false,
      "Locked": true
    },
    "HttpsOnlyMode": "force_enabled",
    "OfferToSaveLogins": false,
    "PasswordManagerEnabled": false,
    "Preferences": {
      "browser.ml.enable": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.section.highlights.includeBookmarks": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.section.highlights.includeVisited": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.showSponsoredCheckboxes": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.system.showWeather": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.widgets.clocks.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.widgets.crossword.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.widgets.focusTimer.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.widgets.lists.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.widgets.privacy.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.widgets.sportsWidget.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.widgets.stocks.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.widgets.system.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.newtabpage.activity-stream.widgets.weather.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.theme.content-theme": {
        "Status": "locked",
        "Value": 0
      },
      "browser.theme.toolbar-theme": {
        "Status": "locked",
        "Value": 0
      },
      "browser.urlbar.quickactions.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.urlbar.quicksuggest.enabled": {
        "Status": "locked",
        "Value": false
      },
      "browser.urlbar.showSearchSuggestionsFirst": {
        "Status": "locked",
        "Value": false
      },
      "browser.urlbar.suggest.engines": {
        "Status": "locked",
        "Value": false
      },
      "browser.urlbar.suggest.quickactions": {
        "Status": "locked",
        "Value": false
      },
      "browser.urlbar.suggest.topsites": {
        "Status": "locked",
        "Value": false
      },
      "browser.urlbar.suggest.trending": {
        "Status": "locked",
        "Value": false
      },
      "layout.css.prefers-color-scheme.content-override": {
        "Status": "locked",
        "Value": 0
      },
      "media.peerconnection.enabled": {
        "Status": "locked",
        "Value": false
      },
      "network.trr.bootstrapAddr": {
        "Status": "locked",
        "Value": "194.242.2.2"
      },
      "signon.autofillForms": {
        "Status": "locked",
        "Value": false
      },
      "signon.firefoxRelay.feature": {
        "Status": "locked",
        "Value": "disabled"
      },
      "signon.generation.enabled": {
        "Status": "locked",
        "Value": false
      },
      "widget.use-xdg-desktop-portal.file-picker": {
        "Status": "locked",
        "Value": 0
      },
      "widget.use-xdg-desktop-portal.location": {
        "Status": "locked",
        "Value": 0
      },
      "widget.use-xdg-desktop-portal.mime-handler": {
        "Status": "locked",
        "Value": 0
      },
      "widget.use-xdg-desktop-portal.open-uri": {
        "Status": "locked",
        "Value": 0
      },
      "widget.use-xdg-desktop-portal.settings": {
        "Status": "locked",
        "Value": 0
      }
    },
    "PrivateBrowsingModeAvailability": 2,
    "PromptForDownloadLocation": false,
    "SearchEngines": {
      "Default": "DuckDuckGo"
    },
    "SearchSuggestEnabled": false,
    "UserMessaging": {
      "ExtensionRecommendations": false,
      "FeatureRecommendations": false,
      "FirefoxLabs": false,
      "MoreFromMozilla": false,
      "SkipOnboarding": true,
      "UrlbarInterventions": false,
      "Locked": true
    }
  }
}
EOF

# Gives the confined browser read access to /etc/firefox — how the
# policy above reaches it.
sudo snap connect firefox:etc-firefox

printf "%s\n" "Overriding stock launchers…"

# Replace the stock launchers with same-name entries in a
# higher-priority directory, so the familiar icons do the right thing:
#   Firefox   → starts through the clearnet wrapper (hardened browser
#               mode only)
#   KeePassXC → pinned to Wayland
sudo mkdir --parents /usr/local/share/applications

sudo cp \
  /var/lib/snapd/desktop/applications/firefox_firefox.desktop \
  /usr/local/share/applications/firefox_firefox.desktop

sudo sed --in-place \
  's|^Exec=.*|Exec=/usr/local/bin/clearnet-browser|' \
  /usr/local/share/applications/firefox_firefox.desktop

sudo cp \
  /var/lib/snapd/desktop/applications/keepassxc_keepassxc.desktop \
  /usr/local/share/applications/keepassxc_keepassxc.desktop

sudo sed --in-place \
  's|^Exec=|Exec=env QT_QPA_PLATFORM=wayland |' \
  /usr/local/share/applications/keepassxc_keepassxc.desktop

printf "%s\n" "Freezing and pre-warming snaps…"

# Freeze snap updates for good — the image must not change itself, and
# hardened browser mode must not generate update traffic.
sudo snap refresh --hold

# Refreshing keeps each snap’s previous revision around as a revert
# fallback — pointless on a frozen, amnesic image, where every kept
# revision ships as a full copy that compression cannot shrink. Remove
# old revisions and the snap download cache.
snap list --all | awk '/disabled/ { print $1, $3 }' \
  | while read -r name revision; do
      sudo snap remove "${name}" --revision="${revision}"
    done

sudo rm --recursive --force /var/lib/snapd/cache/*

# Remove orphaned snaps — snaps nothing else depends on. A snap is a
# dependency in one of two ways: as a base (declared in each dependent’s
# snap.yaml — snapd refuses to remove an in-use base) or as a content
# provider (another snap connects to one of its slots — NOT protected by
# snapd, so removing a connected one would break its consumers, e.g.
# Firefox losing its gnome-platform content mount). Both are checked
# explicitly. Only snaps that ship no apps are candidates, so
# user-facing snaps (Firefox, KeePassXC…) are never removed even though
# nothing connects to them. For example, the image ships two GNOME
# platform snaps but only the newer one is connected — the older one is
# orphaned. Passes repeat until nothing is removed, collapsing
# dependency chains: removing an orphaned platform snap can orphan the
# base it was the last user of. --purge skips the automatic snapshot
# snapd would otherwise bake into the image.
snap_removed=true
while [ "${snap_removed}" = true ]; do
  snap_removed=false
  for name in $(snap list | awk 'NR > 1 { print $1 }'); do
    snap_yaml="/snap/${name}/current/meta/snap.yaml"

    # snapd itself, core-type, kernel and gadget snaps are system
    # infrastructure — never candidates. core is also the implicit base
    # of snaps whose snap.yaml declares none, so the base check below
    # would not see its dependents.
    snap_type="$(awk '/^type:/ { print $2; exit }' "${snap_yaml}")"
    if [ "${snap_type}" = "snapd" ] \
      || [ "${snap_type}" = "os" ] \
      || [ "${snap_type}" = "kernel" ] \
      || [ "${snap_type}" = "gadget" ]; then
      continue
    fi

    # Ships apps → user-facing, keep
    if grep --quiet "^apps:" "${snap_yaml}"; then
      continue
    fi

    # Another installed snap declares it as base → keep
    if grep --quiet "^base: ${name}$" /snap/*/current/meta/snap.yaml; then
      continue
    fi

    # Something connects to one of its slots → keep. awk reads all of
    # its input, unlike grep --quiet which can exit on first match and
    # trip pipefail with a SIGPIPE upstream.
    if snap connections | awk \
      -v slot="${name}:" \
      'index($3, slot) == 1 { found = 1 } END { exit !found }'; then
      continue
    fi

    sudo snap remove --purge "${name}"
    snap_removed=true
  done
done

# The seed holds first-boot copies of the preinstalled snaps, duplicating
# what is now installed (about a gigabyte). snapd records that it has
# seeded, so it never reads these again — remove them.
sudo rm --recursive --force \
  /var/lib/snapd/seed/snaps/* \
  /var/lib/snapd/seed/assertions/*

# Run each snap once so its per-user data folders exist and are baked
# into the image — the KeePassXC theme and the downloads folder below
# are written into them.
sudo --user clearnet --set-home snap run firefox --version || true
snap run keepassxc --version || true

printf "%s\n" "Configuring shared Downloads folder…"

# Firefox saves downloads here — the one place the confined browser can
# write. Created now so it exists on every boot; whatever lands in it
# disappears at reboot. superbacked (via the clearnet group) can read
# and clear it; no one else can.
sudo --user clearnet mkdir --parents \
  /home/clearnet/snap/firefox/common/Downloads
sudo --user clearnet chmod 2770 \
  /home/clearnet/snap/firefox/common/Downloads

# Show the same folder at superbacked’s ~/Downloads so downloaded files
# are easy to reach and move to external storage. This is one-way —
# superbacked gets a view into the browser’s downloads, the browser
# gains nothing — and nothing in it can be executed in place.
mkdir --parents /home/superbacked/Downloads

sudo tee /etc/systemd/system/home-superbacked-Downloads.mount > /dev/null << 'EOF'
[Unit]
Description=Shared browser Downloads (clearnet → superbacked)
# No After=local-fs.target here — it would create an ordering cycle that
# leaves the mount dead at boot. The default mount dependencies already
# order it correctly.

[Mount]
What=/home/clearnet/snap/firefox/common/Downloads
Where=/home/superbacked/Downloads
Type=none
# x-gvfs-hide keeps the bind mount out of the file manager sidebar —
# it would otherwise show as a mounted volume, inviting users to
# unmount their own Downloads folder.
Options=bind,noexec,nosuid,nodev,nosymfollow,x-gvfs-hide

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable home-superbacked-Downloads.mount

printf "%s\n" "Configuring toram status…"

# live-boot copies Superbacked OS to memory (toram) when there is
# enough of it and silently falls back to running from the USB flash
# drive when there is not — the desktop looks identical either way, and
# unplugging the drive in the fallback case crashes the session. This
# warning, shown at login only in the fallback case, is the only signal
# a user gets — with enough memory no dialog appears and the drive can
# simply be unplugged, as documented. Exits quietly on non-live boots
# (the source system).
sudo tee /usr/local/bin/superbacked-toram-status > /dev/null << 'EOF'
#! /bin/bash

medium_fstype="$(findmnt --noheadings --output FSTYPE /run/live/medium 2> /dev/null)"

if [ -n "${medium_fstype}" ] && [ "${medium_fstype}" != "tmpfs" ]; then
  zenity --warning \
    --text "Keep the USB flash drive plugged in — this computer does not have enough memory to hold Superbacked OS, so it is running directly from the drive. Unplugging it would crash the session." \
    --title "Superbacked OS" 2> /dev/null
fi
EOF

sudo chmod +x /usr/local/bin/superbacked-toram-status

sudo tee /etc/xdg/autostart/superbacked-toram-status.desktop > /dev/null << 'EOF'
[Desktop Entry]
Type=Application
Name=Superbacked toram status
Exec=/usr/local/bin/superbacked-toram-status
EOF

printf "%s\n" "Configuring KeePassXC theme…"

# The desktop is dark-mode only, but a snapped app cannot see GNOME’s
# setting — pin the theme so KeePassXC never launches in light mode.
# Written now because home folders reset at every boot.
if [ ! -d /home/superbacked/snap/keepassxc/current ]; then
  printf "%s\n" "Error: KeePassXC snap user data missing (pre-warm failed)" >&2
  exit 1
fi

mkdir --parents /home/superbacked/snap/keepassxc/current/.config/keepassxc

tee /home/superbacked/snap/keepassxc/current/.config/keepassxc/keepassxc.ini > /dev/null << 'EOF'
[General]
ConfigVersion=2

[GUI]
ApplicationTheme=dark
EOF

printf "%s\n" "Configuring clearnet browser launcher…"

# Directory for the browser bridge socket — superbacked creates the
# socket, clearnet connects to it.
sudo tee /etc/tmpfiles.d/clearnet-bridge.conf > /dev/null << 'EOF'
d /run/clearnet-bridge 0750 superbacked clearnet -
EOF

sudo systemd-tmpfiles --create /etc/tmpfiles.d/clearnet-bridge.conf

sudo tee /usr/local/bin/clearnet-browser > /dev/null << 'EOF'
#! /bin/bash

set -e

if ! grep -q superbacked.browser /proc/cmdline; then
  zenity --error \
    --text "Reboot and select “Superbacked OS (hardened browser)” to use browser" \
    --title "Superbacked OS" 2> /dev/null
  exit 1
fi

clearnet_uid="$(id -u clearnet)"
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
    --text "Browser bridge failed to start" \
    --title "Superbacked OS" 2> /dev/null
  exit 1
fi

chgrp clearnet "${bridge_socket}"
chmod 660 "${bridge_socket}"

# The launcher inherits superbacked’s home as working directory, which
# clearnet cannot read — move somewhere neutral before switching users.
cd /

# snap run needs clearnet’s session bus to start confined apps —
# lingering (enabled earlier) is what provides it. GTK_USE_PORTAL=0
# keeps the toolkit from waiting on desktop portals clearnet cannot
# answer; dark mode is pinned by policy, so nothing is lost.
if ! sudo --user clearnet --set-home \
  /usr/bin/env \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${clearnet_uid}/bus" \
    GTK_USE_PORTAL=0 \
    MOZ_ENABLE_WAYLAND=1 \
    XDG_RUNTIME_DIR="/run/user/${clearnet_uid}" \
  /usr/bin/waypipe --oneshot --socket "${bridge_socket}" server -- \
  /usr/bin/snap run firefox --no-remote; then
  zenity --error \
    --text "Browser failed to start" \
    --title "Superbacked OS" 2> /dev/null
fi

kill "${waypipe_pid}" 2> /dev/null || true
EOF

sudo chmod +x /usr/local/bin/clearnet-browser

# Allow superbacked to start Firefox as clearnet — this exact command
# line and nothing else (it survives the sudo removal at the end). If
# the launcher above changes, this line must change with it.
sudo tee /etc/sudoers.d/clearnet-browser > /dev/null << 'EOF'
superbacked ALL=(clearnet) SETENV: NOPASSWD: /usr/bin/env DBUS_SESSION_BUS_ADDRESS=* GTK_USE_PORTAL=0 MOZ_ENABLE_WAYLAND=1 XDG_RUNTIME_DIR=* /usr/bin/waypipe --oneshot --socket /run/clearnet-bridge/waypipe.sock server -- /usr/bin/snap run firefox --no-remote
EOF

sudo chmod 440 /etc/sudoers.d/clearnet-browser

sudo visudo --check

printf "%s\n" "Configuring NTP…"

# Hardened browser mode has no system DNS, so the clock syncs against
# time.cloudflare.com by IP address. Accurate time matters when
# enrolling two-factor codes.
sudo tee /etc/systemd/timesyncd.conf > /dev/null << 'EOF'
[Time]
NTP=162.159.200.1 162.159.200.123
EOF

printf "%s\n" "Configuring hardened browser mode firewall…"

# Used only in hardened browser mode — replaces the default
# rules with exactly three allowances:
#   clearnet         → web traffic (Firefox; DNS rides inside HTTPS)
#   systemd-timesync → time sync, to Cloudflare’s addresses only
#   root             → DHCP (joining the network)
sudo tee /usr/local/sbin/superbacked-browser-firewall.sh > /dev/null << 'EOF'
#! /bin/bash

set -e

# Old rules are flushed and new ones loaded in a single transaction, so
# there is never a moment without a firewall.
nft -f - << 'RULESET'
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

sudo chmod +x /usr/local/sbin/superbacked-browser-firewall.sh

sudo tee /etc/systemd/system/superbacked-browser.service > /dev/null << 'EOF'
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

sudo systemctl enable superbacked-browser.service

printf "%s\n" "Uninstalling extraneous software…"

# Remove the build tools used earlier (zlib1g-dev stays — the app needs
# it) along with Ubuntu’s updaters and crash reporters: nothing on this
# image should update itself or phone home.
#
# The Xorg server packages are also removed. Xorg is a session X
# server: the desktop it runs owns one flat trust domain where any
# client can log every keystroke and read every window, so with the
# packages present, one selection at the login screen (open to anyone —
# the password is public) flips the whole machine out of window
# isolation. Ubuntu ships them purely as a compatibility fallback for
# hardware where Wayland fails, nothing requires them beyond Recommends
# from gdm3 and gnome-shell, and xserver-xorg-legacy adds a setuid-root
# binary — privilege-escalation surface even if no X session ever runs.
#
# Xwayland stays (ubuntu-session hard-depends on it) but is a different
# animal: a rootless, unprivileged Wayland client that owns no input
# devices and cannot see Wayland windows or keystrokes. With every
# bundled app pinned to Wayland — failing closed rather than falling
# back — no X11 client exists, so it never even starts. Residual
# surface: its codebase as an exploitation target for an already
# compromised process.
sudo apt remove --purge --yes \
  apport \
  build-essential \
  curl \
  libpcsclite-dev \
  memtest86+ \
  python3-dev \
  unattended-upgrades \
  update-manager \
  update-manager-core \
  update-notifier \
  update-notifier-common \
  whoopsie \
  xserver-xorg \
  xserver-xorg-core \
  xserver-xorg-legacy

sudo apt autoremove --purge --yes

sudo apt clean

printf "%s\n" "Configuring fstab…"

# Mount the system partitions read-only (the checks keep a re-run from
# applying the change twice).
if ! grep -q "ext4 defaults,noload,ro" /etc/fstab; then
  sudo sed --in-place 's/ext4 defaults/ext4 defaults,noload,ro/g' /etc/fstab
fi

if ! grep -q "vfat defaults,ro" /etc/fstab; then
  sudo sed --in-place 's/vfat defaults/vfat defaults,ro/g' /etc/fstab
fi

printf "%s\n" "Disabling fsck.repair and enabling read-only…"

if ! grep -q "fsck.repair=no" /etc/default/grub; then
  sudo sed --in-place 's/quiet splash/quiet splash fsck.repair=no ro/g' /etc/default/grub
fi

printf "%s\n" "Configuring boot mode selection…"

# Show the boot menu with the air-gapped system as default — an
# unattended boot always lands in air-gapped mode; hardened browser mode
# is a deliberate choice.
sudo sed --in-place 's/GRUB_TIMEOUT_STYLE=hidden/GRUB_TIMEOUT_STYLE=menu/g' /etc/default/grub
sudo sed --in-place 's/GRUB_TIMEOUT=[0-9]*/GRUB_TIMEOUT=5/g' /etc/default/grub

root_uuid="$(findmnt --noheadings --output UUID /)"
kernel="$(basename "$(readlink --canonicalize /boot/vmlinuz)")"
initrd="$(basename "$(readlink --canonicalize /boot/initrd.img)")"

# The two Superbacked entries come first, so “Superbacked OS
# (air-gapped)” is the default boot. They pin the exact kernel captured
# now and skip stock behaviors known to misbehave on write-protected or
# picky hardware, so every boot is identical. (The stock Ubuntu entries
# are hidden below.)
#
# init_on_free=1 makes the kernel zero memory the moment it is freed,
# so secrets do not linger in RAM after the app releases them — a
# cold-boot attack recovers nothing. (Its counterpart init_on_alloc=1
# is already Ubuntu’s default.)
sudo tee /etc/grub.d/09_superbacked > /dev/null << EOF
#!/bin/sh
exec tail -n +3 \$0
menuentry "Superbacked OS (air-gapped)" {
  search --no-floppy --fs-uuid --set=root ${root_uuid}
  linux /boot/${kernel} fsck.repair=no init_on_free=1 quiet ro root=UUID=${root_uuid} splash
  initrd /boot/${initrd}
}
menuentry "Superbacked OS (hardened browser)" {
  search --no-floppy --fs-uuid --set=root ${root_uuid}
  linux /boot/${kernel} fsck.repair=no init_on_free=1 quiet ro root=UUID=${root_uuid} splash superbacked.browser
  initrd /boot/${initrd}
}
EOF

sudo chmod +x /etc/grub.d/09_superbacked

# A leftover boot-failure flag would make the menu wait forever — bound
# the wait and clear any recorded failure.
if ! grep -q "GRUB_RECORDFAIL_TIMEOUT" /etc/default/grub; then
  printf "%s\n" "GRUB_RECORDFAIL_TIMEOUT=5" \
    | sudo tee --append /etc/default/grub > /dev/null
fi

sudo grub-editenv - unset recordfail

# Hide the stock Ubuntu entries — the Superbacked entries boot the same
# kernel, without the clutter. (Rescue access remains possible by
# editing an entry in GRUB; “UEFI Firmware Settings” stays.)
sudo chmod -x /etc/grub.d/10_linux

# No entries for other operating systems — dual-boot machines keep using
# the firmware boot menu. Delete-then-append because the installer may
# have written its own setting.
sudo sed --in-place '/^#\?GRUB_DISABLE_OS_PROBER=/d' /etc/default/grub

printf "%s\n" "GRUB_DISABLE_OS_PROBER=true" \
  | sudo tee --append /etc/default/grub > /dev/null

sudo update-grub

printf "%s\n" "Configuring overlayroot…"

# The root filesystem is overlaid with RAM — every change made while the
# system runs is discarded at reboot. This is what makes Superbacked OS
# amnesic.
sudo sed --in-place 's/overlayroot=""/overlayroot="tmpfs"/g' /etc/overlayroot.conf

printf "%s\n" "Disabling networking…"

# Networking is masked, not merely disabled — a disabled service can
# still be woken in the background (the desktop’s network indicator does
# this at login), and its DHCP traffic slips past the firewall. Masked,
# it cannot start at all: air-gapped mode is silent on the network.
# Hardened browser mode unmasks it (see “Configuring hardened browser
# mode firewall” above).
sudo systemctl mask NetworkManager.service NetworkManager-wait-online.service

sudo systemctl enable nftables

# The default firewall, loaded at every boot: nothing in, nothing out.
# Hardened browser mode replaces it with the Firefox-only rules above.
sudo tee /etc/nftables.conf > /dev/null << 'EOF'
#!/usr/sbin/nft -f

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

sudo nft -f /etc/nftables.conf

printf "%s\n" "Disabling Bluetooth…"

# Bluetooth has no role on this machine — keyboards and mice are wired.
# A radio is a second way into hardware that handles secrets, so the
# kernel driver is blocked and the service masked. Unlike networking,
# hardened browser mode does not bring it back.
sudo tee /etc/modprobe.d/superbacked-bluetooth.conf > /dev/null << 'EOF'
install btusb /bin/false
EOF

sudo systemctl mask bluetooth.service

printf "%s\n" "Disabling Wi-Fi in air-gapped mode…"

# In air-gapped mode the Wi-Fi radio is switched off — masked networking
# already prevents connections; a blocked radio stops the card from
# transmitting at all. Hardened browser mode keeps Wi-Fi available (not every
# machine has Ethernet), managed by NetworkManager behind the
# Firefox-only firewall.
sudo tee /etc/systemd/system/superbacked-airgap.service > /dev/null << 'EOF'
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

sudo systemctl enable superbacked-airgap.service

printf "%s\n" "Disabling sudo…"

# superbacked keeps day-to-day use but loses root — a compromised
# session cannot escalate, make the disk writable or rewrite the
# firewall. (The browser grant above is unaffected; it does not rely on
# sudo group membership.)
if id --groups --name superbacked | grep -q --word-regexp sudo; then
  sudo deluser superbacked sudo
fi

printf "%s\n" "Purging Bash history…"

history -cw

printf "%s\n" "Creating bootstrap completion marker…"

mkdir --parents /home/superbacked/.config

touch /home/superbacked/.config/superbacked-os-bootstrap.done

printf "%s\n" "Bootstrap complete—please reboot to apply changes"

read -p "Press enter to reboot…" -r

systemctl reboot
