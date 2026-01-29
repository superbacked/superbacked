#! /bin/sh
# Used to create Superbacked OS images using macOS

set -e
set -o pipefail

bold=$(tput bold)
normal=$(tput sgr0)

if [ -z "$1" ] || [ "$1" = "--help" ]; then
  printf "%s\n" "Usage: superbacked-os-image.sh name"
  exit 0
fi

directory=$(pwd)

name=$1

diskutil list

printf "${bold}%s${normal}" "What disk do you wish to create image from (example: disk4)? "
read -r disk

printf "${bold}%s${normal}" "What is the last volume to include in image (example: disk4s2)? "
read -r volume

sudo diskutil unmountDisk /dev/${disk}

offset=$(diskutil info /dev/${volume} | grep "Partition Offset" | awk '{print $3}')
size=$(diskutil info /dev/${volume} | grep "Disk Size" | awk '{print $5}' | sed 's/(//')

count=$(echo "((${offset} + ${size}) / 1048576) + 1" | bc)

printf "%s\n" "${count}MiB will be copied"

printf "${bold}%s${normal}" "Do you wish to proceed (y or n)? "
read -r answer
if [ "${answer}" = "y" ]; then
  printf "%s\n" "Creating image…"
  sudo dd bs=1m count=${count} if=/dev/r${disk} of=${directory}/superbacked-os/${name}.img
  sudo chown ${USER}:staff ${directory}/superbacked-os/${name}.img
else
  exit 0
fi

printf "%s\n" "Starting Colima…"

colima start \
  --profile superbacked \
  --cpu 2 \
  --disk 20 \
  --memory 4

printf "%s\n" "Optimizing image…"

docker run \
  --interactive \
  --privileged \
  --rm \
  --tty \
  --volume ${directory}/superbacked-os:/superbacked-os \
  superbacked-os-docker:24.04 \
  /root/optimize-image.sh \
  ${name}.img

printf "%s\n" "Done"