<!--
Title: How to verify integrity of release
Description: Learn how to verify integrity of a Superbacked release using SHA256 checksums and PGP signatures
Keywords: macos, linux, release, checksum, pgp
Publication date: 2026-04-06T09:47:11.109Z
Category: Releases
Pinned:
-->

# How to verify integrity of release

## Overview

This guide walks through verifying that a downloaded Superbacked release has not been tampered with using SHA256 checksums and PGP signatures.

## Guide

### Step 1: download release’s `SHA256SUMS` and `SHA256SUMS.asc`

Download `SHA256SUMS` and `SHA256SUMS.asc` from the [release page](https://github.com/superbacked/superbacked/releases) to the same folder as the downloaded release.

```console
$ ls
SHA256SUMS
SHA256SUMS.asc
superbacked-arm64-2.0.0-rc.2.dmg
```

### Step 2 (optional): verify integrity of `SHA256SUMS` using GnuPG

> Heads-up: the integrity of Sun’s PGP public key can be confirmed using the fingerprint published on [sunknudsen.com/contact](https://sunknudsen.com/contact), [GitHub](https://github.com/sunknudsen/pgp-public-key), [Twitter](https://twitter.com/sunknudsen) and [YouTube](https://www.youtube.com/sunknudsen/about).

Import Sun’s PGP public key and verify the signature.

```console
$ curl --location --proto '=https' https://sunknudsen.com/sunknudsen.asc | gpg --import
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100   167    0   167    0     0   2088      0 --:--:-- --:--:-- --:--:--  2113
100  1302  100  1302    0     0   5948      0 --:--:-- --:--:-- --:--:--  5948
gpg: key 8C9CA674C47CA060: public key "Sun Knudsen <hello@sunknudsen.com>" imported
gpg: Total number processed: 1
gpg:               imported: 1

$ gpg --verify --with-fingerprint SHA256SUMS.asc
gpg: assuming signed data in 'SHA256SUMS'
gpg: Signature made Thu 17 Sep 14:25:22 2026 EDT
gpg:                using EDDSA key 9C7887E1B5FCBCE2DFED0E1C02C43AD072D57783
gpg: Good signature from "Sun Knudsen <hello@sunknudsen.com>" [unknown]
gpg: WARNING: This key is not certified with a trusted signature!
gpg:          There is no indication that the signature belongs to the owner.
Primary key fingerprint: E786 274B C92B 47C2 3C1C  F44B 8C9C A674 C47C A060
     Subkey fingerprint: 9C78 87E1 B5FC BCE2 DFED  0E1C 02C4 3AD0 72D5 7783
```

Verify the output shows `Good signature from "Sun Knudsen <hello@sunknudsen.com>"` and the primary key fingerprint matches `E786 274B C92B 47C2 3C1C F44B 8C9C A674 C47C A060`.

### Step 3: verify integrity of release

> Heads-up: on Linux, run `sha256sum --check --ignore-missing SHA256SUMS` instead.

Run following command.

```console
$ shasum --algorithm 256 --check --ignore-missing SHA256SUMS
./superbacked-arm64-2.0.0-rc.2.dmg: OK
```

Verify the output shows `OK` for the downloaded release.
