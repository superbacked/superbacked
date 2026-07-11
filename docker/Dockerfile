# Run `docker build --tag superbacked-os-docker:24.04 .` to build image
# (rebuild whenever either COPY'd script changes — the container runs
# the baked copies, not the repository files)

FROM ubuntu:24.04

USER root

RUN apt update
RUN apt install --yes parted squashfs-tools xorriso

COPY create-superbacked-os-live-image.sh /root/create-superbacked-os-live-image.sh
COPY provision-ubuntu-desktop-iso.sh /root/provision-ubuntu-desktop-iso.sh

ENV HOME=/root

WORKDIR /root

CMD ["bash"]
