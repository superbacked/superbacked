#! /bin/bash
# Used to update Superbacked OS

set -e

function detach()
{
  losetup --detach-all
}

trap detach ERR INT

mknod /dev/loop0p2 b 259 1

losetup --find --partscan /dist/$2

mkdir -p /mnt/root

mount /dev/loop0p2 /mnt/root

mkdir -p /mnt/root/home/superbacked/.local/superbacked

cp /dist/$1 /mnt/root/home/superbacked/.local/superbacked/superbacked.AppImage
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

cp /superbacked-os-utilities/sedutil-cli /mnt/root/usr/local/sbin/sedutil-cli
chmod +x /mnt/root/usr/local/sbin/sedutil-cli

cp /superbacked-os-utilities/superbacked-os-clone.sh /mnt/root/usr/local/sbin/superbacked-os-clone.sh
chmod +x /mnt/root/usr/local/sbin/superbacked-os-clone.sh

cp /superbacked-os-utilities/superbacked-os-configure-opal.sh /mnt/root/usr/local/sbin/superbacked-os-configure-opal.sh
chmod +x /mnt/root/usr/local/sbin/superbacked-os-configure-opal.sh

umount /dev/loop0p2

zerofree /dev/loop0p2

losetup --detach /dev/loop0