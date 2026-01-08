#! /bin/bash
# Used to package Superbacked

set -e
set -o pipefail

bold=$(tput bold)
normal=$(tput sgr0)

# Parse command-line options
build_app=""
build_os=""
yes=false

function show_help() {
  cat << EOF
Usage: package.sh [options]

Options:
  --app       Build app only
  --os        Build Superbacked OS only
  --yes       Skip all confirmation prompts and build both
  -h, --help  Show this help message

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
      shift
      ;;
    --os)
      build_os=true
      shift
      ;;
    --yes)
      yes=true
      build_app=true
      build_os=true
      shift
      ;;
    *)
      echo "Error: Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Prompt for app build if not specified
if [ "$yes" != true ] && [ -z "$build_app" ]; then
  printf "$bold%s$normal" "Do you wish to build app (y or n)? "
  read -r answer
  if [ "$answer" = "y" ]; then
    build_app=true
  fi
fi

if [ "$build_app" = true ]; then
  printf "%s\n" "Purging dist and out folders…"

  find ./{dist,out} ! -name .borgignore -delete

  printf "%s\n" "Building Superbacked app…"

  npm run lint

  npm run prebuild

  npm run build

  for file in dist/*.AppImage; do
    mv "$file" "$(echo "$file" | sed 's/x86_64/x64/')"
  done
fi

# Prompt for Superbacked OS build if not specified
if [ "$yes" != true ] && [ -z "$build_os" ]; then
  printf "$bold%s$normal" "Do you wish to build Superbacked OS (y or n)? "
  read -r answer
  if [ "$answer" = "y" ]; then
    build_os=true
  fi
fi

if [ "$build_os" = true ]; then
  printf "%s\n" "Purging Superbacked OS images…"

  find ./dist -type f \( -name "*.img*" \) -delete

  printf "%s\n" "Starting Colima…"

  colima start \
    --profile superbacked \
    --cpu 4 \
    --disk 100 \
    --memory 8

  version=$(node --eval 'console.log(require("./package.json").version)')

  printf "%s\n" "Building Superbacked OS…"

  cp \
    superbacked-os/superbacked-os-amd64-24.04.3.img \
    dist/superbacked-os-amd64-${version}.img

  docker run \
    --interactive \
    --privileged \
    --rm \
    --tty \
    --volume $(pwd)/dist:/dist \
    --volume $(pwd)/superbacked-os-assets:/superbacked-os-assets \
    superbacked-os-docker:24.04 \
    /root/provision-superbacked-os.sh \
    superbacked-os-amd64-${version}.img \
    superbacked-x64-${version}.AppImage \
    > /dev/null

  printf "%s\n" "Compressing Superbacked OS…"

  xz -1 --threads 4 dist/superbacked-os-amd64-${version}.img

  cat dist/superbacked-os-amd64-${version}.img.xz | split \
    -b 2147483647B - dist/superbacked-os-amd64-${version}.img.xz.part

  number=1
  for file in dist/superbacked-os-amd64-${version}.img.xz.part*; do
    mv "$file" "dist/superbacked-os-amd64-${version}.img.xz.part$number"
    number=$((number + 1))
  done

  printf "%s\n" "Stopping Colima…"

  colima stop --profile superbacked
fi

code dist/superbacked-${version}-release-notes.txt

printf "%s" "Edit release notes, insert YubiKey and press enter to sign release… "

read -r answer

npm run sign-release

printf "%s\n" "Done"