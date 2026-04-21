<!--
Title: How to run Superbacked on factory-reset Mac
Description: Learn how to run Superbacked on a factory reset Apple silicon Mac running macOS Sequoia or Tahoe
Publication date: 2026-04-17T12:00:00.000Z
Pinned: 3
-->

# How to run Superbacked on factory-reset Mac

## Overview

> Heads-up: factory resetting Mac erases all data. Back up anything important before proceeding.

> Heads-up: for high-stakes secrets, use [Superbacked OS](https://superbacked.com/superbacked-os) — a hardened operating system that runs offline and persists nothing to disk.

This guide walks through factory resetting an Apple silicon Mac, downloading Superbacked, going offline and factory resetting Mac again after use.

Disconnecting from the internet prevents data exfiltration and factory resetting after use prevents data persistence.

Guide below is for macOS Sequoia — exact steps may differ for Tahoe.

## Requirements

- Apple silicon MacBook Air or MacBook Pro (M1 or later) running macOS Sequoia or Tahoe
- Ethernet cable and USB-C to Ethernet adapter (preferred) or Wi-Fi network (used to download Superbacked, disconnected before using Superbacked)
- [Brother HL-L2460DW](https://www.brother-usa.com/products/hll2460dw) or equivalent USB printer (used to print blocks)

## Guide

### Step 1: factory reset Mac

Open “System Settings”, click “General”, click “Transfer or Reset” and click “Erase All Content and Settings”. Follow prompts to complete factory reset.

Mac will restart into Setup Assistant.

### Step 2: set up macOS

> Heads-up: if familiar with macOS hardening, connect to the internet, skip Apple ID, disable location services, analytics, Siri and Apple Intelligence, then continue to [step 3](#step-3-download-superbacked).

On “Activate Mac” connect Ethernet cable or connect to Wi-Fi network and click “Next” then “Restart”.

On “Language” select language and click right arrow.

On “Select Your Country or Region” select country.

On “Transfer Your Data to This Mac” select “Set up as new”.

On “Written and Spoken Languages” click “Continue”.

On “Accessibility” select “Not Now”.

On “Select Your Wi-Fi Network” connect Ethernet cable and click “Continue” or select Wi-Fi network, enter password and click “Continue”.

On “Data & Privacy” click “Continue”.

On “Create a Mac Account” enter full name and password, disable “Allow computer account password to be reset with your Apple Account” and click “Continue”.

On “Sign In to Your Apple Account” click “Set Up Later” then “Skip”.

On “Terms and Conditions” click “Agree” then “Agree” again.

On “Enable Location Services” disable “Enable Location Services on this Mac” and click “Don’t Use”.

On “Select Your Time Zone” type closest city and click “Continue”.

On “Analytics” disable “Share Mac Analytics with Apple” and “Share crash and usage data with app developers” and click “Continue”.

On “Screen Time” click “Set Up Later”.

On “Apple Intelligence” click “Set Up Later”.

On “Siri” disable “Enable Ask Siri” and click “Continue”.

On “Touch ID” click “Set Up Touch ID Later” then “Continue”.

On “Choose Your Look” select “Dark” and click “Continue”.

On “Update Mac Automatically” select “Only Download Automatically”.

On “Welcome to Mac” click “Continue”.

### Step 3: download Superbacked

Open Safari and download latest release from [superbacked.com/download](https://superbacked.com/download) and optionally [verify integrity of release](https://superbacked.com/guides/how-to-verify-integrity-of-release).

### Step 4: disconnect from the internet

If using Ethernet, unplug Ethernet cable.

If using Wi-Fi, open “System Settings”, click “Wi-Fi”, click ellipsis menu of connected network and click “Forget This Network”. Disable Wi-Fi using toggle.

Mac is now offline — secrets can be handled safely.

### Step 5: install and run Superbacked

> Heads-up: macOS may display a security prompt. Click “Open” to proceed — release is cryptographically signed and notarized by Apple.

Double-click downloaded `.dmg` file, drag “Superbacked” to “Applications” folder, open “Applications” folder and double-click “Superbacked”.

### Step 6: connect printer

Connect USB printer to Mac. macOS should detect printer automatically via AirPrint — no driver installation required.

### Step 7: use Superbacked

Create blocks, blocksets or standalone archives as needed. For detailed instructions, see [overview](https://superbacked.com/overview) and [use cases](https://superbacked.com/use-cases).

### Step 8: factory reset Mac

> Heads-up: do not skip this step. Even though Superbacked does not persist secrets to disk intentionally, macOS may cache data in CUPS print spool files, swap files or other system-managed locations.

Complete [step 1](#step-1-factory-reset-mac) again.
