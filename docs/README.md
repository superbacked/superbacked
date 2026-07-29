# Superbacked docs

## Technical documentation

- [Block](block-technical-documentation.md)
- [Blockset](blockset-technical-documentation.md)
- [Derived Bitcoin wallet](derived-bitcoin-wallet-technical-documentation.md)
- [Derived key](derived-key-technical-documentation.md)
- [Derived password](derived-password-technical-documentation.md)
- [Detached archive](detached-archive-technical-documentation.md)
- [Fixed-size encryption](fixed-size-encryption-technical-documentation.md)
- [Legacy fixed-size encryption](legacy-fixed-size-encryption-technical-documentation.md)
- [Passphrase key](passphrase-key-technical-documentation.md)
- [Passphrase strength](passphrase-strength-technical-documentation.md)
- [Scheme registry](scheme-registry-technical-documentation.md)
- [Standalone archive](standalone-archive-technical-documentation.md)
- [Superbacked OS security model](superbacked-os-security-technical-documentation.md)

## Reference artifacts

Published artifacts anyone can restore to verify Superbacked — and the ground truth the test suite restores on every run, so the published artifacts can never drift from what the app produces. Reference passphrases and expected contents are recorded in the corresponding suites.

- [Reference blocks](reference-blocks) — version 1 and version 2 blocks and blocksets, including paranoid and YubiKey variants, pinned by [tests/referenceBlocks.test.ts](../tests/referenceBlocks.test.ts)
- [Reference standalone archives](reference-standalone-archives) — version 1 and version 2 archives, including paranoid and YubiKey variants, pinned by [tests/referenceStandaloneArchives.test.ts](../tests/referenceStandaloneArchives.test.ts)

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
