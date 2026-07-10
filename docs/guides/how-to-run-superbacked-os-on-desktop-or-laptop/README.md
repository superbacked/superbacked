<!--
Title: How to run Superbacked OS on desktop or laptop
Description: Learn how to run Superbacked OS on any 64-bit Intel or AMD desktop or laptop
Publication date: 2026-01-29T17:55:20.856Z
Pinned: 1
-->

# How to run Superbacked OS on desktop or laptop

## Overview

This guide walks through flashing Superbacked OS to a USB drive and booting from dedicated hardware. Superbacked OS prevents data exfiltration and data persistence by booting air-gapped by default (hardened browser mode, used for tasks such as backing up TOTP secrets, is a deliberate choice) and persisting nothing to disk. Superbacked OS runs entirely from memory — the USB flash drive can be unplugged as soon as the login screen appears.

## Requirements

- Computer compatible with Ubuntu 24.04.4 LTS
- 8 GB of memory or more (4 GB min using tethered workaround)
- USB flash drive (used to run Superbacked OS, 16 GB min, faster is better)
- [Brother HL-L2460DW](https://www.brother-usa.com/products/hll2460dw) or equivalent USB printer (used to print blocks)
- Plug-and-play or built-in webcam (1080p min)

## Recommendations (optional)

Physically removing internal disk(s) and wireless interface(s) if not soldered to motherboard or disabling interface(s) using BIOS if soldered is recommended to disable data persistence and network connectivity at the hardware level.

Running Superbacked OS on flash drive with signed firmware and write protection enabled such as [Kanguru FlashTrust™ Secure Firmware USB 3.0 Flash Drive (WP-KFT3-16G)](https://www.kanguru.com/products/kanguru-flashtrust-secure-firmware-usb-3-0-flash-drive) is recommended.

## Setup guide

### Step 1: install [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

#### macOS or Windows

Go to https://www.raspberrypi.com/software/, download and install Raspberry Pi Imager.

#### Ubuntu

> Heads-up: depends on [Qt](https://www.qt.io/).

```console
$ sudo add-apt-repository --yes universe

$ sudo apt install --yes rpi-imager
```

### Step 2 (optional): opt out of Raspberry Pi Imager [telemetry](https://github.com/raspberrypi/rpi-imager#opting-out)

Select “App Options”, disable “Enable anonymous statistics (telemetry) collection” and click “Save”.

### Step 3: download Superbacked OS

> Heads-up: for additional security, [verify integrity of release](https://superbacked.com/guides/how-to-verify-integrity-of-release).

#### macOS or Ubuntu

```console
$ cd ~/Downloads

$ part=1; \
  url="https://github.com/superbacked/superbacked/releases/download/v${latestRelease}/superbacked-os-amd64-live-${latestRelease}.img.part"; \
  while curl --fail --head --location --output /dev/null --retry 3 --silent "${url}${part}"; do \
    curl --fail --location "${url}${part}" || break; \
    part=$((part + 1)); \
  done > superbacked-os-amd64-live-${latestRelease}.img
```

#### Windows

> Heads-up: requires WSL to be [installed](https://learn.microsoft.com/en-us/windows/wsl/install) first using `wsl --install` (if applicable).

> Heads-up: replace `Sun Knudsen` with your username.

```console
$ wsl

$ cd /mnt/c/Users/Sun\ Knudsen/Downloads

$ part=1; \
  url="https://github.com/superbacked/superbacked/releases/download/v${latestRelease}/superbacked-os-amd64-live-${latestRelease}.img.part"; \
  while curl --fail --head --location --output /dev/null --retry 3 --silent "${url}${part}"; do \
    curl --fail --location "${url}${part}" || break; \
    part=$((part + 1)); \
  done > superbacked-os-amd64-live-${latestRelease}.img
```

### Step 4: copy Superbacked OS to USB flash drive

Open “Raspberry Pi Imager”, click “OS”, then “Use custom”, select `superbacked-os-amd64-live-${latestRelease}.img`, click “Storage”, select USB flash drive, click “NEXT”, then “WRITE” and, finally, click “I UNDERSTAND, ERASE AND WRITE”.

![Raspberry Pi Imager, release semver may differ](./assets/raspberry-pi-imager.png)

### Step 5 (optional): enable write protection

If using Kanguru FlashTrust™ Secure Firmware USB 3.0 Flash Drive or equivalent, enable write protection.

## Computer provisioning guide

### Step 1 (optional): physically remove internal disk(s) and wireless interface(s) if not soldered to motherboard or disable interface(s) using BIOS if soldered

![I/O Port Access, BIOS menu may differ](./assets/turn-off-i-o-port-access.png)

### Step 2 (if applicable): enable “Secure Boot” and disable “Boot Order Lock”

![Secure Boot, BIOS menu may differ](./assets/enable-secure-boot.png)

![Boot Order Lock, BIOS menu may differ](./assets/disable-boot-order-lock.png)

### Step 3: boot Superbacked OS

### Step 4: reboot

### Step 5 (if applicable): enable “Boot Order Lock”

![Boot Order Lock, BIOS menu may differ](./assets/enable-boot-order-lock.png)

## Usage guide

### Step 1 (if applicable): unplug Ethernet cable

### Step 2: boot Superbacked OS and select mode

> Heads-up: password is “superbacked”.

Superbacked OS runs in two modes: air-gapped (default, booted automatically) and hardened browser (a deliberate choice, used for tasks such as backing up TOTP secrets).

Both modes copy Superbacked OS to memory (8 GB or more required) — the USB flash drive can be unplugged as soon as the login screen appears.

> Heads-up: on computers with less than 8 GB of memory (4 GB min), select mode at boot menu, press “e”, remove `toram` from the line starting with `linux` and press “F10” — Superbacked OS then runs from the USB flash drive, which must stay plugged in for the whole session (equally amnesic, nothing persists across reboots).

### Step 3: use Superbacked

If scanning blocks does not work, please try using a higher quality 1080p webcam such as the [Razer Kiyo X](https://www.razer.com/streaming-cameras/razer-kiyo-x).
