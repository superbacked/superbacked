#! /bin/bash
# Creates a live Superbacked OS image (EFI + squashfs) from an
# installed-style one (EFI + ext4 root). The live root filesystem is
# copied to RAM at boot: the USB drive can be unplugged as soon as the
# login screen appears, and amnesia becomes physical (the OS only ever
# exists in RAM) instead of depending on overlayroot.
#
# The source image must ship live-boot preinstalled (the bootstrap
# handles this) — conversion is fully offline, so the same input image
# always yields the same live system.
#
# The source image is never modified — it is mounted read-only and the
# changes below land in a tmpfs overlay that only the squashfs sees.
#
# Usage (inside superbacked-os-docker container, against any mounted
# path):
# /root/create-live-image.sh /path/to/image.img [/path/to/output.img]
#
# Writes the live image (and its .sha256sums) to the output path, which
# defaults to <image>-live.img next to the source image.

set -e
set -o pipefail

source_image="${1}"
output_image="${2:-${source_image%.img}-live.img}"

if [ ! -f "${source_image}" ] || [ "${source_image}" = "${output_image}" ]; then
  printf "%s\n" "Error: usage: create-live-image.sh /path/to/image.img [/path/to/output.img]" >&2
  exit 1
fi

function cleanup()
{
  umount /mnt/root/dev/pts 2> /dev/null || true
  umount /mnt/root/dev 2> /dev/null || true
  umount /mnt/root/proc 2> /dev/null || true
  umount /mnt/root/sys 2> /dev/null || true
  umount /mnt/root 2> /dev/null || true
  umount /mnt/scratch 2> /dev/null || true
  umount /mnt/lower 2> /dev/null || true
  umount /mnt/esp 2> /dev/null || true
  umount /mnt/boot 2> /dev/null || true
  losetup --detach-all
}

trap cleanup ERR INT

printf "%s\n" "Creating block device nodes…"

[ -e /dev/loop0p1 ] || mknod /dev/loop0p1 b 259 1
[ -e /dev/loop0p2 ] || mknod /dev/loop0p2 b 259 2

printf "%s\n" "Attaching source image to loop device…"

losetup --find --partscan "${source_image}"

printf "%s\n" "Mounting root partition in RAM overlay…"

mkdir --parents /mnt/lower /mnt/scratch /mnt/root

mount --read-only /dev/loop0p2 /mnt/lower
mount --types tmpfs tmpfs /mnt/scratch
mkdir --parents /mnt/scratch/upper /mnt/scratch/work
mount \
  --options lowerdir=/mnt/lower,upperdir=/mnt/scratch/upper,workdir=/mnt/scratch/work \
  --types overlay \
  overlay /mnt/root

printf "%s\n" "Adapting system configuration for live boot…"

# live-boot overlays the root filesystem with RAM — overlayroot
# stacking a second overlay on top of it would misbehave. Adapted
# before live-boot is installed because overlayroot embeds a copy of
# this file into the initrd the installation below regenerates.
# Tolerates source images that do not use overlayroot at all.
if [ -f /mnt/root/etc/overlayroot.conf ]; then
  sed --in-place 's/overlayroot="tmpfs"/overlayroot=""/g' \
    /mnt/root/etc/overlayroot.conf
fi

# Replace the fstab outright. Its entries pin the provisioning machine
# partitions by UUID: /boot/efi no longer exists (so its mount fails
# and drops boot to emergency mode) and the root entry’s ro option
# makes systemd remount the live overlay read-only, crashing everything
# that writes. live-boot mounts all the live system needs.
tee /mnt/root/etc/fstab > /dev/null << 'EOF'
# Intentionally empty — the root filesystem is assembled by live-boot
# (squashfs copied to RAM with a tmpfs overlay); nothing is mounted
# from disk.
EOF

# live-boot provides the initramfs plumbing that finds
# /live/filesystem.squashfs on the boot medium, copies it to RAM
# (toram) and mounts it with a tmpfs overlay as the root filesystem.
# Unlike casper it configures nothing at boot — the baked system comes
# up exactly as provisioned — and it only activates when boot=live is
# on the kernel command line. The bootstrap preinstalls it; refuse
# source images that predate that rather than reaching for the archive
# (online installs made output depend on archive state).
if ! chroot /mnt/root dpkg --status live-boot > /dev/null 2>&1; then
  printf "%s\n" "Error: source image is missing live-boot — re-provision with the current bootstrap" >&2
  cleanup
  exit 1
fi

