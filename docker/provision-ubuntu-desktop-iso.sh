#! /bin/bash
# Used to provision Ubuntu Desktop ISO

set -e

iso="$1"

printf "%s\n" "Extracting ISO contents…"

mkdir -p /tmp/iso

xorriso -osirrox on -indev "/isos/${iso}" -extract / /tmp/iso

printf "%s\n" "Reading boot configuration from ${iso}…"

xorriso -indev "/isos/${iso}" -report_el_torito as_mkisofs > /tmp/boot-config.txt 2>/dev/null

printf "%s\n" "Copying superbacked-os-amd64-bootstrap.sh…"

cp /superbacked-os-utilities/superbacked-os-amd64-bootstrap.sh /tmp/iso/superbacked-os-amd64-bootstrap.sh

printf "%s\n" "Copying superbacked-os-bootstrap.service…"

cp /superbacked-os-utilities/superbacked-os-bootstrap.service /tmp/iso/superbacked-os-bootstrap.service

printf "%s\n" "Copying autoinstall.yaml…"

cp /ubuntu-desktop-utilities/autoinstall.yaml /tmp/iso/autoinstall.yaml

printf "%s\n" "Creating modified ISO…"

xargs xorriso -as mkisofs -o "/isos/${iso%.iso}-autoinstall.iso" /tmp/iso < /tmp/boot-config.txt

printf "%s\n" "Cleaning up…"

rm -rf /tmp/iso