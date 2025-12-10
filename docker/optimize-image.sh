#! /bin/bash
# Used to optimize image

set -e

function detach()
{
  losetup --detach-all
}

trap detach ERR INT

printf "%s\n" "Creating block device nodes…"

mknod /dev/loop0p1 b 259 1
mknod /dev/loop0p2 b 259 2

printf "%s\n" "Attaching disk image to loop device…"

losetup --find --partscan /superbacked-os/$1

printf "%s\n" "Checking filesystem for inconsistencies…"

fsck /dev/loop0p1
fsck /dev/loop0p2

printf "%s\n" "Mounting root partition…"

mkdir -p /mnt/root

mount /dev/loop0p2 /mnt/root

printf "%s\n" "Purging logs…"

find /var/log -type f -delete

printf "%s\n" "Unmounting root partition…"

umount /dev/loop0p2

printf "%s\n" "Optimizing root partition…"

zerofree /dev/loop0p2

printf "%s\n" "Detaching loop device…"

losetup --detach /dev/loop0