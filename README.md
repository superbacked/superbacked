# Superbacked

## How to verify integrity of release

### Step 1: download [release](./releases/) `SHA256SUMS` and `SHA256SUMS.asc` to same folder as release.

```console
$ ls
SHA256SUMS
SHA256SUMS.asc
superbacked-std-1.1.0-release-notes.txt
superbacked-std-arm64-1.1.0.AppImage
superbacked-std-universal-1.1.0.dmg
superbacked-std-universal-1.1.0.dmg.blockmap
superbacked-std-x64-1.1.0.AppImage
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
gpg: Signature made Tue 31 Jan 09:16:41 2023 EST
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
e83cad55fe46255e2e9016f61e06c777cabdc9c3d37be3ef3036ef0e03a587bc  ./superbacked-op-1.1.0-release-notes.txt
87f37d6e8f174f7dd1688d9224dd9673a94264c7858e24e017562c6b97188b7b  ./superbacked-op-arm64-1.1.0.dmg
abb6adad04407ce0a36c1750cf028e2640a45bbf146cd21ccf38e9b7add5bd8c  ./superbacked-op-arm64-1.1.0.dmg.blockmap
e83cad55fe46255e2e9016f61e06c777cabdc9c3d37be3ef3036ef0e03a587bc  ./superbacked-std-1.1.0-release-notes.txt
ff211337c1e8b98b018042f06515fe426fdce688f53567e486db1758a7afe5e4  ./superbacked-std-arm64-1.1.0.AppImage
06f42d9820b34e964d52610ad6d673fadb36b13290f7c2a2d4dbc854db22bbb4  ./superbacked-std-universal-1.1.0.dmg
7509d60f8330d9ae2b5cc62c0ef523c165b875704ee8181f60665b2c78b43e22  ./superbacked-std-universal-1.1.0.dmg.blockmap
450cd9af693883adefda1f26ee12a2a0cc8dcfdb184a24fbac714a76d194f609  ./superbacked-std-x64-1.1.0.AppImage

$ shasum --algorithm 256 --check --ignore-missing SHA256SUMS
./superbacked-std-1.1.0-release-notes.txt: OK
./superbacked-std-arm64-1.1.0.AppImage: OK
./superbacked-std-universal-1.1.0.dmg: OK
./superbacked-std-universal-1.1.0.dmg.blockmap: OK
./superbacked-std-x64-1.1.0.AppImage: OK
```

OK

👍