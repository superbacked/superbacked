<!--
Title: How to verify data persistence is disabled
Description: Learn how to verify that Superbacked OS persists nothing to disk
Publication date: 2026-01-29T18:12:16.210Z
Pinned:
-->

# How to verify data persistence is disabled

## Overview

This guide walks through verifying that Superbacked OS persists nothing to disk by comparing partition checksums before and after use.

## Guide

### macOS

#### Step 1: compute disk checksum

> Heads-up: replace `rdisk4` with the disk found using `diskutil list`.

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

$ sudo shasum --algorithm 256 /dev/rdisk4s1 /dev/rdisk4s2
9a4c3b8eddfa2d56c581488f27d490b11ab7e30bc6255a20e1db0ae8433d25df  /dev/rdisk4s1
9c2414d78142bb48f2661723c5705d42caf7f3de133f8fd029f36281aa4c9935  /dev/rdisk4s2

$ cat superbacked-os-amd64-1.12.1.img.sha256sums
Boot partition: 9a4c3b8eddfa2d56c581488f27d490b11ab7e30bc6255a20e1db0ae8433d25df
Root partition: 9c2414d78142bb48f2661723c5705d42caf7f3de133f8fd029f36281aa4c9935
```

#### Step 2: verify disk checksum after use

Complete step 1 again after using Superbacked OS and verify checksums have not changed.

### Ubuntu Desktop

#### Step 1: compute disk checksum

> Heads-up: replace `sdb` with the disk found using `sudo fdisk --list`.

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
9a4c3b8eddfa2d56c581488f27d490b11ab7e30bc6255a20e1db0ae8433d25df  /dev/sdb1
9c2414d78142bb48f2661723c5705d42caf7f3de133f8fd029f36281aa4c9935  /dev/sdb2

$ cat superbacked-os-amd64-1.12.1.img.sha256sums
Boot partition: 9a4c3b8eddfa2d56c581488f27d490b11ab7e30bc6255a20e1db0ae8433d25df
Root partition: 9c2414d78142bb48f2661723c5705d42caf7f3de133f8fd029f36281aa4c9935
```

#### Step 2: verify disk checksum after use

Complete step 1 again after using Superbacked OS and verify checksums have not changed.
