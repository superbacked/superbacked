#! /bin/bash
# Used to package Superbacked

set -e
set -o pipefail

printf "$bold%s$normal" "Do you wish to build app (y or n)? "
read -r answer

if [ "$answer" = "y" ]; then
  printf "%s\n" "Purging dist and out folders…"

  find ./{dist,out} ! -name .borgignore -delete

  printf "%s\n" "Building Superbacked app…"

  npm run build

  for file in dist/*.AppImage; do
    mv "$file" "$(echo "$file" | sed 's/x86_64/x64/')"
  done
fi

printf "$bold%s$normal" "Do you wish to build Superbacked OS (y or n)? "
read -r answer

if [ "$answer" = "y" ]; then
  printf "%s\n" "Purging Superbacked OS images…"

  find ./dist -type f \( -name "*.img" -o -name "*.img.xz.part*" \) -delete

  printf "%s\n" "Check if Docker is running…"

  docker ps

  version=$(node --eval 'console.log(require("./package.json").version)')

  printf "%s\n" "Building Superbacked OS (amd64)…"

  cp \
    superbacked-os/superbacked-os-amd64-24.04.1.img \
    dist/superbacked-os-amd64-${version}.img

  docker run \
    --interactive \
    --privileged \
    --rm \
    --tty \
    --volume $(pwd)/dist:/dist \
    --volume $(pwd)/superbacked-os-assets:/superbacked-os-assets \
    --volume $(pwd)/superbacked-os-utilities:/superbacked-os-utilities \
    superbacked-os-packager:24.04 \
    /root/provision-amd64.sh \
    superbacked-x64-${version}.AppImage \
    superbacked-os-amd64-${version}.img

  printf "%s\n" "Compressing Superbacked OS (amd64)…"

  xz -1 --stdout --threads 4 dist/superbacked-os-amd64-${version}.img | split \
    -b 2147483647B - dist/superbacked-os-amd64-${version}.img.xz.part

  number=1
  for file in dist/superbacked-os-amd64-${version}.img.xz.part*; do
    mv "$file" "dist/superbacked-os-amd64-${version}.img.xz.part$number"
    number=$((number + 1))
  done

  rm dist/superbacked-os-amd64-${version}.img

  printf "%s\n" "Building Superbacked OS (arm64-raspi)…"

  cp \
    superbacked-os/superbacked-os-arm64-raspi-24.04.1.img \
    dist/superbacked-os-arm64-raspi-${version}.img

  docker run \
    --interactive \
    --privileged \
    --rm \
    --tty \
    --volume $(pwd)/dist:/dist \
    --volume $(pwd)/superbacked-os-assets:/superbacked-os-assets \
    --volume $(pwd)/superbacked-os-utilities:/superbacked-os-utilities \
    superbacked-os-packager:24.04 \
    /root/provision-arm64-raspi.sh \
    superbacked-arm64-${version}.AppImage \
    superbacked-os-arm64-raspi-${version}.img

  printf "%s\n" "Compressing Superbacked OS (arm64-raspi)…"

  xz -1 --stdout --threads 4 dist/superbacked-os-arm64-raspi-${version}.img | split \
    -b 2147483647B - dist/superbacked-os-arm64-raspi-${version}.img.xz.part

  number=1
  for file in dist/superbacked-os-arm64-raspi-${version}.img.xz.part*; do
    mv "$file" "dist/superbacked-os-arm64-raspi-${version}.img.xz.part$number"
    number=$((number + 1))
  done

  rm dist/superbacked-os-arm64-raspi-${version}.img
fi

code dist/superbacked-${version}-release-notes.txt

printf "%s" "Edit release notes, insert YubiKey and press enter to sign release… "

read -r answer

npm run sign-release

printf "%s\n" "Done"