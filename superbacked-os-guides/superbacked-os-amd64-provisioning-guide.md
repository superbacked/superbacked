# Superbacked OS amd64 base image provisioning guide

### Step 1 (Mac): download `ubuntu-24.04.4-desktop-amd64.iso`, `SHA256SUMS` and `SHA256SUMS.gpg` from [Ubuntu 24.04 LTS releases](https://releases.ubuntu.com/24.04/) to same folder

```console
$ ls
SHA256SUMS
SHA256SUMS.gpg
ubuntu-24.04.4-desktop-amd64.iso
```

### Step 2 (Mac, optional): verify integrity of `SHA256SUMS` using [GnuPG](https://gnupg.org/)

> Heads-up: integrity of Ubuntu’s CD Image Automatic Signing Key (2012) can be confirmed using fingerprint `8439 38DF 228D 22F7 B374  2BC0 D94A A3F0 EFE2 1092` published on https://ubuntu.com/tutorials/how-to-verify-ubuntu.

```console
$ gpg --keyid-format long --keyserver hkp://keyserver.ubuntu.com --recv-keys 0x46181433FBB75451 0xD94AA3F0EFE21092

$ gpg --keyid-format long --verify SHA256SUMS.gpg SHA256SUMS
gpg: Signature made …
gpg:                using RSA key 843938DF228D22F7B3742BC0D94AA3F0EFE21092
gpg: Good signature from "Ubuntu CD Image Automatic Signing Key (2012) <cdimage@ubuntu.com>" [unknown]
gpg: WARNING: This key is not certified with a trusted signature!
gpg:          There is no indication that the signature belongs to the owner.
Primary key fingerprint: 8439 38DF 228D 22F7 B374  2BC0 D94A A3F0 EFE2 1092
```

### Step 3 (Mac): verify integrity of `ubuntu-24.04.4-desktop-amd64.iso`

```console
$ shasum --algorithm 256 --check --ignore-missing SHA256SUMS
ubuntu-24.04.4-desktop-amd64.iso: OK
```

### Step 4 (Mac): run `ubuntu-desktop-utilities/provision-ubuntu-desktop-iso.sh /Users/sunknudsen/Downloads/ubuntu-desktop/ubuntu-24.04.4-desktop-amd64.iso`

### Step 5 (Mac): copy `ubuntu-24.04.4-desktop-amd64-autoinstall.iso` to USB flash drive using [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

### Step 6 (ThinkPad): connect Ethernet cable, USB flash drive and “SAMSUNG_MZVL4256HBJD_DD56419884D9D” disk, boot Ubuntu Desktop installer and follow instructions

### Step 7 (Mac): run `superbacked-os-utilities/superbacked-os-image.sh superbacked-os-amd64-24.04.4`

### Step 8 (Mac): sign dependencies (now including `superbacked-os/superbacked-os-amd64-24.04.4.img`)

```console
$ npm run sign-dependencies
```
