#! /bin/bash
# Updates a running debug-variant Superbacked OS to the repository
# AppArmor profiles and reloads them — the on-device half of
# the profile iteration loop: edit in the repository, copy
# superbacked-os-bootstrap-assets/apparmor to the USB drive, run this,
# relaunch the app under test. Also clears the journal, so each
# capture-apparmor-log.sh harvest reflects only the profiles just
# loaded. Folds the complain flag into each
# profile the same way the bootstrap does for BUILD_VARIANT=debug —
# without it, freshly copied release profiles would silently enforce
# mid-harvest. Pass --enforce to skip the fold and test fixes under
# real enforcement (denials then block and log loudly; a mixed setup —
# one profile enforcing, the rest complaining — is still a manual copy
# of that one file). Everything lands in the RAM overlay and vanishes
# at reboot.
#
# Usage: bash update-apparmor-profiles.sh [--enforce] [/path/to/apparmor]

set -o errexit
set -o pipefail

mode="complain"
src=""

while [ $# -gt 0 ]; do
  case "${1}" in
    --enforce)
      mode="enforce"
      shift
      ;;
    *)
      src="${1}"
      shift
      ;;
  esac
done

src="${src:-/media/${USER}/Samsung DUO/apparmor}"

if [ ! -d "${src}" ]; then
  printf "%s\n" "Error: ${src} not found (pass the copied apparmor folder as first argument)" >&2
  exit 1
fi

sudo cp \
  "${src}/superbacked-browser" \
  "${src}/firefox" \
  "${src}/superbacked" \
  "${src}/yubico-authenticator" \
  /etc/apparmor.d/

# Same fold as the bootstrap’s “Installing AppArmor profiles” step:
# complain is folded into an existing flags=(…) when present, otherwise
# added as a new flags list; the t skips the second rule once the first
# fires. Skipped under --enforce — the repository copies carry no
# complain flag, so installing them verbatim enforces.
if [ "${mode}" = "complain" ]; then
  sudo sed --in-place --regexp-extended \
    -e 's|flags=\(([^)]*)\) \{$|flags=(\1 complain) {|' \
    -e 't' \
    -e 's| \{$| flags=(complain) {|' \
    /etc/apparmor.d/superbacked-browser \
    /etc/apparmor.d/firefox \
    /etc/apparmor.d/superbacked \
    /etc/apparmor.d/yubico-authenticator
fi

for profile in superbacked-browser firefox superbacked yubico-authenticator; do
  sudo apparmor_parser --replace "/etc/apparmor.d/${profile}"
done

# Start the next harvest from a clean slate: rotate the active journal
# into an archive, then vacuum the archives away, so
# capture-apparmor-log.sh only sees events generated under the
# profiles just loaded. The journal lives in RAM and holds nothing
# worth keeping on this amnesic OS.
sudo journalctl --rotate
sudo journalctl --vacuum-time=1s

printf "%s\n" "Profiles updated in ${mode} mode and journal cleared"
