#! /bin/bash
# Used to create optimized Superbacked OS images using Ubuntu for desktops

set -e
set -o pipefail

bold=$(tput bold)
normal=$(tput sgr0)

if [ -z "$1" ] || [ "$1" = "--help" ]; then
  printf "%s\n" "Usage: superbacked-os-image.sh name"
  exit 0
fi

name=$1

if ! which zerofree > /dev/null 2>&1; then
  printf "%s\n" "Installing zerofree…"
  
  sudo apt update
  sudo apt install --yes zerofree
fi

sudo fdisk --list

printf "$bold%s$normal" "What disk do you wish to create image from (example: sda)? "
read -r disk

printf "%s\n" "Unmounting partitions…"

if findmnt /dev/${disk}1; then
  sudo umount /dev/${disk}1
fi

if findmnt /dev/${disk}2; then
  sudo umount /dev/${disk}2
fi

printf "%s\n" "Checking filesystem integrity…"

sudo fsck /dev/${disk}1
sudo fsck /dev/${disk}2

printf "%s\n" "Optimizing ext4 partition…"
sudo zerofree /dev/${disk}2

block_size=$(sudo fdisk --list /dev/$disk | grep Units | awk '{print $(NF-1)}')

end=$(sudo fdisk --list /dev/$disk | grep ${disk}2 | awk '{print $3}')

count=$(echo "(($end * $block_size) / 1048576) + 1" | bc)

printf "%s\n" "${count}MiB will be copied"

printf "$bold%s$normal" "Do you wish to proceed (y or n)? "
read -r answer

if [ "$answer" = "y" ]; then
  printf "%s\n" "Creating image…"
  sudo dd bs=1M count=$count if=/dev/$disk  of=$(dirname "$0")/$name.img
fi

printf "%s\n" "Done"
