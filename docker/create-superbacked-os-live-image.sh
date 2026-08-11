#! /bin/bash
# Creates the distributed Superbacked OS live image (EFI + squashfs)
# from a vanilla Ubuntu Desktop source image (EFI + ext4 root). The
# bootstrap, running in a chroot of the source image overlay, authors
# the entire root filesystem — packages, users, hardening, the
# Superbacked app and its AppArmor profiles (see
# superbacked-os-utilities/superbacked-os-bootstrap.sh); this
# script assembles and sanitizes the artifact around it. The live root
# filesystem is copied to RAM at boot: the USB drive can be unplugged
# as soon as the login screen appears, and amnesia is physical — the OS
# only ever exists in RAM.
#
# Image creation is online: the bootstrap resolves packages against a
# pinned Ubuntu archive snapshot (same timestamp, same packages) and
# verifies every other download against pinned keys and fingerprints.
#
# The source image is never modified — it is attached read-only and all
# changes below land in a tmpfs overlay that only the squashfs sees.
#
# Usage (inside superbacked-os-docker container, with /dist holding the
# app build and /superbacked-os-bootstrap-assets plus
# /superbacked-os-utilities mounted from the repository; set
# BUILD_VARIANT=debug to build the debug variant, whose app profiles
# log denials (complain) instead of enforcing and which keeps sudo for
# on-device profile iteration):
# /root/create-superbacked-os-live-image.sh \
#   /superbacked-os/superbacked-os-amd64-24.04.4.img \
#   /dist/superbacked-os-amd64-live-1.13.0.img \
#   1.13.0
#
# Writes the live image (and its .sha256sums) to the output path.

set -o errexit
set -o pipefail

source_image="${1}"
output_image="${2}"
version="${3}"
app_deb="/dist/superbacked-x64-${version}.deb"

if [ ! -f "${source_image}" ] \
  || [ -z "${output_image}" ] \
  || [ "${source_image}" = "${output_image}" ]; then
  printf "%s\n" "Error: usage: create-superbacked-os-live-image.sh /path/to/source.img /path/to/output.img version" >&2
  exit 1
fi

if [ ! -f "${app_deb}" ]; then
  printf "%s\n" "Error: ${app_deb} not found" >&2
  exit 1
fi

function cleanup()
{
  # Not alphabetical — nested mounts unmount before their parents
  # (dev/pts before dev, the overlay root before its lower and scratch
  # backing).
  umount /mnt/root/dev/pts 2> /dev/null || true
  umount /mnt/root/dev 2> /dev/null || true
  umount /mnt/root/proc 2> /dev/null || true
  umount /mnt/root/sys 2> /dev/null || true
  umount --recursive /mnt/root/run 2> /dev/null || true
  umount /mnt/root 2> /dev/null || true
  umount /mnt/scratch 2> /dev/null || true
  umount /mnt/lower 2> /dev/null || true
  umount /mnt/esp 2> /dev/null || true
  umount /mnt/boot 2> /dev/null || true
  losetup --detach-all
}

trap cleanup ERR INT

printf "%s\n" "Starting live image assembly…"

printf "%s\n" "Creating block device nodes…"

[ -e /dev/loop0p1 ] || mknod /dev/loop0p1 b 259 1
[ -e /dev/loop0p2 ] || mknod /dev/loop0p2 b 259 2

printf "%s\n" "Attaching source image to loop device…"

losetup --find --partscan --read-only "${source_image}"

printf "%s\n" "Mounting root partition in RAM overlay…"

mkdir --parents /mnt/lower /mnt/root /mnt/scratch

mount --read-only /dev/loop0p2 /mnt/lower
# The upper layer absorbs everything the bootstrap does — apt indexes,
# downloaded debs, upgraded files — so it needs a generous cap (tmpfs
# allocates lazily; unused headroom costs nothing).
mount --options size=8g --types tmpfs tmpfs /mnt/scratch
mkdir --parents /mnt/scratch/upper /mnt/scratch/work
mount \
  --options lowerdir=/mnt/lower,upperdir=/mnt/scratch/upper,workdir=/mnt/scratch/work \
  --types overlay \
  overlay /mnt/root

