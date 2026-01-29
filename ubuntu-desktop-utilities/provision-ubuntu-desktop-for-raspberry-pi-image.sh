#! /bin/bash
# Used to provision Ubuntu Desktop for Raspberry Pi image

set -e

if [ -z "$1" ] || [ "$1" = "--help" ]; then
  printf "%s\n" "Usage: provision-ubuntu-desktop-for-raspberry-pi-image.sh /path/to/ubuntu-24.04.3-preinstalled-desktop-arm64+raspi.img.xz"
  exit 0
fi

release="$1"
image=$(basename "${release}" .xz)
image_dir=$(dirname "${release}")

printf "%s\n" "Expanding ${image}.xz…"

xz --decompress --force --keep "${release}"

printf "%s\n" "Starting Colima…"

colima start \
  --profile superbacked \
  --cpu 2 \
  --disk 20 \
  --memory 4

printf "%s\n" "Provisining ${image}…"

docker run \
  --interactive \
  --privileged \
  --rm \
  --tty \
  --volume ${image_dir}:/images \
  --volume $(pwd)/superbacked-os-utilities:/superbacked-os-utilities \
  --volume $(pwd)/ubuntu-desktop-utilities:/ubuntu-desktop-utilities \
  superbacked-os-docker:24.04 \
  /root/provision-ubuntu-desktop-for-raspberry-pi-image.sh ${image}

printf "%s\n" "Stopping Colima…"

colima stop --profile superbacked

printf "%s\n" "Done"