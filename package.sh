#! /bin/bash
# Used to package Superbacked

set -e
set -o pipefail

printf "%s\n" "Purging dist and out folders…"

find ./{dist,out} ! -name .borgignore -delete

printf "%s\n" "Building Superbacked app…"

npm run build

rename 's/x86_64/x64/' dist/*.AppImage

version=$(node --eval 'console.log(require("./package.json").version)')

code dist/superbacked-${version}-release-notes.txt

printf "%s" "Edit release notes, insert YubiKey and press enter to sign release… "

read -r answer

npm run sign-release

printf "%s\n" "Done"