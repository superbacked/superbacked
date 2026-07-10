# Run `docker build --tag superbacked-os-docker:24.04 .` to build image

FROM ubuntu:24.04

USER root

RUN apt update
RUN apt install --yes bc parted squashfs-tools xorriso

COPY create-superbacked-os-live-image.sh /root/create-superbacked-os-live-image.sh
COPY provision-ubuntu-desktop-iso.sh /root/provision-ubuntu-desktop-iso.sh

ENV HOME=/root

WORKDIR /root

CMD ["bash"]
