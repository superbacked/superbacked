<!--
Title: How to verify integrity of release
Description: Learn how to verify integrity of a Superbacked release using SHA256 checksums and PGP signatures
Publication date: 2026-04-06T09:47:11.109Z
Pinned: 3
-->

## How to verify integrity of release

Every Superbacked release is PGP-signed by Sun Knudsen. This guide walks through verifying that a downloaded release has not been tampered with.

### Step 1: download release’s `SHA256SUMS` and `SHA256SUMS.asc`

Download `SHA256SUMS` and `SHA256SUMS.asc` from the [release page](https://github.com/superbacked/superbacked/releases) to the same folder as the app.

```console
$ ls
SHA256SUMS
SHA256SUMS.asc
superbacked-arm64-1.9.0.dmg
```

### Step 2 (optional): verify integrity of `SHA256SUMS` using GnuPG

> Heads-up: integrity of Sun’s PGP public key can be confirmed using fingerprint published on [sunknudsen.com/contact](https://sunknudsen.com/contact), [GitHub](https://github.com/sunknudsen/pgp-public-key), [Twitter](https://twitter.com/sunknudsen) and [YouTube](https://www.youtube.com/sunknudsen/about).

> Heads-up: “1 signature not checked due to a missing key” warning can be ignored as it refers to Sun’s [legacy](https://github.com/sunknudsen/pgp-public-key/tree/master/legacy) PGP public key.

Import Sun’s PGP public key and verify the signature.

```console
$ curl https://sunknudsen.com/sunknudsen.asc | gpg --import
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100  2070  100  2070    0     0   6044      0 --:--:-- --:--:-- --:--:--  6160
gpg: key 0x8C9CA674C47CA060: 1 signature not checked due to a missing key
gpg: key 0x8C9CA674C47CA060: public key "Sun Knudsen <hello@sunknudsen.com>" imported
gpg: Total number processed: 1
gpg:               imported: 1
gpg: no ultimately trusted keys found

$ gpg --verify SHA256SUMS.asc
gpg: assuming signed data in 'SHA256SUMS'
gpg: Signature made Thu 18 Dec 06:40:08 2025 EST
gpg:                using EDDSA key 9C7887E1B5FCBCE2DFED0E1C02C43AD072D57783
gpg: Good signature from "Sun Knudsen <hello@sunknudsen.com>" [unknown]
gpg: WARNING: This key is not certified with a trusted signature!
gpg:          There is no indication that the signature belongs to the owner.
Primary key fingerprint: E786 274B C92B 47C2 3C1C  F44B 8C9C A674 C47C A060
     Subkey fingerprint: 9C78 87E1 B5FC BCE2 DFED  0E1C 02C4 3AD0 72D5 7783
```

Verify the output shows `Good signature from "Sun Knudsen <hello@sunknudsen.com>"` and the primary key fingerprint matches `E786 274B C92B 47C2 3C1C F44B 8C9C A674 C47C A060`.

### Step 3: verify integrity of release

```console
$ shasum --algorithm 256 --check --ignore-missing SHA256SUMS
./superbacked-arm64-1.9.0.dmg: OK
```

Verify the output shows `OK` for the downloaded release.
