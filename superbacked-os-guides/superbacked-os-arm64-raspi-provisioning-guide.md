# Superbacked OS amd64 base image provisioning guide

### Step 1 (Mac): download [Ubuntu 24.04.3 LTS](https://ubuntu.com/download/raspberry-pi)

### Step 2 (Mac): run `ubuntu-desktop-utilities/provision-ubuntu-desktop-for-raspberry-pi-image.sh /Users/sunknudsen/Downloads/ubuntu-desktop-for-raspberry-pi/ubuntu-24.04.3-preinstalled-desktop-arm64+raspi.img.xz`

### Step 3 (Mac): copy `ubuntu-24.04.3-preinstalled-desktop-arm64+raspi.img` to “SAMSUNG_MZVL4256HBJD” disk using [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

### Step 4 (Raspberry Pi): connect Ethernet cable and “SAMSUNG_MZVL4256HBJD” disk and follow instructions.

### Step 5 (Mac): run `superbacked-os-utilities/superbacked-os-image.sh superbacked-os-arm64-raspi-24.04.3`
