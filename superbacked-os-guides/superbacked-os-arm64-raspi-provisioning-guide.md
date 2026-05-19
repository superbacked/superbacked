# Superbacked OS amd64 base image provisioning guide

### Step 1 (Mac): download `ubuntu-24.04.4-preinstalled-desktop-arm64+raspi.img.xz`, `SHA256SUMS` and `SHA256SUMS.gpg` from [Ubuntu 24.04 LTS cdimage releases](https://cdimage.ubuntu.com/releases/24.04/release/) to same folder

```console
$ ls
SHA256SUMS
SHA256SUMS.gpg
ubuntu-24.04.4-preinstalled-desktop-arm64+raspi.img.xz
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

### Step 3 (Mac): verify integrity of `ubuntu-24.04.4-preinstalled-desktop-arm64+raspi.img.xz`

```console
$ shasum --algorithm 256 --check --ignore-missing SHA256SUMS
ubuntu-24.04.4-preinstalled-desktop-arm64+raspi.img.xz: OK
```

### Step 4 (Mac): run `ubuntu-desktop-utilities/provision-ubuntu-desktop-for-raspberry-pi-image.sh /Users/sunknudsen/Downloads/ubuntu-desktop-for-raspberry-pi/ubuntu-24.04.4-preinstalled-desktop-arm64+raspi.img.xz`

### Step 5 (Mac): copy `ubuntu-24.04.4-preinstalled-desktop-arm64+raspi.img` to “SAMSUNG_MZVL4256HBJD” disk using [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

### Step 6 (Raspberry Pi): connect Ethernet cable and “SAMSUNG_MZVL4256HBJD” disk, boot Ubuntu Desktop installer and follow instructions

### Step 7 (Mac): run `superbacked-os-utilities/superbacked-os-image.sh superbacked-os-arm64-raspi-24.04.4`

### Step 8 (Mac): sign dependencies (now including `superbacked-os/superbacked-os-arm64-raspi-24.04.4.img`)

```console
$ npm run sign-dependencies
```
