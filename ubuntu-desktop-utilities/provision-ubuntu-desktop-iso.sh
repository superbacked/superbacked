#! /bin/bash
# Used to provision Ubuntu Desktop ISO

set -o errexit

if [ "${1}" = "-h" ] || [ "${1}" = "--help" ]; then
  printf "%s\n" "Usage: provision-ubuntu-desktop-iso.sh /path/to/ubuntu-24.04.4-desktop-amd64.iso"
  exit 0
fi

if [ -z "$1" ]; then
  printf "%s\n" "Error: release is required" >&2
  exit 1
fi

release="$1"
iso=$(basename "${release}")
iso_dir=$(dirname "${release}")

printf "%s\n" "Starting Colima…"

# Pinned to the superbacked profile’s socket rather than the active
# docker context, which colima start repoints only when it actually
# starts a VM (see package.sh).
export DOCKER_HOST="unix://${HOME}/.colima/superbacked/docker.sock"

# Same flags as package.sh — whichever script starts the profile first
# creates it, and vz with Rosetta only applies at creation (the OS
# build cannot run without it).
colima start \
  --cpu 4 \
  --disk 20 \
  --memory 8 \
  --profile superbacked \
  --vm-type vz \
  --vz-rosetta

printf "%s\n" "Building Superbacked OS Docker image…"

# The container runs the baked copy of docker/provision-ubuntu-desktop-iso.sh
# — rebuilt here, as in package.sh, so the baked copy can never go stale
# and so the image exists even after a prune (a cache hit when nothing
# changed).
docker build \
  --tag superbacked-os-docker:24.04 \
  docker/

printf "%s\n" "Provisioning ${iso}…"

docker run \
  --interactive \
  --privileged \
  --rm \
  --tty \
  --volume ${iso_dir}:/isos \
  --volume $(pwd)/ubuntu-desktop-utilities:/ubuntu-desktop-utilities \
  superbacked-os-docker:24.04 \
  /root/provision-ubuntu-desktop-iso.sh ${iso}

printf "%s\n" "Stopping Colima…"

colima stop --profile superbacked

printf "%s\n" "Done"