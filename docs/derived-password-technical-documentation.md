# Derived password technical documentation

## Abstract

This document specifies the cryptographic design and implementation of the derived password feature in Superbacked. Derived passwords are deterministic, high-entropy, per-label passwords rendered from a [derived key](derived-key-technical-documentation.md) — a 256-bit key binding a memorized master passphrase, a label and a YubiKey HMAC-SHA1 challenge-response — two-factor password derivation with nothing stored anywhere. The source ([src/utilities/crypto/derivedPassword.ts](../src/utilities/crypto/derivedPassword.ts) and [src/utilities/crypto/derivedKey.ts](../src/utilities/crypto/derivedKey.ts)) is the ground truth for this document, and the reference vectors in [tests/derivedPassword.test.ts](../tests/derivedPassword.test.ts) pin the scheme.

## Introduction

Superbacked is a backup and succession planning platform for sensitive data such as critical credentials, signing keys and digital assets. Superbacked stores this data in encrypted QR codes called blocks, printed on archival paper or saved as JPG or PDF files.

Derived passwords extend the platform with stateless password derivation: instead of storing passwords, users re-derive them on demand from two factors — a memorized master passphrase and the HMAC-SHA1 secret sealed inside a YubiKey slot. The same passphrase, label and YubiKey always produce the same password, on any machine, with no vault, sync or backup required.

The two factors meet in the derived key, whose derivation — Argon2d stretching, keyed challenge, YubiKey response and HKDF combination — is specified in the [derived key technical documentation](derived-key-technical-documentation.md), not here. This document specifies how a password is rendered from that key.

## Terminology

- **Character class**: one of lowercase, uppercase, digits and special characters.
- **Derived key**: 256-bit key binding master passphrase, label and YubiKey response (see the [derived key technical documentation](derived-key-technical-documentation.md)).
- **Label**: memorized identifier a password is derived for (for example `github` or `proton`).
- **Master passphrase**: memorized passphrase used as the knowledge factor.

## Overview

When you derive a password, the app:

1. Derives a 256-bit key from the master passphrase, label and YubiKey (see the [derived key technical documentation](derived-key-technical-documentation.md))
2. Expands the derived key into a deterministic byte stream using HKDF-SHA256
3. Renders the byte stream into a password using rejection sampling

Every stage is a pure function — no randomness and no stored state — so derivation is deterministic. The rendering is frozen: changing any constant or construction silently changes every derived password — as does any change to the derived key scheme beneath it.

## Byte stream expansion

The derived key is expanded into a deterministic byte stream using HKDF-SHA256:

```typescript
chunk = hkdf(derivedKey, Buffer.alloc(0), info, 64)
```

**Parameters:**

- **Input keying material**: 256-bit derived key
- **Salt**: Empty — both factors and the label are already bound through the derived key
- **Info**: `superbacked-derived-password-v1` followed by fixed-width 32-bit big-endian counter
- **Output**: 64 bytes per counter — incrementing the counter yields an unbounded deterministic stream

### Security characteristics

- **Domain separation**: The `superbacked-derived-password-v1` context separates password rendering from every other use of a derived key (for example YubiKey-protected archive key derivation, which consumes the key through its own HKDF context) — a rendered password reveals nothing about the key
- **Label independence**: Under the PRF assumption, keys (and therefore streams) for different labels are computationally independent — a password leaked from one label reveals nothing about any other
- **Info unambiguity**: The fixed-width counter guarantees no two counters produce the same info value

## Password rendering

The byte stream is rendered into a password using rejection sampling over 85 characters:

- **Lowercase**: `abcdefghijkmnopqrstuvwxyz`
- **Uppercase**: `ABCDEFGHJKLMNPQRSTUVWXYZ`
- **Digits**: `23456789`
- **Special**: `!#$%&()*+,-./:;<=>?@[\]^_{}~` (US keyboard layout, space excluded)

