# Superbacked

## How to verify integrity of release

### Step 1: download [release](./releases/) `SHA256SUMS` and `SHA256SUMS.asc` to same folder as release.

```console
$ ls
SHA256SUMS
SHA256SUMS.asc
superbacked-std-1.0.56.AppImage
superbacked-std-1.0.56.dmg
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
gpg: Signature made Sat 24 Dec 06:03:29 2022 EST
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
fca254b8e5adb1dc3ee7e727c85bfd4b7ba8ad6dff85ebaaeadd55145e1e3dd8  ./superbacked-op-1.0.56.dmg
b635be3a78beadb47b3722e56fc674a7879d606f7f55b45aa78c39e7196f911f  ./superbacked-op-1.0.56.dmg.blockmap
79db2c5094181959d7d21635eecfd38ffa1f20fee5bbaba50c0aab58a207e114  ./superbacked-std-1.0.56.AppImage
098fa98693123810e07d97d1da954436fd39711229f78222de96139e05d05cc2  ./superbacked-std-1.0.56.dmg
62f6d19eb4ec5460ba84eeb5fa0f595800dda34ce67092863db9538fb8fc015b  ./superbacked-std-1.0.56.dmg.blockmap

$ shasum --algorithm 256 --check --ignore-missing SHA256SUMS
./superbacked-std-1.0.56.AppImage: OK
./superbacked-std-1.0.56.dmg: OK
```

OK

👍