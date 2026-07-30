# Superbacked docs

## Guides (source of [superbacked.com/guides](https://superbacked.com/guides))

- [How to derive Bitcoin wallets using command-line interface](./guides/how-to-derive-bitcoin-wallets-using-command-line-interface/README.md)
- [How to derive passwords using command-line interface](./guides/how-to-derive-passwords-using-command-line-interface/README.md)
- [How to encrypt files using command-line interface](./guides/how-to-encrypt-files-using-command-line-interface/README.md)
- [How to run Superbacked on factory-reset Mac](./guides/how-to-run-superbacked-on-factory-reset-mac/README.md)
- [How to run Superbacked on Tails](./guides/how-to-run-superbacked-on-tails/README.md)
- [How to run Superbacked on Ubuntu Desktop](./guides/how-to-run-superbacked-on-ubuntu-desktop/README.md)
- [How to run Superbacked OS on desktop or laptop](./guides/how-to-run-superbacked-os-on-desktop-or-laptop/README.md)
- [How to verify data persistence is disabled](./guides/how-to-verify-data-persistence-is-disabled/README.md)
- [How to verify integrity of release](./guides/how-to-verify-integrity-of-release/README.md)

## Technical documentation

- [Block](technical-documentation/block.md)
- [Blockset](technical-documentation/blockset.md)
- [Derived Bitcoin wallet](technical-documentation/derived-bitcoin-wallet.md)
- [Derived key](technical-documentation/derived-key.md)
- [Derived password](technical-documentation/derived-password.md)
- [Detached archive](technical-documentation/detached-archive.md)
- [Fixed-size encryption](technical-documentation/fixed-size-encryption.md)
- [Legacy block](technical-documentation/legacy/block.md)
- [Legacy blockset](technical-documentation/legacy/blockset.md)
- [Legacy detached archive](technical-documentation/legacy/detached-archive.md)
- [Legacy fixed-size encryption](technical-documentation/legacy/fixed-size-encryption.md)
- [Legacy standalone archive](technical-documentation/legacy/standalone-archive.md)
- [Passphrase key](technical-documentation/passphrase-key.md)
- [Passphrase strength](technical-documentation/passphrase-strength.md)
- [Scheme registry](technical-documentation/scheme-registry.md)
- [Standalone archive](technical-documentation/standalone-archive.md)
- [Superbacked OS security model](technical-documentation/superbacked-os-security.md)

## Reference artifacts

Published artifacts anyone can restore to verify Superbacked — and the ground truth the test suite restores on every run, so the published artifacts can never drift from what the app produces. They live with the test fixtures ([tests/fixtures](../tests/fixtures)), which record the layout, passphrases and expected contents.

- [Blocks](../tests/fixtures/blocks) and [legacy blocks](../tests/fixtures/legacy/blocks) — current and legacy blocks, blocksets and detached archive pairs, including paranoid, YubiKey and pre-subkey variants, pinned by [tests/referenceBlocks.test.ts](../tests/referenceBlocks.test.ts)
- [Standalone archives](../tests/fixtures/standalone-archives) and [legacy standalone archives](../tests/fixtures/legacy/standalone-archives) — including paranoid and YubiKey variants, pinned by [tests/referenceStandaloneArchives.test.ts](../tests/referenceStandaloneArchives.test.ts)
