#! /bin/bash
# Used to build and package Superbacked

set -o errexit
set -o pipefail

function show_help() {
  cat << EOF
Usage: package.sh [command] [options]

Commands:
  app                           Build app only
  os                            Build Superbacked OS only

Options (os only):
  --no-cache                    Build without the persistent build cache
  --clear-cache <apt|base|all>  Clear apt archives, the debug base layer or both before building

Without a command, package.sh builds app and Superbacked OS, then signs
release — the production run.
EOF
  exit 0
}

if [ "${1:-}" = "--help" ]; then
  show_help
fi

# Parse command-line arguments
command=""
clear_cache=""
no_cache=false

case "${1:-}" in
  app|os)
    command="${1}"
    shift
    ;;
  ""|--*) ;;
  *)
    echo "Error: Unknown command: ${1}" >&2
    exit 1
    ;;
esac

while [[ $# -gt 0 ]]; do
  # Only os takes options — app and the production run reject them all
  if [ "${command}" != "os" ]; then
    echo "Error: Unknown option: ${1}" >&2
    exit 1
  fi
  case "${1}" in
    --clear-cache)
      clear_cache="${2:-}"
      case "${clear_cache}" in
        apt|base|all) ;;
        *)
          printf "%s\n" "Error: --clear-cache expects apt, base or all (got “${clear_cache}”)" >&2
          exit 1
          ;;
      esac
      shift 2
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

build_app=false
build_os=false
sign_release=false

case "${command}" in
  app)
    build_app=true
    ;;
  os)
    build_os=true
    ;;
  "")
    # The production run signs whatever it builds, so refuse the
    # development switches rather than sign a debug image or an
    # unnotarized app — use app or os commands for those.
    if [ -n "${BUILD_VARIANT:-}" ]; then
      echo "Error: BUILD_VARIANT is only valid with app or os commands" >&2
      exit 1
    fi
    if [ -n "${SKIP_NOTARIZATION:-}" ]; then
      echo "Error: SKIP_NOTARIZATION is only valid with app or os commands" >&2
      exit 1
    fi
    build_app=true
    build_os=true
    sign_release=true
    ;;
esac

version=$(node --eval 'console.log(require("./package.json").version)')

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

  printf "%s\n" "Building Superbacked OS Docker image…"

  # The container runs the baked copies of the scripts under docker/,
  # not the repository files — rebuild every time so the baked copies
  # can never go stale (a cache hit when nothing changed). The cache
  # clear reuses it as its throwaway container.
  docker build \
    --tag superbacked-os-docker:24.04 \
    docker/

  # The cache volume lives on the Colima VM disk, out of the host’s
  # reach, so its subtrees are removed from inside a throwaway build
  # container; all drops the volume itself. The build script recreates
  # whatever is missing.
  if [ -n "${clear_cache}" ]; then
    printf "%s\n" "Clearing build cache (${clear_cache})…"

    if [ "${clear_cache}" = all ]; then
      docker volume rm --force superbacked-build-cache > /dev/null
    else
      docker run \
        --rm \
        --volume superbacked-build-cache:/cache \
        superbacked-os-docker:24.04 \
        rm --force --recursive "/cache/${clear_cache}"
    fi
  fi

  printf "%s\n" "Creating live Superbacked OS image…"

  # Provisioning and live conversion happen in one pass: the bootstrap
  # runs in a chroot of the vanilla source image (read-only input,
  # network required for the snapshot-pinned packages) and the live
  # image is written straight to its distribution name
  # (<product>-<arch>-<component>-<version>).
  # BUILD_VARIANT=debug (exported on the host) builds the debug variant
  # — app profiles log denials (complain) instead of enforcing,
  # superbacked keeps sudo for on-device profile iteration, the
  # squashfs uses fast zstd compression and the base bootstrap’s result
  # is reused from the cache — the container does not inherit host
  # environment, so it is forwarded explicitly here, then into the
  # chroot by the build script.
  #
  # apt archives and indexes persist in a named volume on the Colima VM
  # disk (surviving colima stop), so interrupted or repeated builds only
  # download missing packages — see the /cache mounts in
  # docker/create-superbacked-os-live-image.sh. Integrity is unaffected:
  # apt verifies cached files against the pinned snapshot hashes. The
  # same volume holds the debug base layer (see “base layer” there),
  # keyed by the base bootstrap’s text, so a debug rebuild after an
  # app or hardening change skips the package installs entirely.
  cache_volume=(--volume superbacked-build-cache:/cache)
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

if [ "${sign_release}" = true ]; then
  code dist/superbacked-${version}-release-notes.txt

  printf "%s" "Edit release notes, insert YubiKey and press enter to sign release… "

  read -r answer

  npm run sign-release
fi

printf "%s\n" "Done"