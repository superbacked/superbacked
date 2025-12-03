#! /bin/bash
# Used to configure Opal-compliant disk as read-only

set -e

bold=$(tput bold)
normal=$(tput sgr0)
red=$(tput setaf 1)

if [ "$1" = "--help" ]; then
  printf "%s\n" "Usage: superbacked-os-configure-opal.sh"
  exit 0
fi

sudo sedutil-cli --scan

printf "$bold%s$normal" "What Opal-compliant disk do you wish to configure as read-only (example: sda)? "
read -r source_disk

printf "$bold%s$normal" "What passphrase do you wish to use? "
read -r passphrase

sudo sedutil-cli --initialSetup "$passphrase" /dev/$source_disk
sudo sedutil-cli --readonlyLockingRange 0 "$passphrase" /dev/$source_disk
sudo sedutil-cli --setMBREnable off "$passphrase" /dev/$source_disk

printf "%s\n" "Rebooting in 10 seconds…"

sleep 10

systemctl reboot
