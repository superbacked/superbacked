#! /bin/bash
# Keeps the pins at the top of superbacked-os-bootstrap.sh current. It
# queries the same canonical sources the bootstrap installs from,
# prints each pin next to the latest available version and, when
# something moved, shows the resulting readonly lines (wheel sha256
# included) and offers to apply them — declining leaves the file
# untouched, so bumps stay deliberate: the review happens at the
# prompt. (Note apt_snapshot moves the entire Ubuntu package set, not
# one tool — bump it consciously, typically alongside a release.)
#
# Sources queried:
#   apt_snapshot          snapshot.ubuntu.com (today’s snapshot, existence-checked)
#   firefox               packages.mozilla.org apt index
#   trezor                PyPI simple index (wheel sha256 from its URL fragment)
#   yubico_authenticator  developers.yubico.com release listing
#   yubikey_manager       PyPI simple index (wheel sha256 from its URL fragment)
#   yubikey_prov          GitHub release feed (script sha256 computed from its content)
#
# Runs on the host (macOS), so only portable tool options are used —
# unlike the bootstrap, which runs in a GNU chroot and prefers long
# options.
#
# Usage: bash superbacked-os-update-pins.sh

set -o errexit
set -o pipefail

bold=$(tput bold 2> /dev/null || true)
normal=$(tput sgr0 2> /dev/null || true)

bootstrap="$(dirname "${0}")/superbacked-os-bootstrap.sh"

if [ ! -f "${bootstrap}" ]; then
  printf "%s\n" "Error: ${bootstrap} not found" >&2
  exit 1
fi

# Reads a readonly pin value out of the bootstrap, failing loudly if
# the pin block ever changes shape.
pin() {
  local value
  value="$(sed -n "s/^readonly ${1}=\"\(.*\)\"\$/\1/p" "${bootstrap}")"
  if [ -z "${value}" ]; then
    printf "%s\n" "Error: pin ${1} not found in ${bootstrap}" >&2
    exit 1
  fi
  printf "%s" "${value}"
}

# Sorts x.y.z-style versions on stdin and returns the highest — dots
# split numeric fields, so 10 orders after 9 (a plain sort would not).
highest_version() {
  sort -u -t . -k 1,1n -k 2,2n -k 3,3n -k 4,4n | tail -n 1
}

# Latest version and wheel sha256 of a pure-Python package, from PyPI’s
# simple index — every wheel link carries its sha256 as a URL fragment,
# the same hash pypi.org shows under “Download files”. ${2} is the
# wheel filename prefix (PEP 427 turns dashes into underscores).
pypi_latest() {
  curl --fail --location --proto '=https' --silent "https://pypi.org/simple/${1}/" \
    | grep -o "${2}-[0-9][0-9.]*-py3-none-any\.whl#sha256=[0-9a-f]*" \
    | sed "s/^${2}-//; s/-py3-none-any\.whl#sha256=/ /" \
    | sort -u -t . -k 1,1n -k 2,2n -k 3,3n \
    | tail -n 1
}

failed=""
suggestions=""

# Prints one report line and, when the pin moved, queues the
# ready-to-paste readonly line(s).
report() {
  local name="${1}"
  local current="${2}"
  local latest="${3}"
  local lines="${4}"

  if [ -z "${latest}" ]; then
    printf "%-28s %-18s %s\n" "${name}" "${current}" "(query failed)"
    failed=true
  elif [ "${current}" = "${latest}" ]; then
    printf "%-28s %-18s %s\n" "${name}" "${current}" "up to date"
  else
    printf "%-28s %-18s %s\n" "${name}" "${current}" "→ ${latest}"
    suggestions="${suggestions}${lines}"
  fi
}

printf "%s\n" "Querying upstreams…"
printf "\n"

# apt_snapshot — today’s snapshot exists once the service has captured
# midnight UTC; the noble Release file is the cheapest existence probe.
apt_snapshot_latest="$(date -u +%Y%m%dT000000Z)"
if ! curl --fail --head --location --proto '=https' --silent \
  "https://snapshot.ubuntu.com/ubuntu/${apt_snapshot_latest}/dists/noble/Release" \
  > /dev/null; then
  apt_snapshot_latest=""
fi
report apt_snapshot "$(pin apt_snapshot)" "${apt_snapshot_latest}" \
  "readonly apt_snapshot=\"${apt_snapshot_latest}\"
"

