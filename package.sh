#! /bin/bash
# Used to build and package Superbacked

set -o errexit
set -o pipefail

bold=$(tput bold)
normal=$(tput sgr0)

# Parse command-line options
build_app=""
build_os=""
partial=false

function show_help() {
  cat << EOF
Usage: package.sh [options]

Options:
  --app               Build app only
  --os                Build Superbacked OS only
  --all               Build and package everything without prompts
  -h, --help          Show this help message

If no options are provided, the script will prompt for each step.
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "${1}" in
    -h|--help)
      show_help
      ;;
    --app)
      build_app=true
      partial=true
      shift
      ;;
    --os)
      build_os=true
      partial=true
      shift
      ;;
    --all)
      build_app=true
      build_os=true
      shift
      ;;
    *)
      echo "Error: Unknown option: ${1}" >&2
      exit 1
      ;;
  esac
done

version=$(node --eval 'console.log(require("./package.json").version)')

# Prompt to build app if not specified
if [ "${partial}" != true ] && [ -z "${build_app}" ]; then
  printf "${bold}%s${normal}" "Do you wish to build app (y or n)? "
  read -r answer
  if [ "${answer}" = "y" ]; then
    build_app=true
  fi
fi

if [ "${build_app}" = true ]; then
  printf "%s\n" "Purging dist folder…"

  find ./dist ! -name .borgignore -delete

  printf "%s\n" "Building Superbacked app…"

  npm run lint

  npm run build

  for file in dist/*.AppImage; do
    mv "${file}" "$(echo "${file}" | sed 's/x86_64/x64/')"
  done
fi

# Prompt to build OS if not specified
if [ "${partial}" != true ] && [ -z "${build_os}" ]; then
  printf "${bold}%s${normal}" "Do you wish to build Superbacked OS (y or n)? "
  read -r answer
  if [ "${answer}" = "y" ]; then
    build_os=true
  fi
fi

if [ "${build_os}" = true ]; then
  printf "%s\n" "Purging Superbacked OS images…"

  find ./dist -type f \( -name "*.img*" \) -delete

  printf "%s\n" "Starting Colima…"

  colima start \
    --profile superbacked \
    --cpu 2 \
    --disk 20 \
    --memory 4

  printf "%s\n" "Creating live Superbacked OS image…"

  # Provisioning and live conversion happen in one pass: the source
  # image is read-only input and the live image is written straight to
  # its distribution name (<product>-<arch>-<component>-<version>).
  docker run \
    --interactive \
    --privileged \
    --rm \
    --tty \
    --volume $(pwd)/dist:/dist \
    --volume $(pwd)/superbacked-os:/superbacked-os:ro \
    --volume $(pwd)/superbacked-os-bootstrap-assets:/superbacked-os-bootstrap-assets:ro \
    superbacked-os-docker:24.04 \
    /root/create-superbacked-os-live-image.sh \
    /superbacked-os/superbacked-os-amd64-24.04.4.img \
    /dist/superbacked-os-amd64-live-${version}.img \
    ${version}

  printf "%s\n" "Splitting live Superbacked OS image into parts…"

  # GitHub release assets are capped at 2 GiB — ship the raw image in
  # parts (cat them back together before flashing).
  cat dist/superbacked-os-amd64-live-${version}.img | split \
    -b 2147483647B - dist/superbacked-os-amd64-live-${version}.img.part

  number=1
  for file in dist/superbacked-os-amd64-live-${version}.img.part*; do
    mv "${file}" "dist/superbacked-os-amd64-live-${version}.img.part${number}"
    number=$((number + 1))
  done

  # Compression disabled while evaluating whether xz still earns its
  # build time on the live image — the squashfs payload is already
  # compressed, so xz mostly removes partition slack and ESP zeros.
  # Uncomment to restore compressed, split release artifacts (and
  # remove the raw part splitting above):
  # printf "%s\n" "Compressing Superbacked OS…"
  #
  # xz -1 --threads 4 dist/superbacked-os-amd64-live-${version}.img
  #
  # cat dist/superbacked-os-amd64-live-${version}.img.xz | split \
  #   -b 2147483647B - dist/superbacked-os-amd64-live-${version}.img.xz.part
  #
  # number=1
  # for file in dist/superbacked-os-amd64-live-${version}.img.xz.part*; do
  #   mv "${file}" "dist/superbacked-os-amd64-live-${version}.img.xz.part${number}"
  #   number=$((number + 1))
  # done

  printf "%s\n" "Stopping Colima…"

  colima stop --profile superbacked
fi

if [ "${partial}" != true ]; then
  code dist/superbacked-${version}-release-notes.txt

  printf "%s" "Edit release notes, insert YubiKey and press enter to sign release… "

  read -r answer

  npm run sign-release
fi

printf "%s\n" "Done"