# Superbacked OS ARM64-raspi provisioning guide

### Step 1: download [Ubuntu 24.04.1 LTS](https://ubuntu.com/download/raspberry-pi) to `~/Downloads/patch` and double-click `ubuntu-24.04.1-preinstalled-desktop-arm64+raspi.img.xz` and move `ubuntu-24.04.1-preinstalled-desktop-arm64+raspi.img` to ~/Downloads/patch folder

### Step 2: patch Ubuntu 24.04.1 LTS using `./patch-fstab.sh`

### Step 3: write patched OS to microSD card using [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

### Step 4: boot Ubuntu 24.04.1 LTS (Intel) and select “Try Ubuntu”

### Step 5: open GParted, insert microSD card, refresh devices and grow `ext4` partition to 10240MiB

### Step 6: boot Ubuntu 24.04.1 LTS (Raspberry Pi 4 or 5, 4GB recommended)

### Step 7: Set name to “Superbacked”, computer name to “superbacked-os”, username and password to “superbacked” and select “Log in automatically”

### Step 8: select “No, don’t send system data”

### Step 9: update Ubuntu 24.04.1 LTS using `update-manager` without rebooting

### Step 10: insert USB flash drive with `superbacked-os-utilities`, cd to `superbacked-os-utilities` and run `source superbacked-os-arm64-raspi-bootstrap.sh`

### Step 11: boot Ubuntu 24.04.1 LTS (Intel) and select “Try Ubuntu”

### Step 12: insert USB flash drive with `superbacked-os-utilities`, cd to directory and run `./superbacked-os-image.sh superbacked-os-arm64-raspi-24.04.1`.
