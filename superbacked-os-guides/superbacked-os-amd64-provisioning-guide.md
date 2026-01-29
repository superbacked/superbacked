# Superbacked OS amd64 base image provisioning guide

### Step 1 (Mac): download [Ubuntu 24.04.3 LTS](https://ubuntu.com/download/desktop)

### Step 2 (Mac): run `ubuntu-desktop-utilities/provision-ubuntu-desktop-iso.sh /Users/sunknudsen/Downloads/ubuntu-desktop/ubuntu-24.04.3-desktop-amd64.iso`

### Step 3 (Mac): copy `ubuntu-24.04.3-desktop-amd64-autoinstall.iso` to USB flash drive using [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

### Step 4 (ThinkPad): connect Ethernet cable, USB flash drive and “SAMSUNG_MZVL4256HBJD_DD56419884D9D” disk, boot Ubuntu Desktop installer and follow instructions

### Step 5 (Mac): run `superbacked-os-utilities/superbacked-os-image.sh superbacked-os-amd64-24.04.3`
