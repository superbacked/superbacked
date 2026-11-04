# Fixtures

The golden assets the test suite restores on every run — real artifacts created with real releases, so the published artifacts can never drift from what the app produces — alongside the inputs they were created from. Current-era assets live at the root, legacy assets under [legacy](legacy) (created with v1.12.1, except the pre-subkey block, created with v1.5.1 or earlier).

## Inputs

- [secrets](secrets) — the two block secrets; every single block and blockset carries both, each under its own passphrase (the YubiKey, pre-subkey and detached archive pair blocks carry the first secret only)
- [passphrases](passphrases) and [legacy/passphrases](legacy/passphrases) — one file per secret (`1.txt`, `2.txt`); the archives and the detached archive pair blocks share the first passphrase
- [yubikey-challenge-response-secret.txt](yubikey-challenge-response-secret.txt) — the published reference challenge-response secret (hex) the YubiKey variants are provisioned with
- [bitcoin.pdf](bitcoin.pdf) and [secrets](secrets) — the content encrypted into every standalone and detached archive

## Blocks

Block JPGs keep their app-assigned filenames (short hash). The YubiKey variants are created with slot 2 provisioned with the published reference challenge-response secret ([yubikey-challenge-response-secret.txt](yubikey-challenge-response-secret.txt)) — a verification secret, never a real one — so tests can simulate responses. Paranoid variants are created with Paranoid mode enabled.

- [blocks/single-block/standard](blocks/single-block/standard) — both secrets
- [blocks/single-block/standard/yubikey](blocks/single-block/standard/yubikey)
- [blocks/single-block/paranoid](blocks/single-block/paranoid)
- [blocks/blockset/standard](blocks/blockset/standard) — all three members of a 2-of-3 blockset
- [blocks/detached-archive](blocks/detached-archive) — a block created with files attached (`bitcoin.pdf` and `secrets`), kept together with its paired `.superbacked` archive (app-assigned filename)
- [legacy/blocks/single-block](legacy/blocks/single-block) — both secrets
- [legacy/blocks/single-block/pre-subkey](legacy/blocks/single-block/pre-subkey) — one secret, created with v1.5.1 or earlier (before HKDF subkeys)
- [legacy/blocks/blockset](legacy/blocks/blockset) — all three members of a 2-of-3 blockset
- [legacy/blocks/detached-archive](legacy/blocks/detached-archive) — block and paired archive, like the current pair

## Standalone archives

Every archive encrypts `bitcoin.pdf` and `secrets`, saved as `backup.superbacked`.

- [standalone-archives/standard](standalone-archives/standard)
- [standalone-archives/standard/yubikey](standalone-archives/standard/yubikey) — same published slot secret
- [standalone-archives/paranoid](standalone-archives/paranoid) — Paranoid mode enabled
- [legacy/standalone-archives](legacy/standalone-archives)