# firefox — highest version in Mozilla’s apt index (what the bootstrap
# installs from), ~buildN suffix stripped to match the pin’s glob.
firefox_latest="$(
  curl --fail --location --proto '=https' --silent \
    https://packages.mozilla.org/apt/dists/mozilla/main/binary-amd64/Packages \
    | awk '/^Package: firefox$/ { f = 1 } f && /^Version:/ { print $2; f = 0 }' \
    | sed 's/~.*//' \
    | highest_version
)" || firefox_latest=""
report firefox_version "$(pin firefox_version)" "${firefox_latest}" \
  "readonly firefox_version=\"${firefox_latest}\"
"

# trezor — version and wheel sha256 move together.
trezor_latest="$(pypi_latest trezor trezor)" || trezor_latest=""
report trezor_version "$(pin trezor_version)" "${trezor_latest% *}" \
  "readonly trezor_sha256=\"${trezor_latest#* }\"
readonly trezor_version=\"${trezor_latest% *}\"
"

# yubico_authenticator — highest -linux.tar.gz in Yubico’s release
# listing (the directory the bootstrap downloads from).
yubico_authenticator_latest="$(
  curl --fail --location --proto '=https' --silent \
    https://developers.yubico.com/yubioath-flutter/Releases/ \
    | grep -o 'yubico-authenticator-[0-9][0-9.]*-linux\.tar\.gz' \
    | sed 's/^yubico-authenticator-//; s/-linux\.tar\.gz$//' \
    | highest_version
)" || yubico_authenticator_latest=""
report yubico_authenticator_version \
  "$(pin yubico_authenticator_version)" "${yubico_authenticator_latest}" \
  "readonly yubico_authenticator_version=\"${yubico_authenticator_latest}\"
"

# yubikey_manager — version and wheel sha256 move together.
yubikey_manager_latest="$(pypi_latest yubikey-manager yubikey_manager)" \
  || yubikey_manager_latest=""
report yubikey_manager_version \
  "$(pin yubikey_manager_version)" "${yubikey_manager_latest% *}" \
  "readonly yubikey_manager_sha256=\"${yubikey_manager_latest#* }\"
readonly yubikey_manager_version=\"${yubikey_manager_latest% *}\"
"

# yubikey_prov — highest release tag in the GitHub release feed, with
# the script sha256 computed from its content at that tag (version and
# sha256 move together).
yubikey_prov_latest="$(
  curl --fail --location --proto '=https' --silent \
    https://github.com/sunknudsen/yubikey-prov/releases.atom \
    | grep -o 'releases/tag/v[0-9][0-9.]*' \
    | sed 's|releases/tag/v||' \
    | highest_version
)" || yubikey_prov_latest=""
if [ -n "${yubikey_prov_latest}" ]; then
  yubikey_prov_latest_sha256="$(
    curl --fail --location --proto '=https' --silent \
      "https://raw.githubusercontent.com/sunknudsen/yubikey-prov/v${yubikey_prov_latest}/yubikey-prov.sh" \
      | shasum -a 256 \
      | awk '{ print $1 }'
  )" || yubikey_prov_latest=""
fi
report yubikey_prov_version \
  "$(pin yubikey_prov_version)" "${yubikey_prov_latest}" \
  "readonly yubikey_prov_sha256=\"${yubikey_prov_latest_sha256}\"
readonly yubikey_prov_version=\"${yubikey_prov_latest}\"
"

# A failed query means the report is partial — never offer to apply a
# partial picture.
if [ -n "${failed}" ]; then
  printf "\n%s\n" "Error: one or more upstream queries failed" >&2
  exit 1
fi

if [ -z "${suggestions}" ]; then
  exit 0
fi

printf "\n%s\n\n" "Suggested pin updates:"
printf "%s\n" "${suggestions}"

printf "${bold}%s${normal}" "Do you wish to apply suggested updates (y or n)? "
read -r answer
if [ "${answer}" != "y" ]; then
  exit 0
fi

# Each suggestion line replaces its readonly line in place. Written
# through cat so the bootstrap keeps its inode and permissions (a mv
# from mktemp would leave it mode 600 and unexecutable).
updated="$(mktemp)"
cp "${bootstrap}" "${updated}"

while IFS= read -r line; do
  if [ -z "${line}" ]; then
    continue
  fi
  name="${line#readonly }"
  name="${name%%=*}"
  sed "s|^readonly ${name}=.*|${line}|" "${updated}" > "${updated}.next"
  mv "${updated}.next" "${updated}"
done <<< "${suggestions}"

cat "${updated}" > "${bootstrap}"
rm "${updated}"

printf "%s\n" "Updated ${bootstrap##*/}"
