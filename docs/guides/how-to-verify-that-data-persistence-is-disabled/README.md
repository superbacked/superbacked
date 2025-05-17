<!--
Title: How to verify that data persistence is disabled
Description: Learn how to verify that data persistence is disabled
Publication date: 2025-01-11T09:58:30.556Z
Pinned:
-->

## How to verify that data persistence is disabled

Superbacked OS disables data persistence by default to make sure secrets are not written to disk… this is how one can verify claim.

Using terminal, compute disk checksum before and after using Superbacked OS and make sure checksums match.

### macOS

#### Step 1 (if computing checksum of Superbacked OS for Raspberry Pi): disable automatic mounting of `/Volumes/system-boot`

> Heads-up: when mounting filesystems, macOS may write hidden files altering computed disk checksum (completing step 1 is only required once).

```shell-session
$ volume_path="/Volumes/system-boot"

$ volume_uuid=$(diskutil info "$volume_path" | awk '/Volume UUID:/ { print $3 }')

$ echo "UUID=$volume_uuid none auto ro,noauto" | sudo tee -a /etc/fstab
UUID=C6651C15-1754-301D-B9DB-76371B6FE869 none auto ro,noauto
```

#### Step 2: compute disk checksum

> Heads-up: replace `rdisk4` with disk found using `diskutil list`.

```shell-session
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

$ sudo openssl dgst -sha256 /dev/rdisk4
SHA256(/dev/rdisk4)= bf786d69790b84d88a2c47d656807e166c5a224ea32e8e4520ac4daf41db78be
```

### Ubuntu

> Heads-up: replace `sdb` with disk found using `sudo fdisk --list`.

```shell-session
$ sudo fdisk --list
…
Disk /dev/sdb: 14.44 GiB, 15502147584 bytes, 30277632 sectors
Disk model: FlashTrust
Units: sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disklabel type: dos
Disk identifier: 0xc5c84eac

Device     Boot   Start      End  Sectors  Size Id Type
/dev/sdb1  *       2048  1050623  1048576  512M ef EFI (FAT-12/16/32)
/dev/sdb2       1050624 22022143 20971520   10G 83 Linux

$ sudo umount /dev/sdb*
umount: /dev/sdb: not mounted.
umount: /dev/sdb1: not mounted.
umount: /dev/sdb2: not mounted.

$ sudo openssl dgst -sha256 /dev/sdb
SHA2-256(/dev/sdb)= bf786d69790b84d88a2c47d656807e166c5a224ea32e8e4520ac4daf41db78be
```
