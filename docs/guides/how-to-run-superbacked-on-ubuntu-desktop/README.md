<!--
Title: How to run Superbacked on Ubuntu Desktop
Description: Learn how to install dependencies and run Superbacked on Ubuntu Desktop
Publication date: 2026-04-06T12:00:00.000Z
Pinned:
-->

# How to run Superbacked on Ubuntu Desktop

## Overview

This guide walks through installing and running Superbacked on Ubuntu Desktop. Superbacked is distributed as Debian package which installs dependencies automatically, including the AppArmor profile Ubuntu Desktop 23.10+ requires to run Chromium’s sandbox.

## Setup guide

### Step 1: download Superbacked

Download latest release from [superbacked.com/download](https://superbacked.com/download) and optionally [verify integrity of release](https://superbacked.com/guides/how-to-verify-integrity-of-release).

### Step 2: install Superbacked

> Heads-up: replace `x64` with `arm64` in the following command if applicable — and, when reading this guide on GitHub, the version placeholder with the [latest release](https://github.com/superbacked/superbacked/releases/latest) semver.

Run following command.

```console
$ sudo apt install --yes ~/Downloads/superbacked-x64-${latestRelease}.deb
```

## Usage guide

> Heads-up: YubiKey connected while installing Superbacked must be unplugged and plugged back in before use.

Open Superbacked from the application grid or run `superbacked` in terminal to use the command-line interface.