printf "%s\n" "Preparing chroot…"

# dev before dev/pts — nested mounts need their parent in place first.
mount --bind /dev /mnt/root/dev
mount --bind /dev/pts /mnt/root/dev/pts
mount --types proc proc /mnt/root/proc
mount --types tmpfs tmpfs /mnt/root/run
mount --types sysfs sysfs /mnt/root/sys

# The app build and repository assets ride into the chroot on the /run
# tmpfs — the bootstrap installs the Superbacked app and the AppArmor
# profiles from there, and the mounts (and their mount points) vanish
# with the tmpfs, leaving no trace in the image.
mkdir --parents \
  /mnt/root/run/dist \
  /mnt/root/run/superbacked-os-bootstrap-assets
mount --bind /dist /mnt/root/run/dist
mount --bind /superbacked-os-bootstrap-assets \
  /mnt/root/run/superbacked-os-bootstrap-assets

# The source image’s /etc/resolv.conf is a dangling symlink into
# /run/systemd/resolve — replace it with the container’s resolver for
# the duration of provisioning (the stock symlink is restored in the
# purge below).
rm --force /mnt/root/etc/resolv.conf
cp /etc/resolv.conf /mnt/root/etc/resolv.conf

# Keep maintainer scripts from trying to start services in the chroot.
printf '%s\n' '#!/bin/sh' 'exit 101' > /mnt/root/usr/sbin/policy-rc.d
chmod +x /mnt/root/usr/sbin/policy-rc.d

# update-grub is meaningless during provisioning — the live image’s
# GRUB configuration is written further down and the rootfs /boot is
# excluded from the squashfs — and it would fail anyway: grub-probe
# cannot resolve the overlay root to a device. Kernel and memtest
# maintainer scripts call it regardless, so divert it to true for the
# duration (restored in the purge below).
chroot /mnt/root dpkg-divert --local --rename --add /usr/sbin/update-grub
ln --symbolic /usr/bin/true /mnt/root/usr/sbin/update-grub

cp \
  /superbacked-os-utilities/superbacked-os-bootstrap.sh \
  /mnt/root/root/superbacked-os-bootstrap.sh

printf "%s\n" "Running bootstrap in chroot…"

# --ignore-environment keeps container variables (and Docker’s PATH)
# from leaking into the image; BUILD_VARIANT passes through explicitly.
chroot /mnt/root /usr/bin/env --ignore-environment \
  BUILD_VARIANT="${BUILD_VARIANT:-}" \
  DEBIAN_FRONTEND=noninteractive \
  HOME=/root \
  LC_ALL=C.UTF-8 \
  PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  TERM="${TERM:-dumb}" \
  bash /root/superbacked-os-bootstrap.sh "${version}"

# live-boot provides the initramfs plumbing that finds
# /live/filesystem.squashfs on the boot medium, copies it to RAM
# (toram) and mounts it with a tmpfs overlay as the root filesystem.
# Unlike casper it configures nothing at boot — the baked system comes
# up exactly as provisioned — and it only activates when boot=live is
# on the kernel command line. The bootstrap installs it; a boot whose
# initramfs lacks it lands in an initramfs shell, so fail here instead.
if ! chroot /mnt/root dpkg --status live-boot > /dev/null 2>&1; then
  printf "%s\n" "Error: bootstrap failed to install live-boot" >&2
  cleanup
  exit 1
fi

printf "%s\n" "Removing superseded kernels…"

# The bootstrap’s apt upgrade may have installed a newer kernel; the
# superseded one would ship as dead weight in the squashfs. apt’s
# kernel-keep heuristic reads the *host* kernel version inside a
# chroot, so the purge is explicit: keep the exact version
# /boot/vmlinuz points at, purge every other versioned kernel package
# (metapackages stay, or apt would reinstall on the next build of a
# refreshed source image).
keep_version="$(basename "$(readlink --canonicalize /mnt/root/boot/vmlinuz)")"
keep_version="${keep_version#vmlinuz-}"

