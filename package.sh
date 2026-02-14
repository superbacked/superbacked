#! /bin/bash
# Used to build and package Superbacked

set -e
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
  case "$1" in
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
      echo "Error: Unknown option: $1" >&2
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
  printf "%s\n" "Packaging Superbacked OS bootstrap assets (amd64)…"

  asset_folder="dist/superbacked-os-bootstrap-assets"

  rm -rf "${asset_folder}"

  mkdir -p "${asset_folder}/etc/apparmor.d"
  mkdir -p "${asset_folder}/home/superbacked/.config/autostart"
  mkdir -p "${asset_folder}/home/superbacked/.local/share/applications"
  mkdir -p "${asset_folder}/home/superbacked/.local/superbacked"
  mkdir -p "${asset_folder}/home/superbacked/Desktop"

  cp \
    superbacked-os-bootstrap-assets/superbacked.profile \
    "${asset_folder}/etc/apparmor.d/superbacked.profile"
  cp \
    superbacked-os-bootstrap-assets/superbacked-autostart.desktop \
    "${asset_folder}/home/superbacked/.config/autostart/superbacked-autostart.desktop"
  cp \
    superbacked-os-bootstrap-assets/superbacked-autostart.sh \
    "${asset_folder}/home/superbacked/.config/autostart/superbacked-autostart.sh"
  cp \
    superbacked-os-bootstrap-assets/superbacked.desktop \
    "${asset_folder}/home/superbacked/.local/share/applications/superbacked.desktop"
  cp \
    "dist/superbacked-x64-${version}.AppImage" \
    "${asset_folder}/home/superbacked/.local/superbacked/superbacked.AppImage"
  cp \
    dist/.icon-icns/icon.icns \
    "${asset_folder}/home/superbacked/.local/superbacked/superbacked.icns"
  cp \
    superbacked-os-bootstrap-assets/superbacked.desktop \
    "${asset_folder}/home/superbacked/Desktop/superbacked.desktop"

  chmod +x \
    "${asset_folder}/home/superbacked/.config/autostart/superbacked-autostart.desktop"
  chmod +x \
    "${asset_folder}/home/superbacked/.config/autostart/superbacked-autostart.sh"
  chmod +x \
    "${asset_folder}/home/superbacked/.local/share/applications/superbacked.desktop"
  chmod +x \
    "${asset_folder}/home/superbacked/.local/superbacked/superbacked.AppImage"
  chmod +x \
    "${asset_folder}/home/superbacked/Desktop/superbacked.desktop"

  tar --create \
    --directory "${asset_folder}" \
    --file "dist/superbacked-os-amd64-bootstrap-assets-${version}.tar.gz" \
    --gzip \
    .

  printf "%s\n" "Packaging Superbacked OS bootstrap assets (arm64-raspi)…"

  cp \
    "dist/superbacked-arm64-${version}.AppImage" \
    "${asset_folder}/home/superbacked/.local/superbacked/superbacked.AppImage"

  chmod +x \
    "${asset_folder}/home/superbacked/.local/superbacked/superbacked.AppImage"

  tar --create \
    --directory "${asset_folder}" \
    --file "dist/superbacked-os-arm64-raspi-bootstrap-assets-${version}.tar.gz" \
    --gzip \
    .

  rm -rf "${asset_folder}"

  printf "%s\n" "Preparing Superbacked OS bootstrap script (amd64)…"

  sed "s|__VERSION__|${version}|g" \
    superbacked-os-utilities/superbacked-os-amd64-bootstrap.sh \
    > "dist/superbacked-os-amd64-bootstrap-${version}.sh"

  printf "%s\n" "Preparing Superbacked OS bootstrap script (arm64-raspi)…"

  sed "s|__VERSION__|${version}|g" \
    superbacked-os-utilities/superbacked-os-arm64-raspi-bootstrap.sh \
    > "dist/superbacked-os-arm64-raspi-bootstrap-${version}.sh"
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

  printf "%s\n" "Building Superbacked OS (amd64)…"

  cp \
    superbacked-os/superbacked-os-amd64-24.04.3.img \
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

  printf "%s\n" "Compressing Superbacked OS (amd64)…"

  xz -1 --threads 4 dist/superbacked-os-amd64-${version}.img

  cat dist/superbacked-os-amd64-${version}.img.xz | split \
    -b 2147483647B - dist/superbacked-os-amd64-${version}.img.xz.part

  number=1
  for file in dist/superbacked-os-amd64-${version}.img.xz.part*; do
    mv "${file}" "dist/superbacked-os-amd64-${version}.img.xz.part${number}"
    number=$((number + 1))
  done

  printf "%s\n" "Building Superbacked OS (arm64-raspi)…"

  cp \
    superbacked-os/superbacked-os-arm64-raspi-24.04.3.img \
    dist/superbacked-os-arm64-raspi-${version}.img

  docker run \
    --interactive \
    --privileged \
    --rm \
    --tty \
    --volume $(pwd)/dist:/dist \
    superbacked-os-docker:24.04 \
    /root/provision-superbacked-os.sh \
    superbacked-os-arm64-raspi-${version}.img \
    superbacked-os-arm64-raspi-bootstrap-assets-${version}.tar.gz \
    > /dev/null

  printf "%s\n" "Compressing Superbacked OS (arm64-raspi)…"

  xz -1 --threads 4 dist/superbacked-os-arm64-raspi-${version}.img

  cat dist/superbacked-os-arm64-raspi-${version}.img.xz | split \
    -b 2147483647B - dist/superbacked-os-arm64-raspi-${version}.img.xz.part

  number=1
  for file in dist/superbacked-os-arm64-raspi-${version}.img.xz.part*; do
    mv "${file}" "dist/superbacked-os-arm64-raspi-${version}.img.xz.part${number}"
    number=$((number + 1))
  done

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