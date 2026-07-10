# Run `docker build --tag superbacked-os-docker:24.04 .` to build image

FROM ubuntu:24.04

USER root

RUN apt update
RUN apt install --yes bc parted squashfs-tools xorriso zerofree

COPY create-live-image.sh /root/create-live-image.sh
COPY optimize-image.sh /root/optimize-image.sh
COPY provision-ubuntu-desktop-iso.sh /root/provision-ubuntu-desktop-iso.sh
COPY provision-superbacked-os.sh /root/provision-superbacked-os.sh

ENV HOME=/root

WORKDIR /root

CMD ["bash"]
