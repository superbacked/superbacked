#! /bin/bash
# Used to disable Raspberry Pi filesystem expansion

set -e

function detach()
{
  losetup --detach-all
}

trap detach ERR INT

mknod /dev/loop0p2 b 259 2

losetup --find --partscan /patch/ubuntu-24.04.3-preinstalled-desktop-arm64+raspi.img

mkdir -p /mnt/root

mount /dev/loop0p2 /mnt/root

touch /mnt/root/etc/growroot-disabled

umount /dev/loop0p2

losetup --detach /dev/loop0