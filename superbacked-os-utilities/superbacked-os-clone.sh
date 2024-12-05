#! /bin/bash
# Used to clone Superbacked OS to disk

set -e
set -o pipefail

bold=$(tput bold)
normal=$(tput sgr0)
red=$(tput setaf 1)

if [ "$1" = "--help" ]; then
  printf "%s\n" "Usage: superbacked-os-clone.sh"
  exit 0
fi

name=$1

sudo fdisk --list

printf "$bold%s$normal" "What disk do you wish to clone (example: sda)? "
read -r source_disk

printf "$bold%s$normal" "What disk do you wish to overwrite (example: sdb)? "
read -r destination_disk

block_size=$(sudo fdisk --list /dev/$source_disk | grep Units | awk '{print $(NF-1)}')

end=$(sudo fdisk --list /dev/$source_disk | grep ${source_disk}2 | awk '{print $3}')

count=$(echo "(($end * $block_size) / 1048576) + 1" | bc)

printf "%s\n" "${count}MiB will be copied"

printf "$bold$red%s$normal\n" "ALL DATA ON $(echo $destination_disk | awk '{ print toupper($0) }') WILL BE PERMANENTLY DESTROYED."

printf "$bold%s$normal" "Do you wish to proceed (y or n)? "
read -r answer

if [ "$answer" = "y" ]; then
  printf "%s\n" "Cloning $source_disk to $destination_disk…"
  sudo dd bs=1M count=$count if=/dev/$source_disk  of=/dev/$destination_disk
fi

printf "%s\n" "Done"