Ambiguous characters are excluded (KeePassXC-style look-alike exclusion, extended with the quote family): `0`/`O` and `1`/`l`/`I` transcribe unreliably when passwords are typed manually on air-gapped devices, `|` reads as `l` or `I` and mobile keyboards substitute curly variants when typing `'`, `"` and `` ` ``.

### Algorithm

1. Accept stream byte only if below 255 (largest multiple of 85 below 256), map accepted byte modulo 85 into character set
2. Accumulate characters until requested length is reached
3. Keep candidate password only if it contains all four character classes — otherwise discard it whole and continue down the stream

### Security characteristics

- **Uniformity**: Rejection sampling (the same technique as `arc4random_uniform` and Python `secrets`) makes all 85 characters exactly equiprobable at ~6.41 bits per character — a bare modulo would bias toward the first characters
- **Compliance without bias**: Discarding non-compliant candidates whole (rather than patching characters in) keeps output uniform over the set of compliant passwords, so every password satisfies common complexity rules without distribution skew
- **Capacity**: Default 16-character password carries ~102 bits (past the 100-bit threshold KeePassXC rates excellent) — short enough to type manually on air-gapped devices, while effective strength remains min(passphrase guessing cost, 160-bit response, rendered bits), making the passphrase the binding constraint by design

## Security model

The two-factor security model — what each combination of leaked material allows — lives with the primitive in the [derived key technical documentation](derived-key-technical-documentation.md). Password-specific limitations:

- **No rotation**: Derivation is deterministic, so a leaked password re-derives identically forever — replacing it requires a new label (for example `github2`)
- **Determinism inputs**: The scheme version and [Paranoid mode](scheme-registry-technical-documentation.md) each derive a different password from the same passphrase and label — every derivation echoes both, and re-deriving with a forgotten flag silently produces a different password, not an error
- **Length is not rotation**: Passwords of different lengths for the same label are windows into the same byte stream and share material — to replace a password, change the label, not the length
- **Loss of YubiKey**: Without a second YubiKey programmed with the same slot secret, all derived passwords are unrecoverable
- **No verifier**: No fingerprint or checksum of the passphrase is ever displayed or stored — any passphrase-only verifier would reintroduce the offline attack the keyed challenge eliminates, so a mistyped passphrase silently derives a different password (use `--confirm` when creating a password)

## Command-line interface

```console
superbacked derive-password [label] [options]
```

Label is prompted when omitted, keeping labels out of shell history and process listings. When the passphrase is piped via stdin, the prompt reads from the controlling terminal (the sudo and ssh behavior) — passing the label as argument is only required fully non-interactively (no controlling terminal, for example cron).

The master passphrase must score a strength of at least 50 (see the [passphrase strength technical documentation](passphrase-strength-technical-documentation.md)), matching the gate everywhere else in Superbacked, with no override. The gate has been enforced since the first release of the scheme, so no derivable passphrase is stranded by it — and because derivation is deterministic and stateless, the threshold can never rise without stranding established passphrases.

**Options:**

- `--clear <seconds>`: Seconds before copied password is cleared from clipboard (default `10`)
- `--confirm`: Prompt for master passphrase twice and require a match — catches typos when creating a password (interactive prompts only; a piped passphrase is used as-is)
- `--derivation-version <version>`: Derivation scheme version (only `1` exists — the option gates and documents rather than branches, and every derivation states the version used)
- `-l, --length <length>`: Password length (default `16`, minimum `8`, maximum `128`)
- `--no-yubikey`: Derive without YubiKey (single factor, weaker — see the [derived key technical documentation](derived-key-technical-documentation.md))
- `-p, --print`: Print password to stdout instead of copying it to clipboard
- `-s, --slot <slot>`: HMAC-SHA1 challenge-response slot (default `2`)

The root `--paranoid` flag derives at the paranoid [KDF profile](scheme-registry-technical-documentation.md). Derivation is stateless, so the mode is a determinism input on par with the label — deriving without it silently produces a different password — which is why every derivation echoes the scheme version and mode (for example `Derived with scheme v1 (paranoid)`).

### Derivation workflow

1. User runs `superbacked derive-password`
2. User enters label
3. User enters master passphrase (hidden prompt or piped via stdin)
4. User touches YubiKey if slot requires touch
5. App copies password to clipboard, clearing it after 10 seconds or as soon as user presses enter (or prints it with `--print`)

The password is copied to the clipboard by default, keeping it out of terminal scrollback (which tmux and some terminal emulators persist to disk).

Each platform copies through the mechanism it sanctions. Wayland lets only a focused surface set the selection and the command-line interface is windowless, so the password is copied through `wl-copy` (wl-clipboard, preinstalled on Superbacked OS), whose daemon owns the selection — when wl-clipboard is missing, the command fails with instructions instead of reporting a copy that never happened. On GNOME, wl-copy briefly maps an invisible window to acquire the selection (Mutter implements no data-control protocol), which can blink an icon in the dock when the password is copied or cleared — cosmetic and expected. On macOS the password is copied through `pbcopy`, which ships with the operating system; only X11 uses Electron’s clipboard, the platform preinstalling no utility and the selection living and dying with the process.

The process stays alive for the clearing delay (X11 drops a selection when its owner exits) then clears the clipboard unless the user copied something else meanwhile — pressing enter ends the wait and clears immediately. Interrupting the wait cannot leave the password behind: on macOS (where the pasteboard survives the process) and on Wayland (where the wl-copy daemon does), a guard clears the clipboard whenever the command dies before clearing it and X11 drops the selection with the process.

With `--print`, the password is written to stdout on its own so the command composes with other utilities — prompts and the touch notice go to stderr.

### Platform notes

- **Linux**: Reading `/dev/hidraw*` requires Yubico udev rules or root
- **macOS**: Opening the YubiKey keyboard interface may require granting the terminal Input Monitoring permission (System Settings → Privacy & Security → Input Monitoring)
