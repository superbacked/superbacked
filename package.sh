#! /bin/bash
# Used to build and package Superbacked

set -o errexit
set -o pipefail

bold=$(tput bold)
normal=$(tput sgr0)

# Parse command-line options
build_app=""
package_bootstrap_assets=""
build_os=""
partial=false

function show_help() {
  cat << EOF
Usage: package.sh [options]

Options:
  --app               Build app only
  --bootstrap-assets  Package Superbacked OS bootstrap assets only
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
    --bootstrap-assets)
      package_bootstrap_assets=true
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
      package_bootstrap_assets=true
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

# Prompt to package bootstrap assets if not specified
if [ "${partial}" != true ] && [ -z "${package_bootstrap_assets}" ]; then
  printf "${bold}%s${normal}" "Do you wish to package Superbacked OS bootstrap assets (y or n)? "
  read -r answer
  if [ "${answer}" = "y" ]; then
    package_bootstrap_assets=true
  fi
fi

if [ "${package_bootstrap_assets}" = true ]; then
  printf "%s\n" "Packaging Superbacked OS bootstrap assets…"

  asset_folder="dist/superbacked-os-bootstrap-assets"

  rm -rf "${asset_folder}"

  mkdir -p "${asset_folder}/etc/apparmor.d"
  mkdir -p "${asset_folder}/home/superbacked/.local/share/applications"
  mkdir -p "${asset_folder}/home/superbacked/.local/superbacked"

  cp \
    superbacked-os-bootstrap-assets/superbacked.profile \
    "${asset_folder}/etc/apparmor.d/superbacked.profile"
  cp \
    superbacked-os-bootstrap-assets/superbacked.desktop \
    "${asset_folder}/home/superbacked/.local/share/applications/superbacked.desktop"
  cp \
    "dist/superbacked-x64-${version}.AppImage" \
    "${asset_folder}/home/superbacked/.local/superbacked/superbacked.AppImage"
  cp \
    dist/.icon-icns/icon.icns \
    "${asset_folder}/home/superbacked/.local/superbacked/superbacked.icns"

  chmod +x \
    "${asset_folder}/home/superbacked/.local/share/applications/superbacked.desktop"
  chmod +x \
    "${asset_folder}/home/superbacked/.local/superbacked/superbacked.AppImage"

  tar --create \
    --directory "${asset_folder}" \
    --file "dist/superbacked-os-amd64-bootstrap-assets-${version}.tar.gz" \
    --gzip \
    .

  rm -rf "${asset_folder}"

  printf "%s\n" "Preparing Superbacked OS bootstrap script…"

  sed "s|__VERSION__|${version}|g" \
    superbacked-os-utilities/superbacked-os-amd64-bootstrap.sh \
    > "dist/superbacked-os-amd64-bootstrap-${version}.sh"
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

  printf "%s\n" "Building Superbacked OS…"

  cp \
    superbacked-os/superbacked-os-amd64-24.04.4.img \
    dist/superbacked-os-amd64-${version}.img

  docker run \
    --interactive \
    --privileged \
    --rm \
    --tty \
    --volume $(pwd)/dist:/dist \
    superbacked-os-docker:24.04 \
    /root/provision-superbacked-os.sh \
    superbacked-os-amd64-${version}.img \
    superbacked-os-amd64-bootstrap-assets-${version}.tar.gz \
    > /dev/null

  printf "%s\n" "Creating live Superbacked OS image…"

  # The live image is written straight to its distribution name
  # (<product>-<arch>-<component>-<version>).
  docker run \
    --interactive \
    --privileged \
    --rm \
    --tty \
    --volume $(pwd)/dist:/dist \
    superbacked-os-docker:24.04 \
    /root/create-live-image.sh \
    /dist/superbacked-os-amd64-${version}.img \
    /dist/superbacked-os-amd64-live-${version}.img

  # The installed-style intermediate is kept while the live format is
  # validated — remove it before signing, or it ends up in the release
  # manifest. Uncomment once the live format graduates:
  # rm dist/superbacked-os-amd64-${version}.img

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
  # remove the raw chunking above):
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