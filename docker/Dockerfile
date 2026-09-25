# Superbacked OS build container — built as superbacked-os-docker:24.04
# by package.sh at every OS build

FROM ubuntu:24.04

USER root

RUN apt update
RUN apt install --yes parted squashfs-tools xorriso

COPY create-superbacked-os-live-image.sh /root/create-superbacked-os-live-image.sh
COPY provision-ubuntu-desktop-iso.sh /root/provision-ubuntu-desktop-iso.sh

ENV HOME=/root

WORKDIR /root

CMD ["bash"]
