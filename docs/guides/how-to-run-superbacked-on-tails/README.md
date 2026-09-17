<!--
Title: How to run Superbacked on Tails
Description: Learn how to run Superbacked on Tails (limited printing support)
Keywords: linux, tails, app, appimage
Publication date: 2026-04-06T12:00:00.000Z
Category: Superbacked app
Pinned:
-->

# How to run Superbacked on Tails

## Overview

This guide walks through downloading and running Superbacked on Tails. Superbacked is distributed as AppImage binary — a portable format that runs on Tails with no installation.

> Heads-up: Tails has limited printing support. Printing blocks may not work as expected depending on printer configuration. Consider saving blocks and printing from another computer or, preferably, use [Superbacked OS](https://superbacked.com/superbacked-os) which has better printer support.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

## Setup guide

### Step 1: download Superbacked

Download latest release (`.AppImage`) from [superbacked.com/download](https://superbacked.com/download) and optionally [verify integrity of release](../how-to-verify-integrity-of-release/README.md).

### Step 2 (optional): grant access to YubiKey

> Heads-up: this step is only required when using YubiKey features and requires administration password to be set using welcome screen when starting Tails.

Run following command — a YubiKey already connected must then be unplugged and plugged back in.

```console
$ sudo tee /etc/udev/rules.d/70-superbacked-yubikey.rules << 'EOF'
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1050", TAG+="uaccess"
EOF
```

### Step 3 (optional): make `superbacked` command available in terminal

> Heads-up: when reading this guide on GitHub, replace the version placeholder in the following command with the [latest release](https://github.com/superbacked/superbacked/releases/latest) version.

> Heads-up: Tails does not ship wl-clipboard, so commands that copy to the clipboard need `--print` (or install wl-clipboard using `sudo apt install wl-clipboard`).

Install the AppImage as `superbacked` in `~/.local/bin` (created if missing) and reload the profile so `~/.local/bin` is on the path by running following commands — `superbacked --help` then lists commands.

```console
$ install -D -m 755 "$HOME/Downloads/superbacked-x64-${latestRelease}.AppImage" "$HOME/.local/bin/superbacked"

$ source "$HOME/.profile"
```

## Usage guide

Right-click `.AppImage` file and select “Run” or run `superbacked` in terminal to use the command-line interface (see [step 3](#step-3-optional-make-superbacked-command-available-in-terminal)).
