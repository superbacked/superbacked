# Superbacked

## How to verify integrity of release

### Step 1: download [release](./releases/) `SHA256SUMS` and `SHA256SUMS.asc` to same folder as release.

```console
$ ls
SHA256SUMS
SHA256SUMS.asc
superbacked-std-1.0.57.AppImage
superbacked-std-1.0.57.dmg
```

### Step 2 (optional): verify integrity of `SHA256SUMS` using [GnuPG](https://gnupg.org/)

> Heads-up: integrity of Sun’s PGP public key can be confirmed using fingerprint published on https://sunknudsen.com/, https://github.com/sunknudsen/pgp-public-key, https://twitter.com/sunknudsen and https://www.youtube.com/sunknudsen/about.

> Heads-up: “1 signature not checked due to a missing key” warning can be ignored as it refers to Sun’s [legacy](https://github.com/sunknudsen/pgp-public-key/tree/master/legacy) PGP public key.

```console
$ curl https://sunknudsen.com/sunknudsen.asc | gpg --import
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100  2070  100  2070    0     0   4627      0 --:--:-- --:--:-- --:--:--  4704
gpg: key 0x8C9CA674C47CA060: 1 signature not checked due to a missing key
gpg: key 0x8C9CA674C47CA060: public key "Sun Knudsen <hello@sunknudsen.com>" imported
gpg: Total number processed: 1
gpg:               imported: 1
gpg: marginals needed: 3  completes needed: 1  trust model: pgp
gpg: depth: 0  valid:   2  signed:   0  trust: 0-, 0q, 0n, 0m, 0f, 2u

$ gpg --verify SHA256SUMS.asc
gpg: assuming signed data in 'SHA256SUMS'
gpg: Signature made Thu Jan  5 05:31:11 2023 EST
gpg:                using EDDSA key 9C7887E1B5FCBCE2DFED0E1C02C43AD072D57783
gpg: Good signature from "Sun Knudsen <hello@sunknudsen.com>" [unknown]
gpg: WARNING: This key is not certified with a trusted signature!
gpg:          There is no indication that the signature belongs to the owner.
Primary key fingerprint: E786 274B C92B 47C2 3C1C  F44B 8C9C A674 C47C A060
     Subkey fingerprint: 9C78 87E1 B5FC BCE2 DFED  0E1C 02C4 3AD0 72D5 7783
```

Good signature from "Sun Knudsen <hello@sunknudsen.com>"

👍

Primary key fingerprint: E786 274B C92B 47C2 3C1C  F44B 8C9C A674 C47C A060

👍

### Step 3: verify integrity of release

> Heads-up: latest `std` release checksums are pinned on https://twitter.com/superbacked.

```console
$ cat SHA256SUMS
c4e1377fb55b1c41edde42cfa16e9d4d529e50898a7ceb7b1972ea4dc6020647  ./superbacked-op-1.0.57-release-notes.txt
abe1883c232906e9ee884ec9ee00404a4c51cebc412db1199195337a371756e5  ./superbacked-op-1.0.57.dmg
30fccfae15982b05f8c47d93d049048324cfd24fd439ce2a3ed37f9b00951eca  ./superbacked-op-1.0.57.dmg.blockmap
c4e1377fb55b1c41edde42cfa16e9d4d529e50898a7ceb7b1972ea4dc6020647  ./superbacked-std-1.0.57-release-notes.txt
06e951043be8b7235c584628f62b2b99f79dcaf67b29a8a606805e4ac17dd831  ./superbacked-std-1.0.57.AppImage
8a8a24ce096d32596d3d3951832d061632db86a9c2b0618eae6040247a411fa0  ./superbacked-std-1.0.57.dmg
8f969dc0f718337c116d2db6f09220abb1cda6295a39f3e1957dbaf4b0f3cabd  ./superbacked-std-1.0.57.dmg.blockmap

$ shasum --algorithm 256 --check --ignore-missing SHA256SUMS
./superbacked-std-1.0.57.AppImage: OK
./superbacked-std-1.0.57.dmg: OK
```

OK

👍