mapfile -t old_kernel_packages < <(
  chroot /mnt/root dpkg-query --show --showformat '${Package}\n' \
    'linux-headers-*' 'linux-image-*' 'linux-modules-*' 2> /dev/null \
    | grep --extended-regexp '^linux-(image|modules|headers)(-extra)?-[0-9]' \
    | grep --invert-match --fixed-strings "${keep_version}" || true
)

if [ "${#old_kernel_packages[@]}" -gt 0 ]; then
  chroot /mnt/root apt-get purge --yes "${old_kernel_packages[@]}"
  chroot /mnt/root apt-get clean
fi

printf "%s\n" "Regenerating initramfs…"

# Embeds live-boot (installed by the bootstrap) into the initrd of the
# kernel captured below.
chroot /mnt/root update-initramfs -u -k all

# Capture the kernel and initramfs (regenerated above) before the boot
# folder is excluded from the squashfs below.
kernel="$(basename "$(readlink --canonicalize /mnt/root/boot/vmlinuz)")"
initrd="$(basename "$(readlink --canonicalize /mnt/root/boot/initrd.img)")"

cp "/mnt/root/boot/${kernel}" "/tmp/${kernel}"
cp "/mnt/root/boot/${initrd}" "/tmp/${initrd}"

# A boot whose initramfs lacks the live-boot script lands in an
# initramfs shell on the user’s machine — fail here instead.
if ! chroot /mnt/root lsinitramfs "/boot/${initrd}" \
  | awk '/^scripts\/live$/ { found = 1 } END { exit !found }'; then
  printf "%s\n" "Error: initramfs is missing live-boot" >&2
  cleanup
  exit 1
fi

# Capture the EFI system partition — it ships verbatim (same shim and
# signed GRUB, so Secure Boot keeps working); only its stub grub.cfg is
# rewritten further down to point at the boot partition.
esp_size="$(blockdev --getsize64 /dev/loop0p1)"

dd bs=1M if=/dev/loop0p1 of=/tmp/esp.img status=none

printf "%s\n" "Purging source image artifacts…"

# The image ships whatever the source image and the steps above left
# behind. Purged here, at live image creation time, so purge
# improvements apply to every build without re-capturing the source
# image. Logs, histories, caches and network state describe the
# installer machine and the build container — purged for privacy; the
# rest is dead weight.
# Everything regenerates on demand at boot, in the RAM overlay.

# Provisioning scaffolding: the service-start guard, the update-grub
# diversion, the bootstrap script copy, root’s download-verification
# and shell state, and the container’s resolver (the stock symlink
# into systemd-resolved is restored).
rm --force /mnt/root/usr/sbin/policy-rc.d
rm --force /mnt/root/usr/sbin/update-grub
chroot /mnt/root dpkg-divert --local --rename --remove /usr/sbin/update-grub
rm --force /mnt/root/root/superbacked-os-bootstrap.sh
rm --force --recursive \
  /mnt/root/root/.bash_history \
  /mnt/root/root/.cache \
  /mnt/root/root/.gnupg
rm --force /mnt/root/etc/resolv.conf
ln --symbolic ../run/systemd/resolve/stub-resolv.conf /mnt/root/etc/resolv.conf

# The machine-id describes the installer machine — shipping it would
# make every user’s boot share one identity. Emptied (not removed) so
# systemd treats it as uninitialized and generates a fresh one in the
# RAM overlay at every boot.
truncate --size 0 /mnt/root/etc/machine-id
rm --force /mnt/root/var/lib/dbus/machine-id

# Logs, including the installer logs (username, hardware and network of
# the provisioning machine) and the systemd journal
find /mnt/root/var/log -type f -delete

# apt indexes and caches (which the frozen image never reads again) and
# temporary files from the provisioning session
rm --force --recursive \
  /mnt/root/tmp/* \
  /mnt/root/var/cache/apt/* \
  /mnt/root/var/lib/apt/lists/*

# Bash histories of the provisioning session (history -cw in the
# bootstrap only covers its own shell)
rm --force /mnt/root/home/*/.bash_history

