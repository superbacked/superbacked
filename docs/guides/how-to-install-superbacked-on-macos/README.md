<!--
Title: How to install Superbacked on macOS
Description: Learn how to install and run Superbacked on macOS
Keywords: macos, app, dmg
Publication date: 2026-09-17T12:00:00.000Z
Category: Superbacked app
Pinned:
-->

# How to install Superbacked on macOS

## Overview

This guide walks through installing and running Superbacked on macOS. Superbacked is distributed as disk image (`.dmg`) which is cryptographically signed and notarized by Apple.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

## Setup guide

### Step 1: download Superbacked

Download latest release (`.dmg`) from [superbacked.com/download](https://superbacked.com/download) and optionally [verify integrity of release](../how-to-verify-integrity-of-release/README.md).

### Step 2: install Superbacked

Double-click downloaded `.dmg` file and drag “Superbacked” to “Applications” folder.

### Step 3 (optional): make `superbacked` command available in terminal

Add a persistent alias to the app binary by running following commands once — `superbacked --help` then lists commands.

```console
$ echo 'alias superbacked="/Applications/Superbacked.app/Contents/MacOS/Superbacked"' >> "$HOME/.zshrc"

$ source "$HOME/.zshrc"
```

## Usage guide

> Heads-up: macOS may display a security prompt. Click “Open” to proceed — release is cryptographically signed and notarized by Apple.

Open Superbacked from “Applications” folder or run `superbacked` in terminal to use the command-line interface (see [step 3](#step-3-optional-make-superbacked-command-available-in-terminal)).
