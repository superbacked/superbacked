#! /bin/bash
# Used to disable Raspberry Pi filesystem expansion

set -e

printf "%s\n" "Starting Colima…"

colima start \
  --profile superbacked \
  --cpu 4 \
  --disk 100 \
  --memory 8

printf "%s\n" "Disabling Raspberry Pi filesystem expansion…"

docker run \
  --interactive \
  --privileged \
  --rm \
  --tty \
  --volume $HOME/Downloads/patch:/patch \
  superbacked-os-packager:24.04 \
  /root/patch.sh

printf "%s\n" "Stopping Colima…"

colima stop --profile superbacked

printf "%s\n" "Done"