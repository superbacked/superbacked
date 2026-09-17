<!--
Title: How to install Superbacked on Ubuntu Desktop
Description: Learn how to install and run Superbacked on Ubuntu Desktop
Keywords: linux, ubuntu, app, deb
Publication date: 2026-04-06T12:00:00.000Z
Category: Superbacked app
Pinned:
-->

# How to install Superbacked on Ubuntu Desktop

## Overview

This guide walks through installing and running Superbacked on Ubuntu Desktop. Superbacked is distributed as Debian package which installs dependencies automatically, including the AppArmor profile Ubuntu Desktop 23.10+ requires to run Chromium’s sandbox.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

## Setup guide

### Step 1: download Superbacked

Download latest release (`.deb`) from [superbacked.com/download](https://superbacked.com/download) and optionally [verify integrity of release](../how-to-verify-integrity-of-release/README.md).

### Step 2: install Superbacked

> Heads-up: on ARM computers (such as Raspberry Pis), replace `x64` with `arm64` in the following command. When reading this guide on GitHub, also replace the version placeholder with the [latest release](https://github.com/superbacked/superbacked/releases/latest) version.

Run following command.

```console
$ sudo apt install --yes ~/Downloads/superbacked-x64-${latestRelease}.deb
```

## Usage guide

> Heads-up: YubiKey connected while installing Superbacked must be unplugged and plugged back in before use.

Open Superbacked from the application grid or run `superbacked` in terminal to use the command-line interface.
