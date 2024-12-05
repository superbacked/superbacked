# Superbacked OS AMD64 provisioning guide

### Step 1: download [Ubuntu 24.04.1 LTS](https://ubuntu.com/download/desktop) and flash OS to USB flash drive using [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

### Step 2: boot Ubuntu 24.04.1 LTS and select “Try Ubuntu”

### Step 3: using GParted, delete all partitions, apply changes and create `msdos` partition table

### Step 4: install Ubuntu 24.04.1 LTS

#### Select “Interactive installation”, “Default selection”, do not install recommended proprietary software, select “Manual installation”, select “Device for boot loader installation”, change size of FAT32 partition to 536870912B and create 10737418240B Ext4 partition with `/` mount point

#### Set name to “Superbacked”, computer name to “superbacked-os”, username and password to “superbacked” and disable “Required my password to log in”

### Step 5: boot installed Ubuntu 24.04.1 LTS

### Step 6: select “No, don’t send system data”

### Step 7: update Ubuntu 24.04.1 LTS using `update-manager` without rebooting

### Step 9: insert USB flash drive with `superbacked-os-utilities`, cd to `superbacked-os-utilities` and run `source superbacked-os-amd64-bootstrap.sh`.

### Step 10: boot Ubuntu 24.04.1 LTS and select “Try Ubuntu”

### Step 11: insert USB flash drive with `superbacked-os-utilities`, cd to directory and run `./superbacked-os-image.sh superbacked-os-amd64-24.04.1`.
