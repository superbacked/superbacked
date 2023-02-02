# Superbacked

## How to verify integrity of release

### Step 1: download [release](./releases/) `SHA256SUMS` and `SHA256SUMS.asc` to same folder as release.

```console
$ ls
SHA256SUMS
SHA256SUMS.asc
superbacked-std-1.1.1-release-notes.txt
superbacked-std-arm64-1.1.1.AppImage
superbacked-std-universal-1.1.1.dmg
superbacked-std-x64-1.1.1.AppImage
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
gpg: Signature made Thu  2 Feb 09:15:37 2023 EST
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
760baf4f158fbb14472926fca6b888085a4273f69284575822430ebfb54b8a2a  ./superbacked-op-1.1.1-release-notes.txt
a765d5b24bd812cdc4ba56feeada3c5f9f30d6679bdc46e8efd32d6d63ef19cc  ./superbacked-op-arm64-1.1.1.dmg
e4bbe7791abec4a2586c4dea3f9b402a4556bad021a82babb43c76c367b8cd0c  ./superbacked-op-arm64-1.1.1.dmg.blockmap
760baf4f158fbb14472926fca6b888085a4273f69284575822430ebfb54b8a2a  ./superbacked-std-1.1.1-release-notes.txt
4bffe3e536f1865825bb8bb0249de10a34151147a9e0fddb4624d636d289584d  ./superbacked-std-arm64-1.1.1.AppImage
61fb26be36532558600d2a4242bcbba48af1cf774945329105ccbdedff401193  ./superbacked-std-universal-1.1.1.dmg
b3469d5261cfa896f4f23b488d0478c56d94be81907d6454efd991797a45aca9  ./superbacked-std-universal-1.1.1.dmg.blockmap
e4eac99f61626532665abfe43d6297993f269269b258fc40c73ddef7c54a4b3c  ./superbacked-std-x64-1.1.1.AppImage

$ shasum --algorithm 256 --check --ignore-missing SHA256SUMS
./superbacked-std-1.1.1-release-notes.txt: OK
./superbacked-std-arm64-1.1.1.AppImage: OK
./superbacked-std-universal-1.1.1.dmg: OK
./superbacked-std-x64-1.1.1.AppImage: OK
```

OK

👍