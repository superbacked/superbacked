#! /bin/bash
# Updates a running debug-variant Superbacked OS to a freshly built app
# deb — the on-device half of the app iteration loop: build on the
# development machine, copy the deb from dist/ to the USB drive, run
# this, relaunch the app under test. Installing the deb also reinstalls
# the stock unconfined AppArmor profile its postinst carries, so
# confinement must be updated with update-apparmor-profiles.sh
# afterwards — the closing message says so rather than letting the app
# drift unconfined mid-harvest. Everything lands in the RAM overlay and
# vanishes at reboot.
#
# Usage: bash update-app.sh /path/to/superbacked.deb

set -o errexit
set -o pipefail

deb="${1:-}"

if [ -z "${deb}" ]; then
  printf "%s\n" "Error: pass the deb to install as first argument" >&2
  exit 1
fi

if [ ! -f "${deb}" ]; then
  printf "%s\n" "Error: ${deb} not found" >&2
  exit 1
fi

printf "%s\n" "Installing ${deb}…"

sudo dpkg --install "${deb}"

version="$(dpkg-query --show --showformat '${Version}' superbacked)"

printf "%s\n" \
  "Superbacked ${version} installed — the deb reinstalled its stock unconfined AppArmor profile" \
  "Please run update-apparmor-profiles.sh to update confinement before harvesting"
