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

losetup --find --partscan /dist/$1

printf "%s\n" "Checking filesystem for inconsistencies…"

fsck /dev/loop0p1
fsck /dev/loop0p2

printf "%s\n" "Mounting root partition…"

mkdir -p /mnt/root

mount /dev/loop0p2 /mnt/root

printf "%s\n" "Provisioning Superbacked OS…"

mkdir -p /mnt/root/home/superbacked/.local/superbacked

cp /dist/$2 /mnt/root/home/superbacked/.local/superbacked/superbacked.AppImage
chmod +x /mnt/root/home/superbacked/.local/superbacked/superbacked.AppImage

cp /dist/.icon-icns/icon.icns /mnt/root/home/superbacked/.local/superbacked/superbacked.icns

cp /superbacked-os-assets/superbacked.desktop /mnt/root/home/superbacked/.local/share/applications/superbacked.desktop
chmod +x /mnt/root/home/superbacked/.local/share/applications/superbacked.desktop

chown 1000:1000 /mnt/root/home/superbacked/.local/share/applications/superbacked.desktop

cp /superbacked-os-assets/superbacked.desktop /mnt/root/home/superbacked/Desktop/superbacked.desktop
chmod +x /mnt/root/home/superbacked/Desktop/superbacked.desktop

chown 1000:1000 /mnt/root/home/superbacked/Desktop/superbacked.desktop

mkdir -p /mnt/root/home/superbacked/.config/autostart

cp /superbacked-os-assets/superbacked-autostart.desktop /mnt/root/home/superbacked/.config/autostart/superbacked-autostart.desktop
chmod +x /mnt/root/home/superbacked/.config/autostart/superbacked-autostart.desktop

chown 1000:1000 /mnt/root/home/superbacked/.config/autostart/superbacked-autostart.desktop

cp /superbacked-os-assets/superbacked-autostart.sh /mnt/root/home/superbacked/.config/autostart/superbacked-autostart.sh
chmod +x /mnt/root/home/superbacked/.config/autostart/superbacked-autostart.sh

chown 1000:1000 /mnt/root/home/superbacked/.config/autostart/superbacked-autostart.sh

cp /superbacked-os-assets/superbacked.profile /mnt/root/etc/apparmor.d/superbacked.profile

printf "%s\n" "Unmounting root partition…"

umount /dev/loop0p2

printf "%s\n" "Optimizing root partition…"

zerofree /dev/loop0p2

printf "%s\n" "Calculating SHA256 checksums…"

printf "Boot partition: " > /dist/$1.sha256sums
sha256sum /dev/loop0p1 | cut -d ' ' -f1 >> /dist/$1.sha256sums

printf "Root partition: " >> /dist/$1.sha256sums
sha256sum /dev/loop0p2 | cut -d ' ' -f1 >> /dist/$1.sha256sums

printf "%s\n" "Detaching loop device…"

losetup --detach /dev/loop0