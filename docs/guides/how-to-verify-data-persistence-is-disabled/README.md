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

> Heads-up: replace `2.0.0-beta.13` with the semver of the release flashed to the USB flash drive.

### macOS

#### Step 1: compute disk checksum

> Heads-up: replace `rdisk4` with the disk found using `diskutil list`.

```console
$ diskutil list
…

/dev/disk4 (external, physical):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:      GUID_partition_scheme                        *15.5 GB    disk4
   1:                        EFI NO NAME                 536.9 MB   disk4s1
   2:           Linux Filesystem                         2.6 GB     disk4s2
                    (free space)                         12.3 GB    -

$ sudo diskutil unmountDisk /dev/disk4
Password:
Unmount of all volumes on disk4 was successful

$ sudo shasum --algorithm 256 /dev/rdisk4s1 /dev/rdisk4s2
a72eed3b1ec4df47964238512e58731662361c65b6b9629f4469c90f95bfb664  /dev/rdisk4s1
9c073fd62ce6a2996eda1656a6d049bae5ac5f6e3051d0b052c434ac0831f355  /dev/rdisk4s2

$ cat superbacked-os-amd64-live-2.0.0-beta.13.img.sha256sums
Boot partition: a72eed3b1ec4df47964238512e58731662361c65b6b9629f4469c90f95bfb664
Root partition: 9c073fd62ce6a2996eda1656a6d049bae5ac5f6e3051d0b052c434ac0831f355
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
Disklabel type: gpt
Disk identifier: 3E1A4945-08EE-46F6-94B8-3516ADB718F2

Device       Start     End Sectors  Size Type
/dev/sdb1     2048 1050623 1048576  512M EFI System
/dev/sdb2  1050624 6195199 5144576  2.5G Linux filesystem

$ sudo umount /dev/sdb*
umount: /dev/sdb: not mounted.
umount: /dev/sdb1: not mounted.
umount: /dev/sdb2: not mounted.

$ sudo sha256sum /dev/sdb1 /dev/sdb2
a72eed3b1ec4df47964238512e58731662361c65b6b9629f4469c90f95bfb664  /dev/sdb1
9c073fd62ce6a2996eda1656a6d049bae5ac5f6e3051d0b052c434ac0831f355  /dev/sdb2

$ cat superbacked-os-amd64-live-2.0.0-beta.13.img.sha256sums
Boot partition: a72eed3b1ec4df47964238512e58731662361c65b6b9629f4469c90f95bfb664
Root partition: 9c073fd62ce6a2996eda1656a6d049bae5ac5f6e3051d0b052c434ac0831f355
```

#### Step 2: verify disk checksum after use

Complete step 1 again after using Superbacked OS and verify checksums have not changed.
