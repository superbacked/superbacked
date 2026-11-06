<!--
Title: How to verify data persistence is disabled
Description: Learn how to verify that Superbacked OS persists nothing to disk
Keywords: superbacked-os, macos, linux, checksum
Publication date: 2026-01-29T18:12:16.210Z
Category: Superbacked OS
Pinned:
-->

# How to verify data persistence is disabled

## Overview

This guide walks through verifying that Superbacked OS persists nothing to disk by comparing partition checksums to release checksums before and after use.

Each release publishes the checksum of its boot and root partitions — a freshly flashed USB flash drive matches them and, because Superbacked OS writes nothing to disk, still matches them after use.

Superbacked OS runs entirely from memory, so the USB flash drive can be unplugged as soon as the login screen appears — nothing can be written to a drive that is not connected. The comparison below covers what remains: the boot itself and any session during which the drive stays plugged in, by choice or because the computer has too little memory and Superbacked OS runs from the drive instead. To verify a full session, leave the drive plugged in.

## Guide

> Heads-up: replace `2.0.0` with the version of the release flashed to the USB flash drive.

Download `superbacked-os-amd64-live-2.0.0.img.sha256sums` from the [release page](https://github.com/superbacked/superbacked/releases) — it lists the release checksum of each partition.

### macOS

#### Step 1: verify partition checksums match release checksums

> Heads-up: replace `rdisk4` with the disk found using `diskutil list`.

Run following commands.

```console
$ cat superbacked-os-amd64-live-2.0.0.img.sha256sums
Boot partition: 33958f20e63dd15591231ea42901671a4017aadf1e13e6d91a267902aeba93cb
Root partition: 7eb23703c303acfe6fd956358a1ecd4cae23075d3213432fb7fa4022bcb63a32

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
33958f20e63dd15591231ea42901671a4017aadf1e13e6d91a267902aeba93cb  /dev/rdisk4s1
7eb23703c303acfe6fd956358a1ecd4cae23075d3213432fb7fa4022bcb63a32  /dev/rdisk4s2
```

Verify checksums match release checksums — a mismatch means the download or flash is bad, not that data was persisted.

#### Step 2: verify partition checksums still match release checksums after use

Complete step 1 again after using Superbacked OS — checksums still match release checksums when nothing was persisted.

### Ubuntu Desktop

#### Step 1: verify partition checksums match release checksums

> Heads-up: replace `sdb` with the disk found using `sudo fdisk --list`.

Run following commands.

```console
$ cat superbacked-os-amd64-live-2.0.0.img.sha256sums
Boot partition: 33958f20e63dd15591231ea42901671a4017aadf1e13e6d91a267902aeba93cb
Root partition: 7eb23703c303acfe6fd956358a1ecd4cae23075d3213432fb7fa4022bcb63a32

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
33958f20e63dd15591231ea42901671a4017aadf1e13e6d91a267902aeba93cb  /dev/sdb1
7eb23703c303acfe6fd956358a1ecd4cae23075d3213432fb7fa4022bcb63a32  /dev/sdb2
```

Verify checksums match release checksums — a mismatch means the download or flash is bad, not that data was persisted.

#### Step 2: verify partition checksums still match release checksums after use

Complete step 1 again after using Superbacked OS — checksums still match release checksums when nothing was persisted.
