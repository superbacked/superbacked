#! /bin/bash
# Used to provision Ubuntu Desktop ISO

set -o errexit

iso="$1"

printf "%s\n" "Starting ISO provisioning…"

printf "%s\n" "Extracting ISO contents…"

mkdir --parents /tmp/iso

xorriso -osirrox on -indev "/isos/${iso}" -extract / /tmp/iso

printf "%s\n" "Reading boot configuration from ${iso}…"

xorriso -indev "/isos/${iso}" -report_el_torito as_mkisofs > /tmp/boot-config.txt 2>/dev/null

printf "%s\n" "Copying autoinstall.yaml…"

cp /ubuntu-desktop-utilities/autoinstall.yaml /tmp/iso/autoinstall.yaml

printf "%s\n" "Creating modified ISO…"

xargs xorriso -as mkisofs -o "/isos/${iso%.iso}-autoinstall.iso" /tmp/iso < /tmp/boot-config.txt

printf "%s\n" "Cleaning up…"

rm --force --recursive /tmp/iso

printf "%s\n" "ISO provisioning complete"