<!--
Title: How to run Superbacked on Ubuntu Desktop
Description: Learn how to install dependencies and run Superbacked on Ubuntu Desktop
Publication date: 2026-04-06T12:00:00.000Z
Pinned:
-->

## How to run Superbacked on Ubuntu Desktop

Superbacked is distributed as AppImage binary — a portable format that runs on most Linux distributions with no installation. On Ubuntu Desktop, two dependencies are required and AppArmor may need to be configured.

### Step 1: install dependencies

```console
$ sudo apt install --yes libfuse2 zlib1g-dev
```

`libfuse2` is required by AppImage to mount filesystem. `zlib1g-dev` is required by Superbacked for data compression.

### Step 2: download Superbacked

Download latest release from [superbacked.com/download](https://superbacked.com/download) and optionally [verify integrity of release](https://superbacked.com/guides/how-to-verify-integrity-of-release).

### Step 3: make AppImage executable and run

Right-click `.AppImage` file and select “Run as a program”.

### AppArmor and `--no-sandbox` flag

Ubuntu Desktop 24.04+ ships with AppArmor enabled by default. AppArmor restricts how AppImage binaries can execute, which may prevent Superbacked from launching.

If Superbacked does not start, run it from terminal with `--no-sandbox` flag.

```console
$ ./superbacked-x64-${latestRelease}.AppImage --no-sandbox
```

This disables Chromium sandbox used by Electron. AppArmor already provides equivalent process isolation at OS level so this does not reduce security.
