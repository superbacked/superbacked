#! /bin/bash
# Used to patch Ubuntu for desktops 24.04.3 LTS (amd64)
#
# Usage:
# bash -c "$(curl -fsSL https://github.com/superbacked/superbacked/releases/download/v__VERSION__/superbacked-os-amd64-bootstrap-__VERSION__.sh)"

set -e
set -o pipefail

printf "%s\n" "Configuring GNOME…"

gsettings set org.gnome.desktop.background picture-uri 'none'
gsettings set org.gnome.desktop.background picture-uri-dark 'none'
gsettings set org.gnome.desktop.background primary-color '#000000'
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
gsettings set org.gnome.desktop.media-handling automount false
gsettings set org.gnome.desktop.privacy remember-app-usage false
gsettings set org.gnome.desktop.privacy remember-recent-files false
gsettings set org.gnome.desktop.privacy report-technical-problems false
gsettings set org.gnome.desktop.privacy send-software-usage-stats false
gsettings set org.gnome.desktop.privacy usb-protection true
gsettings set org.gnome.desktop.privacy usb-protection-level 'lockscreen'
gsettings set org.gnome.mutter center-new-windows true
gsettings set org.gnome.system.location enabled false
gsettings set \
  org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/ \
  background-color 'rgb(0,0,0)'
gsettings set \
  org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/ \
  foreground-color 'rgb(255,255,255)'
gsettings set \
  org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:b1dcc9dd-5262-4d8d-a863-c897e6d979b9/ \
  use-theme-colors false
gsettings set \
  org.gnome.Terminal.ProfilesList default 'b1dcc9dd-5262-4d8d-a863-c897e6d979b9'
gsettings set \
  org.gnome.Terminal.ProfilesList list "['b1dcc9dd-5262-4d8d-a863-c897e6d979b9']"

printf "%s\n" "Adding universe repository…"

sudo add-apt-repository --yes universe

printf "%s\n" "Updating Ubuntu…"

sudo apt update
sudo apt upgrade --yes

printf "%s\n" "Installing dependencies…"

sudo apt install --yes \
  build-essential \
  curl \
  exfatprogs \
  language-pack-en \
  language-pack-fr \
  language-pack-pt \
  language-pack-sv \
  language-pack-gnome-en \
  language-pack-gnome-fr \
  language-pack-gnome-pt \
  language-pack-gnome-sv \
  libfuse2 \
  libpcsclite-dev \
  overlayroot \
  pcscd \
  pipx \
  python3-dev \
  scdaemon \
  zlib1g-dev

pipx ensurepath

pipx install trezor yubikey-manager

printf "%s\n" "Configuring udev rules…"

sudo curl https://data.trezor.io/udev/51-trezor.rules \
  --output /etc/udev/rules.d/51-trezor.rules
sudo curl https://raw.githubusercontent.com/Yubico/libfido2/main/udev/70-u2f.rules \
  --output /etc/udev/rules.d/70-u2f.rules

printf "%s\n" "Configuring yubikey-prov.sh…"

mkdir --parents /home/superbacked/.local/bin/

curl https://raw.githubusercontent.com/sunknudsen/yubikey-prov/main/yubikey-prov.sh \
  --output /home/superbacked/.local/bin/yubikey-prov.sh

chmod +x /home/superbacked/.local/bin/yubikey-prov.sh

printf "%s\n" "Uninstalling extraneous software…"

sudo apt remove --purge --yes \
  apport \
  build-essential \
  curl \
  libpcsclite-dev \
  python3-dev \
  unattended-upgrades \
  update-manager \
  update-manager-core \
  update-notifier \
  update-notifier-common \
  whoopsie \
  firefox* \
  thunderbird*

sudo apt autoremove --purge --yes

sudo apt clean

sudo snap remove --purge firefox thunderbird

printf "%s\n" "Configuring fstab…"

sudo sed --in-place 's/ext4 defaults/ext4 defaults,noload,ro/g' /etc/fstab
sudo sed --in-place 's/vfat defaults/vfat defaults,ro/g' /etc/fstab

sudo cat /etc/fstab

printf "%s\n" "Disabling fsck.repair and enabling read-only…"

sudo sed --in-place 's/quiet splash/quiet splash fsck.repair=no ro/g' /etc/default/grub

sudo update-grub

sudo cat /boot/grub/grub.cfg

printf "%s\n" "Configuring overlayroot…"

sudo sed --in-place 's/overlayroot=""/overlayroot="tmpfs"/g' /etc/overlayroot.conf

printf "%s\n" "Disabling networking…"

sudo systemctl enable nftables
sudo systemctl start nftables

sudo nft flush ruleset

sudo nft add table inet filter
sudo nft add chain inet filter input '{ type filter hook input priority 0; policy drop; }'
sudo nft add chain inet filter forward '{ type filter hook forward priority 0; policy drop; }'
sudo nft add chain inet filter output '{ type filter hook output priority 0; policy drop; }'

sudo nft add rule inet filter input iif lo accept
sudo nft add rule inet filter output oif lo accept

sudo nft list ruleset | sudo tee /etc/nftables.conf

version="__VERSION__"

# Skip app install unless version has been set by package.sh
if [ "${version}" != "__""VERSION""__" ]; then
  printf "%s\n" "Installing Superbacked app…"

  curl \
    --location \
    --output "/tmp/superbacked-os-amd64-bootstrap-assets-${version}.tar.gz" \
    "https://github.com/superbacked/superbacked/releases/download/v${version}/superbacked-os-amd64-bootstrap-assets-${version}.tar.gz"

  sudo tar \
    --extract \
    --gzip \
    --file "/tmp/superbacked-os-amd64-bootstrap-assets-${version}.tar.gz" \
    --directory /

  rm "/tmp/superbacked-os-amd64-bootstrap-assets-${version}.tar.gz"
fi

printf "%s\n" "Disabling sudo…"

sudo deluser superbacked sudo

printf "%s\n" "Purging Bash history…"

history -cw

printf "%s\n" "Creating bootstrap completion marker…"

mkdir --parents /home/superbacked/.config

touch /home/superbacked/.config/superbacked-os-bootstrap.done

printf "%s\n" "Bootstrap complete—please reboot to apply changes"

read -p "Press enter to reboot…" -r

systemctl reboot