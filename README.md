# Superbacked

## How to verify integrity of release

### Step 1: download [release](./releases/) `SHA256SUMS` and `SHA256SUMS.asc` to same folder as release.

```console
$ ls
SHA256SUMS
SHA256SUMS.asc
superbacked-std-1.0.54.AppImage
superbacked-std-1.0.54.dmg
```

### Step 2 (optional): verify integrity of `SHA256SUMS` using [GnuPG](https://gnupg.org/)

> Heads-up: public key fingerprint is published on https://sunknudsen.com/, https://github.com/sunknudsen/pgp-public-key, https://twitter.com/sunknudsen and https://www.youtube.com/sunknudsen/about.

```console
$ gpg --verify SHA256SUMS.asc
gpg: assuming signed data in 'SHA256SUMS'
gpg: Signature made Sun 18 Dec 07:23:42 2022 EST
gpg:                using EDDSA key 9C7887E1B5FCBCE2DFED0E1C02C43AD072D57783
gpg: Good signature from "Sun Knudsen <hello@sunknudsen.com>" [full]
Primary key fingerprint: E786 274B C92B 47C2 3C1C  F44B 8C9C A674 C47C A060
     Subkey fingerprint: 9C78 87E1 B5FC BCE2 DFED  0E1C 02C4 3AD0 72D5 7783
```

Good signature from "Sun Knudsen <hello@sunknudsen.com>"

👍

Primary key fingerprint: E786 274B C92B 47C2 3C1C  F44B 8C9C A674 C47C A060

👍

### Step 3: verify integrity of release

> Heads-up: latest release checksums are pinned on https://twitter.com/superbacked.

```console
$ cat SHA256SUMS
0419b1b48fe92974606668eb62b6ccd7289fd5ad4ceee273d853c88e7efec9b2  ./superbacked-op-1.0.54.dmg
d257c5f9d15f071624bfdb0ca490b9e3cafef1f8cc1e46d461318da5ec4192ce  ./superbacked-op-1.0.54.dmg.blockmap
c606eb48b29fbeaea3d78947d3d3bd3114552b4e23a23ff533d357b2ba27b5ed  ./superbacked-std-1.0.54.AppImage
e62842d4f0b41e9a477634186b94a1af96ee624767e8f23af61c9c396efa5683  ./superbacked-std-1.0.54.dmg
2325a7ce491a79014137302be37c6d2d1face25d42c5fae3e5740a54408be5de  ./superbacked-std-1.0.54.dmg.blockmap

$ shasum --algorithm 256 --check --ignore-missing SHA256SUMS
./superbacked-std-1.0.54.AppImage: OK
./superbacked-std-1.0.54.dmg: OK
```

./superbacked-std-1.0.54.AppImage: OK

./superbacked-std-1.0.54.dmg: OK

👍