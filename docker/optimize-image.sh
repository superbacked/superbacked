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

losetup --find --partscan /superbacked-os/${1}

printf "%s\n" "Checking filesystem for inconsistencies…"

fsck /dev/loop0p1
fsck /dev/loop0p2

printf "%s\n" "Mounting root partition…"

mkdir --parents /mnt/root

mount /dev/loop0p2 /mnt/root

printf "%s\n" "Purging provisioning artifacts…"

# The image ships whatever the provisioning session left on disk —
# overlayroot only makes the runtime amnesic. Logs, histories, caches
# and network state describe the provisioning machine and network, so
# they are purged for privacy; the rest is dead weight. Everything
# below regenerates on demand at boot, in the overlay. Per-user snap
# data (~/snap) is deliberately kept — the bootstrap pre-warms it. The
# list matches what a bootstrapped Ubuntu 24.04.4 system actually
# leaves behind (verified against a real image), plus the paths where
# Wi-Fi credentials would land if provisioning ever ran over Wi-Fi
# instead of Ethernet.

# Logs, including the installer logs (username, hardware and network of
# the provisioning machine) and the systemd journal
find /mnt/root/var/log -type f -delete

# apt package indexes (which the frozen image never reads again) and
# temporary files from the provisioning session
rm --force --recursive \
  /mnt/root/var/lib/apt/lists/* \
  /mnt/root/tmp/*

# Bash histories of the provisioning session (history -cw in the
# bootstrap only covers its own shell)
rm --force /mnt/root/home/*/.bash_history

# User caches (thumbnails, pip downloads, tracker file index…) and
# gvfs metadata (records which files were touched during provisioning)
rm --force --recursive \
  /mnt/root/home/*/.cache \
  /mnt/root/home/*/.local/share/gvfs-metadata

# GnuPG homedirs — only used at provisioning time to verify downloads
rm --force --recursive /mnt/root/home/*/.gnupg

# GNOME keyrings — locked with the provisioning password; a fresh one
# is created transparently at login. Wi-Fi passwords stored “for this
# user only” would land here.
rm --force --recursive /mnt/root/home/*/.local/share/keyrings/*

# NetworkManager state: connection profiles (Wi-Fi profiles, including
# passwords stored system-wide, land in system-connections), DHCP
# leases (named after the provisioning machine’s interface MAC), seen
# access points and the per-machine secret key
rm --force --recursive \
  /mnt/root/etc/NetworkManager/system-connections/* \
  /mnt/root/var/lib/NetworkManager/*

# Entropy seed and clock state — shipping the same random seed to every
# user is worse than shipping none; both regenerate at boot
rm --force \
  /mnt/root/var/lib/systemd/random-seed \
  /mnt/root/var/lib/systemd/timesync/clock

printf "%s\n" "Unmounting root partition…"

umount /dev/loop0p2

printf "%s\n" "Optimizing root partition…"

zerofree /dev/loop0p2

printf "%s\n" "Detaching loop device…"

losetup --detach /dev/loop0