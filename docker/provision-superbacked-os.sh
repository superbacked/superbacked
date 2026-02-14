#! /bin/bash
# Used to provision Superbacked OS

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

losetup --find --partscan /dist/${1}

printf "%s\n" "Checking filesystem for inconsistencies…"

fsck /dev/loop0p1
fsck /dev/loop0p2

printf "%s\n" "Mounting root partition…"

mkdir -p /mnt/root

mount /dev/loop0p2 /mnt/root

printf "%s\n" "Provisioning Superbacked OS…"

tar \
  --directory "/mnt/root" \
  --extract \
  --file "/dist/${2}" \
  --gzip

chown --recursive 1000:1000 /mnt/root/home/superbacked

printf "%s\n" "Unmounting root partition…"

umount /dev/loop0p2

printf "%s\n" "Optimizing root partition…"

zerofree /dev/loop0p2

printf "%s\n" "Calculating SHA256 checksums…"

printf "Boot partition: " > /dist/${1}.sha256sums
sha256sum /dev/loop0p1 | cut -d ' ' -f1 >> /dist/${1}.sha256sums

printf "Root partition: " >> /dist/${1}.sha256sums
sha256sum /dev/loop0p2 | cut -d ' ' -f1 >> /dist/${1}.sha256sums

printf "%s\n" "Detaching loop device…"

losetup --detach /dev/loop0