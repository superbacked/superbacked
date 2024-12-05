# Run `docker build --tag superbacked-os-packager:24.04 .` to build image

FROM ubuntu:24.04

USER root

RUN apt update
RUN apt install --yes zerofree

COPY patch.sh /root/patch.sh
COPY provision-amd64.sh /root/provision-amd64.sh
COPY provision-arm64-raspi.sh /root/provision-arm64-raspi.sh

ENV HOME=/root

WORKDIR /root

CMD ["bash"]
