<!--
Title: How to verify data persistence is disabled
Description: Learn how to verify that Superbacked OS persists nothing to disk by comparing partition checksums before and after use
Publication date: 2026-01-29T18:12:16.210Z
Pinned:
-->

## How to verify data persistence is disabled

Superbacked OS disables data persistence by default to make sure secrets are not written to disk… this is how one can verify claim.

Using terminal, compute disk checksum before and after using Superbacked OS and make sure checksums match.

Confirm checksums match Superbacked OS release boot (1) and root (2) partition PGP-signed checksums.

### macOS

#### Step 1 (if computing checksum of Superbacked OS for Raspberry Pi): disable automatic mounting of `/Volumes/system-boot`

```console
$ volume_path="/Volumes/system-boot"

$ volume_uuid=$(diskutil info "$volume_path" | awk '/Volume UUID:/ { print $3 }')

$ echo "UUID=$volume_uuid none auto ro,noauto" | sudo tee -a /etc/fstab
UUID=C6651C15-1754-301D-B9DB-76371B6FE869 none auto ro,noauto
```

#### Step 2: compute disk checksum

> Heads-up: replace `rdisk4` with disk found using `diskutil list`.

```console
$ diskutil list
…

/dev/disk4 (external, physical):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:     FDisk_partition_scheme                        *15.5 GB    disk4
   1:                       0xEF                         536.9 MB   disk4s1
   2:                      Linux                         10.7 GB    disk4s2
                    (free space)                         4.2 GB     -

$ sudo diskutil unmountDisk /dev/disk4
Password:
Unmount of all volumes on disk4 was successful

$ sudo sha256sum /dev/rdisk4s1 /dev/rdisk4s2
4bdf74fabaeb4bdbd493b99159f743702c1f2eb11975d44c186d513522cb68be  /dev/rdisk4s1
bc9c0448061b7449a31fb25e001871166c53e0514872ba16e8139c1a60f0984d  /dev/rdisk4s2

$ cat superbacked-os-amd64-1.10.0.img.sha256sums
Boot partition: 4bdf74fabaeb4bdbd493b99159f743702c1f2eb11975d44c186d513522cb68be
Root partition: bc9c0448061b7449a31fb25e001871166c53e0514872ba16e8139c1a60f0984d
```

### Ubuntu

> Heads-up: replace `sdb` with disk found using `sudo fdisk --list`.

```console
$ sudo fdisk --list
…
Disk /dev/sdb: 14.44 GiB, 15502147584 bytes, 30277632 sectors
Disk model: FlashTrust
Units: sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disklabel type: dos
Disk identifier: 0xefc52f4f

Device     Boot   Start      End  Sectors  Size Id Type
/dev/sdb1  *       2048  1050623  1048576  512M ef EFI (FAT-12/16/32)
/dev/sdb2       1050624 22022143 20971520   10G 83 Linux

$ sudo umount /dev/sdb*
umount: /dev/sdb: not mounted.
umount: /dev/sdb1: not mounted.
umount: /dev/sdb2: not mounted.

$ sudo sha256sum /dev/sdb1 /dev/sdb2
4bdf74fabaeb4bdbd493b99159f743702c1f2eb11975d44c186d513522cb68be  /dev/sdb1
bc9c0448061b7449a31fb25e001871166c53e0514872ba16e8139c1a60f0984d  /dev/sdb2

$ cat superbacked-os-amd64-1.10.0.img.sha256sums
Boot partition: 4bdf74fabaeb4bdbd493b99159f743702c1f2eb11975d44c186d513522cb68be
Root partition: bc9c0448061b7449a31fb25e001871166c53e0514872ba16e8139c1a60f0984d
```
