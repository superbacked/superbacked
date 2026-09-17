# Superbacked technical documentation

Spec-grade reference for developers and security reviewers getting up to speed before reading the source. The implementation is the ground truth: every document names the source files it specifies and the reference vectors that pin its scheme.

## Architecture

Four terms ladder everything in this corpus — each level a facet of the one below it:

- **Primitive**: a building block with no policy — Argon2d, HKDF-SHA256, AES-256-GCM.
- **Scheme**: a frozen composition of primitives with rules — everything versioned is a scheme.
- **Format**: the at-rest byte layout a scheme gives its outputs. Only some schemes have one — the derived schemes deliberately do not.
- **Artifact**: a concrete instance of a format in the wild — a printed block, a `.superbacked` file. Only schemes with formats have artifacts.

Features are built on shared schemes, each specified once and consumed by address:

- The [passphrase key](passphrase-key.md) scheme turns a memorized passphrase — optionally [YubiKey-protected](passphrase-key.md#yubikey-challenge-response) — into the encryption key of a [block](block.md) or [standalone archive](standalone-archive.md).
- [Fixed-size encryption](fixed-size-encryption.md) encrypts secrets using passphrase keys into fixed-size blocks whose every byte is indistinguishable from random data — the layer blocks are built on, and through them [blocksets](blockset.md).
- [Detached archives](detached-archive.md) ride on blocks: a random master key embedded in a block expands into their keys, so no passphrase-derived key of their own exists.
- The [derived key](derived-key.md) scheme derives keys statelessly from a label, a master passphrase and a YubiKey — the layer [derived passwords](derived-password.md) and [derived Bitcoin wallets](derived-bitcoin-wallet.md) are built on.

The remaining documents sit outside the layer map: the [passphrase strength](passphrase-strength.md) gate prices every new passphrase, the [Superbacked OS security model](superbacked-os-security.md) specifies the hardened operating system and the [legacy](legacy/) documents specify the restoration-only schemes that predate the current ones.

## Versioning and key derivation cost

Artifacts are immutable and decades-lived, so every constant that shaped one is frozen the moment it ships. The registry of those constants lives in the source code, enforced by pinning tests: [src/shared/kdfProfiles.ts](../../src/shared/kdfProfiles.ts) is the append-only table of Argon2d cost profiles (legacy, standard and paranoid — strengthening means appending a row, never editing one) and [src/utilities/crypto/schemeHeader.ts](../../src/utilities/crypto/schemeHeader.ts) is the 8-byte declaration every version 2 artifact (block, standalone archive or detached archive) carries under encryption.

Deniability forbids declaring any of this in plaintext — blocks and archives are indistinguishable from random data — so restoration discovers the version and profile by trial: one Argon2d stretch per candidate profile, revealing a scheme header or nothing. Each feature’s version declaration section specifies its own trial, and one rule governs them all: no version check may be reachable more cheaply than the payload it guards — for YubiKey-protected artifacts even the probe requires the hardware.

Version numbers are per-scheme namespaces counting from 1 — `grep -rn "export const schemeVersion" src` lists them — and the frozen identity strings carry no version suffixes: the version lives in the carrier, so the literals only need distinctness (see the version namespace rules in [src/utilities/crypto/schemeHeader.ts](../../src/utilities/crypto/schemeHeader.ts)).

Paranoid mode derives at the paranoid profile — the app Settings switch or the root `--paranoid` command-line flag — and applies to blocks, blocksets, standalone archives, derived passwords and derived Bitcoin wallets. For stored artifacts the mode also gates restoration; for derived schemes nothing is stored, so the mode is a determinism input — deriving without it silently produces different passwords and different wallets, which is why every derivation prints it.

## Reference artifacts

Reference artifacts are published for anyone to restore and verify Superbacked — and they are the ground truth the test suite restores on every run, so the published artifacts can never drift from what the app produces. They live with the test fixtures ([tests/fixtures](../../tests/fixtures)), which record the layout, passphrases and expected contents.

- [Blocks](../../tests/fixtures/blocks) and [legacy blocks](../../tests/fixtures/legacy/blocks) — current and legacy blocks, blocksets and detached archive pairs, including paranoid, YubiKey and pre-subkey variants, pinned by [tests/referenceBlocks.test.ts](../../tests/referenceBlocks.test.ts)
- [Standalone archives](../../tests/fixtures/standalone-archives) and [legacy standalone archives](../../tests/fixtures/legacy/standalone-archives) — including paranoid and YubiKey variants, pinned by [tests/referenceStandaloneArchives.test.ts](../../tests/referenceStandaloneArchives.test.ts)