# The autoinstall ssh section leaves an empty ~/.ssh/authorized_keys
# behind (see ubuntu-desktop-utilities/autoinstall.yaml) — installer
# state like the histories above, and an audit red herring on an image
# that ships no ssh server
rm --force --recursive /mnt/root/home/*/.ssh /mnt/root/root/.ssh

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

# mksquashfs cannot store POSIX ACLs, and /media/<user> mount folders
# baked from the provisioning session depend on one — udisks grants
# the user traversal via ACL on an otherwise root-owned 0750 folder.
# Shipped without the ACL, users cannot enter their own mounted
# drives. Removed so udisks recreates them at runtime, in the RAM
# overlay, ACL intact.
rm --force --recursive /mnt/root/media/*

# dev/pts before dev — nested mounts unmount before their parents.
umount /mnt/root/dev/pts /mnt/root/dev /mnt/root/proc /mnt/root/sys
umount --recursive /mnt/root/run

printf "%s\n" "Creating squashfs (this takes a while)…"

# zstd level 19 compresses close to xz but decompresses much faster —
# every file read at runtime pays the decompression cost. /boot is
# excluded: the kernel and initramfs live on the boot partition and the
# live system never reads its own /boot. mksquashfs has no long-form
# options, and ordering is semantic where not alphabetical:
# -Xcompression-level qualifies the preceding -comp, and -e must follow
# -wildcards to be interpreted as a pattern.
mksquashfs /mnt/root /tmp/filesystem.squashfs \
  -b 1M -comp zstd -Xcompression-level 19 \
  -wildcards -e 'boot/*'

umount /mnt/root /mnt/scratch /mnt/lower
losetup --detach /dev/loop0

printf "%s\n" "Creating live image…"

squashfs_size="$(stat --format=%s /tmp/filesystem.squashfs)"
kernel_size="$(stat --format=%s "/tmp/${kernel}")"
initrd_size="$(stat --format=%s "/tmp/${initrd}")"

# Boot partition: payload plus 5% ext4 overhead (journal, bitmaps,
# superblocks — inode tables are shrunk at mkfs below) and 64 MiB of
# GRUB slack, rounded up to a whole MiB. Kept tight on purpose: unused
# partition space ships as zeros in the image and as dead weight on
# every USB drive.
boot_size="$(( (squashfs_size + kernel_size + initrd_size) * 105 / 100 + 67108864 ))"
boot_size="$(( (boot_size / 1048576 + 1) * 1048576 ))"

p1_start=1048576
p2_start="$(( ((p1_start + esp_size + 1048575) / 1048576) * 1048576 ))"
image_size="$(( p2_start + boot_size + 1048576 ))"

rm --force "${output_image}"
truncate --size "${image_size}" "${output_image}"

parted --script "${output_image}" \
  mklabel gpt \
  unit B \
  mkpart ESP fat32 "${p1_start}" "$(( p1_start + esp_size - 1 ))" \
  set 1 esp on \
  mkpart SUPERBACKED ext4 "${p2_start}" "$(( p2_start + boot_size - 1 ))"

# The partitions are attached as standalone loop devices by offset —
# deterministic, no partition-scan device nodes needed.
esp_device="$(losetup --find --offset "${p1_start}" \
  --show --sizelimit "${esp_size}" "${output_image}")"
boot_device="$(losetup --find --offset "${p2_start}" \
  --show --sizelimit "${boot_size}" "${output_image}")"

printf "%s\n" "Writing EFI system partition…"

dd bs=1M if=/tmp/esp.img of="${esp_device}" status=none

printf "%s\n" "Writing boot partition…"

# The partition holds four large files — one inode per 4 MiB
# (largefile4) instead of the default one per 16 KiB keeps the inode
# tables from wasting the tight size budget above, and no blocks are
# reserved for root (-m 0). mkfs.ext4 has no long-form options.
mkfs.ext4 -L SUPERBACKED -m 0 -q -T largefile4 "${boot_device}"

boot_uuid="$(blkid --match-tag UUID --output value "${boot_device}")"

mkdir --parents /mnt/boot /mnt/esp
mount "${boot_device}" /mnt/boot
mkdir --parents /mnt/boot/live /mnt/boot/boot/grub

cp "/tmp/${kernel}" "/tmp/${initrd}" /mnt/boot/live/
mv /tmp/filesystem.squashfs /mnt/boot/live/

# Air-gapped boots unattended; hardened browser mode is a deliberate
# choice, selected by the superbacked.browser kernel parameter that
# the browser-mode service (baked in by the bootstrap) checks.
# boot=live hands root mounting to live-boot. init_on_free=1 makes the
# kernel zero memory the moment it is freed, so secrets do not linger
# in RAM after the app releases them — a cold-boot attack recovers
# nothing.
#
# toram copies the squashfs to RAM, so the USB drive can be unplugged
# as soon as the login screen appears — which also makes mid-session
# tampering with the drive physically impossible. Machines with less
# memory can edit an entry at the GRUB menu and remove toram to run
# tethered from the drive instead (documented in the run guide) —
# equally amnesic, writes land in the same RAM overlay either way.
#
# The 8 GB memory requirement lives in the run guide rather than the
# menu — with less memory, live-boot falls back to running from the
# drive and the toram status warning tells the user to keep it plugged
# in.
#
# Debug-variant images disable printk rate limiting so profile
# harvests are complete — the kernel otherwise silently drops audit
# events under load, and an incomplete harvest folds incomplete rules
# (see superbacked-os-utilities/debug/capture-apparmor-log.sh, which
# fails loudly when it detects suppression). Never set on release
# images.
apparmor_boot_parameters=""
if [ "${BUILD_VARIANT:-}" = "debug" ]; then
  apparmor_boot_parameters=" sysctl.kernel.printk_ratelimit=0"
fi

cat > /mnt/boot/boot/grub/grub.cfg << EOF
set default=0
set timeout=5

menuentry "Superbacked OS (air-gapped)" {
  search --no-floppy --fs-uuid --set=root ${boot_uuid}
  linux /live/${kernel} boot=live init_on_free=1 live-media-path=/live quiet splash toram${apparmor_boot_parameters}
  initrd /live/${initrd}
}
menuentry "Superbacked OS (hardened browser)" {
  search --no-floppy --fs-uuid --set=root ${boot_uuid}
  linux /live/${kernel} boot=live init_on_free=1 live-media-path=/live quiet splash toram superbacked.browser${apparmor_boot_parameters}
  initrd /live/${initrd}
}
EOF

printf "%s\n" "Pointing GRUB at boot partition…"

# Ubuntu’s signed GRUB reads this stub from the EFI system partition to
# find its real configuration — point it at the boot partition.
mount "${esp_device}" /mnt/esp

cat > /mnt/esp/EFI/ubuntu/grub.cfg << EOF
search.fs_uuid ${boot_uuid} root
set prefix=(\$root)/boot/grub
configfile \$prefix/grub.cfg
EOF

umount /mnt/boot /mnt/esp

printf "%s\n" "Calculating SHA256 checksums…"

# Labels match the format historical releases used so verification
# guides keep working — the root filesystem now lives in partition 2 as
# a squashfs.
printf "Boot partition: " > "${output_image}.sha256sums"
sha256sum "${esp_device}" | cut --delimiter ' ' --fields 1 >> "${output_image}.sha256sums"

printf "Root partition: " >> "${output_image}.sha256sums"
sha256sum "${boot_device}" | cut --delimiter ' ' --fields 1 >> "${output_image}.sha256sums"

losetup --detach "${esp_device}"
losetup --detach "${boot_device}"

rm --force "/tmp/${kernel}" "/tmp/${initrd}" /tmp/esp.img

printf "%s\n" "Live image assembly complete"
