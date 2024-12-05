#! /bin/bash
# Used to disable Raspberry Pi filesystem expansion

set -e

docker run \
  --interactive \
  --privileged \
  --rm \
  --tty \
  --volume $HOME/Downloads/patch:/patch \
  superbacked-os-packager:24.04 \
  /root/patch.sh

printf "%s\n" "Done"