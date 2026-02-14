#! /bin/bash
# Used to provision Ubuntu Desktop for Raspberry Pi image

set -e

image="$1"

function detach()
{
  losetup --detach-all
}

trap detach ERR INT

printf "%s\n" "Creating block device node…"

mknod /dev/loop0p1 b 259 1
mknod /dev/loop0p2 b 259 2

printf "%s\n" "Attaching disk image to loop device…"

losetup --find --partscan "/images/${image}"

printf "%s\n" "Determining partition boundaries…"

start=$(parted -m /dev/loop0 unit MiB print | awk -F: '$1==2 {gsub("MiB","",$2); print $2}')

end=$(echo "${start} + 10240" | bc)

printf "%s\n" "Extending disk image…"

truncate --size ${end}MiB "/images/${image}"

losetup --set-capacity /dev/loop0

printf "%s\n" "Resizing partition…"

parted /dev/loop0 resizepart 2 100%

partprobe /dev/loop0

printf "%s\n" "Checking filesystem for inconsistencies…"

e2fsck -fy /dev/loop0p2

printf "%s\n" "Growing filesystem…"

resize2fs /dev/loop0p2

printf "%s\n" "Mounting boot partition…"

mkdir --parents /mnt/boot

mount /dev/loop0p1 /mnt/boot

printf "%s\n" "Copying bootstrap files to boot partition…"

cp /superbacked-os-utilities/superbacked-os-arm64-raspi-bootstrap.sh /mnt/boot/superbacked-os-arm64-raspi-bootstrap.sh
cp /superbacked-os-utilities/superbacked-os-bootstrap.service /mnt/boot/superbacked-os-bootstrap.service
cp /ubuntu-desktop-utilities/user-data /mnt/boot/user-data

printf "%s\n" "Unmounting boot partition…"

umount /dev/loop0p1

printf "%s\n" "Mounting root partition…"

mkdir --parents /mnt/root

mount /dev/loop0p2 /mnt/root

printf "%s\n" "Disabling root filesystem expansion…"

touch /mnt/root/etc/growroot-disabled

printf "%s\n" "Unmounting root partition…"

umount /dev/loop0p2

printf "%s\n" "Detaching loop device…"

losetup --detach /dev/loop0