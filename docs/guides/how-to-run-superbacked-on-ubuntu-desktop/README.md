<!--
Title: How to run Superbacked on Ubuntu Desktop
Description: Learn how to install dependencies and run Superbacked on Ubuntu Desktop
Publication date: 2026-04-06T12:00:00.000Z
Pinned:
-->

# How to run Superbacked on Ubuntu Desktop

## Overview

This guide walks through installing dependencies and running Superbacked on Ubuntu Desktop. Superbacked is distributed as AppImage binary — a portable format that requires two dependencies and AppArmor may need to be configured.

## Setup guide

### Step 1: install dependencies

```console
$ sudo apt install --yes libfuse2 zlib1g-dev
```

### Step 2: download Superbacked

Download latest release from [superbacked.com/download](https://superbacked.com/download) and optionally [verify integrity of release](https://superbacked.com/guides/how-to-verify-integrity-of-release).

## Usage guide

> Heads-up: Ubuntu Desktop 23.10+ ships with AppArmor restrictions on unprivileged user namespaces that may prevent Superbacked from launching. The cleanest fix is to use Superbacked OS, which comes pre-configured. On regular Ubuntu Desktop, either install an AppArmor profile granting Superbacked the userns capability (preserves Chromium’s sandbox) or run from terminal with --no-sandbox flag (easiest but weakens renderer isolation).

Right-click `.AppImage` file and select “Run as a program”.
