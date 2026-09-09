#! /bin/bash
# Used to build and package Superbacked

set -o errexit
set -o pipefail

bold=$(tput bold)
normal=$(tput sgr0)

# Parse command-line options
build_app=""
build_os=""
clear_cache=false
no_cache=false
partial=false

function show_help() {
  cat << EOF
Usage: package.sh [options]

Options:
  --app          Build app only
  --os           Build Superbacked OS only
  --all          Build and package everything without prompts
  --no-cache     Build Superbacked OS without the persistent apt cache
  --clear-cache  Clear the persistent apt cache before building Superbacked OS
  -h, --help     Show this help message

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
    --clear-cache)
      clear_cache=true
      shift
      ;;
    --no-cache)
      no_cache=true
      shift
      ;;
    *)
      echo "Error: Unknown option: ${1}" >&2
      exit 1
      ;;
  esac
done

# Fail loudly on a misspelled build variant rather than silently
# building a release image.
if [ -n "${BUILD_VARIANT:-}" ] && [ "${BUILD_VARIANT}" != "debug" ]; then
  printf "%s\n" "Error: unknown BUILD_VARIANT “${BUILD_VARIANT}” (expected debug)" >&2
  exit 1
fi

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

  npm test

  npm run build

  for file in dist/*.AppImage; do
    mv "${file}" "$(echo "${file}" | sed 's/x86_64/x64/')"
  done

  # deb names its x64 artifact amd64 (the arm64 name already matches)
  for file in dist/*.deb; do
    renamed="$(echo "${file}" | sed 's/amd64/x64/')"
    if [ "${file}" != "${renamed}" ]; then
      mv "${file}" "${renamed}"
    fi
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

# --clear-cache rides the OS build’s Colima lifecycle rather than
# spinning the VM up on its own — declining the build above would
# silently skip the requested clear, so fail loudly instead
if [ "${clear_cache}" = true ] && [ "${build_os}" != true ]; then
  echo "Error: --clear-cache requires building Superbacked OS" >&2
  exit 1
fi

if [ "${build_os}" = true ]; then
  printf "%s\n" "Purging Superbacked OS images…"

  find ./dist -type f \( -name "*.img*" \) -delete

  printf "%s\n" "Starting Colima…"

  # Memory is load-bearing: the build stacks a tmpfs overlay (apt
  # upgrade, Firefox — every byte the overlay holds is RAM)
  # on top of mksquashfs’ zstd-19 working set — 4 GB OOMs, and 8 GB is
  # a thin margin: pressure shows up as Rosetta-translated subprocesses
  # sporadically dying with empty output and nothing in dmesg — Rosetta
  # allocation failures are silent there; retry, or bump memory if it
  # becomes frequent. (Colima only applies a changed memory value on a
  # fresh start: colima stop --profile superbacked first when changing
  # it.)
  #
  # Colima profiles are not independent: every profile rides one shared
  # user-v2 usernet daemon, so starting or stopping another profile can
  # kill a running build’s network mid-bootstrap (lima-vm/lima#3020
  # class) — avoid profile churn while a build is running.
  #
  # The active docker context is just as shared: starting any profile
  # repoints it, and colima start on an already-running profile does
  # not point it back, which would land the build in another profile’s
  # VM (wrong CPU and memory, foreign volumes). Every docker invocation
  # below therefore pins the superbacked profile’s socket instead of
  # trusting the context (colima itself ignores DOCKER_HOST).
  export DOCKER_HOST="unix://${HOME}/.colima/superbacked/docker.sock"

  colima start \
    --cpu 4 \
    --disk 20 \
    --memory 8 \
    --profile superbacked \
    --vm-type vz \
    --vz-rosetta

  if [ "${clear_cache}" = true ]; then
    printf "%s\n" "Clearing apt cache…"

    docker volume rm --force superbacked-apt-cache > /dev/null
  fi

  printf "%s\n" "Building Superbacked OS Docker image…"

  # The container runs the baked copies of the scripts under docker/,
  # not the repository files — rebuild every time so the baked copies
  # can never go stale (a cache hit when nothing changed).
  docker build \
    --tag superbacked-os-docker:24.04 \
    docker/

  printf "%s\n" "Creating live Superbacked OS image…"

  # Provisioning and live conversion happen in one pass: the bootstrap
  # runs in a chroot of the vanilla source image (read-only input,
  # network required for the snapshot-pinned packages) and the live
  # image is written straight to its distribution name
  # (<product>-<arch>-<component>-<version>).
  # BUILD_VARIANT=debug (exported on the host) builds the debug variant
  # — app profiles log denials (complain) instead of enforcing and
  # superbacked keeps sudo for on-device profile iteration — the
  # container does not inherit host environment, so it is forwarded
  # explicitly here, then into the chroot by the build script.
  #
  # apt archives and indexes persist in a named volume on the Colima VM
  # disk (surviving colima stop), so interrupted or repeated builds only
  # download missing packages — see the /cache mounts in
  # docker/create-superbacked-os-live-image.sh. Integrity is unaffected:
  # apt verifies cached files against the pinned snapshot hashes.
  cache_volume=(--volume superbacked-apt-cache:/cache)
  if [ "${no_cache}" = true ]; then
    cache_volume=()
  fi
  docker run \
    --env BUILD_VARIANT="${BUILD_VARIANT:-}" \
    --interactive \
    --privileged \
    --rm \
    --tty \
    "${cache_volume[@]}" \
    --volume $(pwd)/dist:/dist \
    --volume $(pwd)/superbacked-os:/superbacked-os:ro \
    --volume $(pwd)/superbacked-os-bootstrap-assets:/superbacked-os-bootstrap-assets:ro \
    --volume $(pwd)/superbacked-os-utilities:/superbacked-os-utilities:ro \
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