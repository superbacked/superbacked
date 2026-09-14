#! /bin/bash
# Copies the on-device debug loop from the repository to a mounted
# drive, run on the macOS host: the AppArmor profiles to
# <volume>/apparmor (where update-apparmor-profiles.sh looks by
# default), the debug scripts to <volume>/debug and, when dist/ holds
# an app deb, the newest one to <volume> (what update-app.sh consumes).
# Previous copies of the two folders are replaced so stale files never
# linger. Extended attributes are not copied (cp -X), so the drive gets
# no AppleDouble ._ files.
#
# Runs on the host (macOS), so only portable tool options are used.
#
# Usage: bash copy-debug-assets.sh "/Volumes/SAMSUNG DUO"

set -o errexit
set -o pipefail

volume="${1}"

if [ -z "${volume}" ] || [ ! -d "${volume}" ]; then
  printf "%s\n" "Error: usage: copy-debug-assets.sh /Volumes/<drive>" >&2
  exit 1
fi

repository="$(cd "$(dirname "${0}")/../.." && pwd)"

printf "%s\n" "Copying AppArmor profiles…"

rm -rf "${volume}/apparmor"
mkdir -p "${volume}/apparmor"
cp -X "${repository}"/superbacked-os-bootstrap-assets/apparmor/* "${volume}/apparmor/"

printf "%s\n" "Copying debug scripts…"

rm -rf "${volume}/debug"
mkdir -p "${volume}/debug"
cp -X "${repository}"/superbacked-os-utilities/debug/*.sh "${volume}/debug/"

# Newest by modification time — the deb name carries the version, and
# several may sit in dist/ after a version bump.
deb="$(ls -t "${repository}"/dist/superbacked-x64-*.deb 2> /dev/null | head -n 1 || true)"
if [ -n "${deb}" ]; then
  printf "%s\n" "Copying ${deb##*/}…"
  rm -f "${volume}"/superbacked-x64-*.deb
  cp -X "${deb}" "${volume}/"
else
  printf "%s\n" "No app deb in dist/ — skipping"
fi

sync

printf "%s\n" "Copied to ${volume}:"
ls -1 "${volume}/apparmor" "${volume}/debug" | sed 's/^/  /'
printf "%s\n" "Eject before unplugging: diskutil eject \"${volume}\""
