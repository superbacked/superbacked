#! /bin/bash
# Used to provision Ubuntu Desktop ISO

set -e

if [ -z "$1" ] || [ "$1" = "--help" ]; then
  printf "%s\n" "Usage: provision-ubuntu-desktop-image.sh /path/to/ubuntu-24.04.3-desktop-amd64.iso"
  exit 0
fi

release="$1"
iso=$(basename "${release}")
iso_dir=$(dirname "${release}")

printf "%s\n" "Starting Colima…"

colima start \
  --profile superbacked \
  --cpu 2 \
  --disk 20 \
  --memory 4

printf "%s\n" "Provisining ${iso}…"

docker run \
  --interactive \
  --privileged \
  --rm \
  --tty \
  --volume ${iso_dir}:/isos \
  --volume $(pwd)/superbacked-os-utilities:/superbacked-os-utilities \
  --volume $(pwd)/ubuntu-desktop-utilities:/ubuntu-desktop-utilities \
  superbacked-os-docker:24.04 \
  /root/provision-ubuntu-desktop-iso.sh ${iso}

printf "%s\n" "Stopping Colima…"

colima stop --profile superbacked

printf "%s\n" "Done"