mount --bind /dev /mnt/root/dev
mount --bind /dev/pts /mnt/root/dev/pts
mount --types proc proc /mnt/root/proc
mount --types sysfs sysfs /mnt/root/sys

# Regenerate the initramfs so it embeds the overlayroot.conf adapted
# above — skipped when the source image does not use overlayroot (the
# initrd built at provisioning time is already correct).
if [ -f /mnt/root/etc/overlayroot.conf ]; then
  printf "%s\n" "Regenerating initramfs…"

  chroot /mnt/root update-initramfs -k all -u
fi

# Capture the kernel and initramfs (regenerated with live-boot support
# by the installation above) before the boot folder is excluded from
# the squashfs below.
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
# retargeted further down.
esp_size="$(blockdev --getsize64 /dev/loop0p1)"

dd bs=1M if=/dev/loop0p1 of=/tmp/esp.img status=none

printf "%s\n" "Purging residue…"

# Cheap insurance: logs and apt indexes must not ship in the squashfs,
# whether left in the source image or written by the tooling above.
find /mnt/root/var/log -type f -delete
rm --force --recursive \
  /mnt/root/var/lib/apt/lists/* \
  /mnt/root/var/cache/apt/*

# mksquashfs cannot store POSIX ACLs, and /media/<user> mount folders
# baked from the provisioning session depend on one — udisks grants
# the user traversal via ACL on an otherwise root-owned 0750 folder.
# Shipped without the ACL, users cannot enter their own mounted
# drives. Removed so udisks recreates them at runtime, in the RAM
# overlay, ACL intact.
rm --force --recursive /mnt/root/media/*

umount /mnt/root/dev/pts /mnt/root/dev /mnt/root/proc /mnt/root/sys

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

# The run guide documents 8 GB+ of memory, since both modes copy the
# whole live payload to RAM on top of the ~2 GB the session needs.
# Fail when the payload outgrows that promise rather than let 8 GB
# machines die mid-boot with the docs still claiming they are enough.
if [ "$(( squashfs_size + kernel_size + initrd_size ))" -gt 5368709120 ]; then
  printf "%s\n" "Error: live payload exceeds 5 GB — booting needs more than 8 GB of RAM, update the run guide" >&2
  cleanup
  exit 1
fi

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

# Same modes as the installed system: air-gapped boots unattended,
# hardened browser mode is a deliberate choice (selected by the
# superbacked.browser kernel parameter, as before). boot=live hands
# root mounting to live-boot. init_on_free=1 makes the kernel zero
# memory the moment it is freed, so secrets do not linger in RAM after
# the app releases them — a cold-boot attack recovers nothing.
#
# toram copies the squashfs to RAM, so the USB drive can be unplugged
# as soon as the login screen appears — which also makes mid-session
# tampering with the drive physically impossible. Machines with less
# memory can edit an entry at the GRUB menu and remove toram to run
# tethered from the drive instead (documented in the run guide) —
# equally amnesic, writes land in the same RAM overlay either way.
#
# The 8 GB+ memory requirement lives in the run guide rather than the
# menu, and is enforced against payload growth by the check above.
cat > /mnt/boot/boot/grub/grub.cfg << EOF
set default=0
set timeout=5

menuentry "Superbacked OS (air-gapped)" {
  search --no-floppy --fs-uuid --set=root ${boot_uuid}
  linux /live/${kernel} boot=live init_on_free=1 live-media-path=/live quiet splash toram
  initrd /live/${initrd}
}
menuentry "Superbacked OS (hardened browser)" {
  search --no-floppy --fs-uuid --set=root ${boot_uuid}
  linux /live/${kernel} boot=live init_on_free=1 live-media-path=/live quiet splash toram superbacked.browser
  initrd /live/${initrd}
}
EOF

printf "%s\n" "Retargeting GRUB at boot partition…"

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

# Same format as provision-superbacked-os.sh so verification guides
# keep working — the root filesystem now lives in partition 2 as a
# squashfs.
printf "Boot partition: " > "${output_image}.sha256sums"
sha256sum "${esp_device}" | cut --delimiter ' ' --fields 1 >> "${output_image}.sha256sums"

printf "Root partition: " >> "${output_image}.sha256sums"
sha256sum "${boot_device}" | cut --delimiter ' ' --fields 1 >> "${output_image}.sha256sums"

losetup --detach "${esp_device}"
losetup --detach "${boot_device}"

rm --force "/tmp/${kernel}" "/tmp/${initrd}" /tmp/esp.img

printf "%s\n" "Done: ${output_image} ($(du --human-readable --summarize "${output_image}" | cut --fields 1))"
