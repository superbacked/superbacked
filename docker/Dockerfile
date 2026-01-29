# Run `docker build --tag superbacked-os-docker:24.04 .` to build image

FROM ubuntu:24.04

USER root

RUN apt update
RUN apt install --yes bc parted xorriso zerofree

COPY optimize-image.sh /root/optimize-image.sh
COPY provision-ubuntu-desktop-for-raspberry-pi-image.sh /root/provision-ubuntu-desktop-for-raspberry-pi-image.sh
COPY provision-ubuntu-desktop-iso.sh /root/provision-ubuntu-desktop-iso.sh
COPY provision-superbacked-os.sh /root/provision-superbacked-os.sh

ENV HOME=/root

WORKDIR /root

CMD ["bash"]
