---
name: technical-documentation-style
description: Superbacked technical documentation style — document anatomy, frozen-construction rule, source pointers, vocabulary, prose mechanics. For developers and security reviewers. Use when editing anything under docs/technical-documentation/.
user_invocable: true
---

# Superbacked technical documentation style

## Audience and publication

Technical documentation is spec-grade reference for developers and security reviewers getting up to speed before reading the source. It lives in this repo (`docs/technical-documentation/`) and is rendered on GitHub — not published on superbacked.com (guides are; see `guides-style.md`).

## Ground truth

The implementation is the ground truth; documentation follows it. Verify every factual claim (constants, error strings, flow order, UI labels, failure modes) against the source before writing it — and when behavior changes, update the docs in the same pass. Quoted strings mirror the implementation exactly (error messages say “requires a newer version of Superbacked” because the error strings do).

## Document anatomy

Every technical document follows the same skeleton:

1. **Abstract** — opens “This document specifies the (cryptographic) design and implementation of ⟨bare subject⟩” (“of blocks”, “of derived passwords”, “of passphrase keys”) — “cryptographic” only where the document owns its cryptography, no “feature in Superbacked” qualifier and no defining apposition (the Introduction’s positioning sentence carries orientation). Legacy documents keep their era-scoping apposition (“— the scheme used by X created before the current scheme: every release up to v1.12.1”). Then a delegation map and the ground-truth sentence (“The source code (…) is the ground truth for this document”, with reference vectors when tests pin the scheme). Delegate by address, never by inventory: “Its cryptographic design is specified in X” — enumerating another document’s contents in a parenthetical drifts.
2. **Introduction** — the shared two-sentence intro, byte-identical across every document (drift is detected by hashing), then a document-specific paragraph that opens with a positioning sentence (“X extend(s) Superbacked with…”; blocks are “the foundation of Superbacked”) and gives a short but comprehensive feature overview — including the optional YubiKey second factor where it applies.
3. **Terminology**, then **Overview** (a numbered “When you …, the app:” list), then **mechanics sections before workflows**. Version declaration lives under the section whose mechanism carries it (payload for blocks, threshold recovery for blocksets). **Key derivation** owns the whole pipeline in one sentence, with `### Paranoid mode` and `### YubiKey second factor` as its subsections — never smear key derivation across sections.
4. **Creation workflow** and **Restoration workflow** — numbered steps in the imperative (“Enter a passphrase.”, “Click “Unlock”.”), never “User …”; app and command actions read “The app …”; UI labels quoted verbatim; no disclaimer mentions.
5. **Consumers** — shared-scheme documents (passphrase key, derived key, fixed-size encryption) end with a `## Consumers` section: one bold-linked bullet per consuming feature stating the consuming symbol and the facts the consumer freezes (domain keys, infos, sizes), then a closing paragraph naming the features that deliberately do not consume the scheme and why. Feature documents (blocks, archives, derived passwords) are leaves and have none. Skip the section when consumption is already enumerated structurally — the passphrase strength gate’s applies-wherever list is a consumers section whose placement carries meaning.

The shared intro (verbatim):

> Superbacked protects secrets too important to lose and too sensitive to share — critical credentials, signing keys and digital assets. Secrets are backed up — encrypted, offline, with succession planning built in — or never stored at all: derived on demand from a master passphrase and YubiKey.

Legacy documents drop the derivation clause — the schemes they specify predate derived secrets — ending the second sentence at “…with succession planning built in.” (byte-identical among the legacy documents, likewise hashable).

`superbacked-os-security.md` is the sanctioned exception to this skeleton: a narrative security-model document with its own anatomy — Threat model, then per-mechanism sections shaped **Intent → Approach → Limits**, then verification, source-of-truth and known-limitations sections. It addresses users as well as developers and security reviewers, and the first-person institutional voice (“we would rather be corrected than trusted”) is allowed there and nowhere else.

There is no registry document — registries live in code. `docs/technical-documentation/README.md` is the architecture overview (the primitive/scheme/format/artifact ladder, the layer map, the versioning-and-cost digest, reference artifacts), kept to one screen and free of per-document enumeration. Frozen values point at their owning modules (`src/shared/kdfProfiles.ts` for KDF profiles and Paranoid mode, `src/utilities/crypto/schemeHeader.ts` for the scheme header, probe blocks and version namespace rules) and discovery is specified per feature under its version declaration section.

## Code blocks — the frozen-construction rule

Quote **frozen constructions** verbatim; never quote **implementation details** — describe them and point at them.

- Frozen = the scheme itself: KDF/HKDF/HMAC constructions, format shapes, calibration math — code that can never legitimately change because artifacts in the wild depend on it. A snippet-vs-source diff on frozen code is an alarm, not maintenance.
- Implementation details = call sites, delegation wrappers (glue with no cryptographic operation), UI plumbing — no contract rides on their shape, so they refactor freely and verbatim copies are a treadmill.
- Snippets are comment-stripped and uniformly dedented, otherwise byte-identical to source. When a frozen string literal lives in a named constant, include the constant’s definition above the function so the literal stays visible.
- Legacy documents may quote more (including bundled KDFs) — legacy code is frozen in its entirety.

## Source pointers

- Form: “(see `symbol` in [src/path/file.ts](../../src/path/file.ts))” — symbol plus path, link target must resolve.
- Point at the most stable layer that owns the fact: core and handlers over routes, symbols over bare files.
- Pointers fail loud (broken links, greppable symbols) where snippets fail silent — that is why they are allowed for implementation details.

## Vocabulary

### Terms

Terms come from the implementation surface that owns them: feature names match UI labels and error strings verbatim (“Single block”, “Protected with YubiKey”), internal names match the source’s own vocabulary (the active profile, from the code comments) and operation verbs name what the primitive does (Argon2d stretches the passphrase; the YubiKey response is mixed in through HKDF). Never coin a synonym for a thing the implementation already names — each document’s Terminology section is where its terms are defined.

### Phrasing

- **unrecoverable** for permanent loss — not “lost”.
- Schemes and keys both take “using” (“encrypted using fixed-size encryption and keys derived from…”); HKDF info labels keep “under the frozen info `x`”.
- “A YubiKey HMAC-SHA1 challenge-response” names the second factor as a unit (abstracts, pipeline summaries); “the YubiKey response” names the mix input once the challenge is in view.
- “YubiKey-protected” (adjective) describes artifacts and secrets in the protected state; “the YubiKey second factor” (noun) names the mechanism — as sentence subject, listed capability or section heading.
- Bare “slot secret” only where the YubiKey is already explicit in the immediate context (same sentence or same table row); “YubiKey slot secret” everywhere else — table rows stand alone.
- Derivation inputs are listed label first — label, master passphrase, YubiKey — matching the intros’ “a label and two factors”.
- Feature enumerations lead with blocks — blocks (and blocksets) before standalone archives before detached archives, then derived secrets — matching feature prominence; Terminology sections stay alphabetical.
- When app and command-line surfaces are named together, the app comes first — “the app switch or `--yubikey`”, “the app Settings switch or the root `--paranoid` command-line flag”, “switch/flag” — the command-line interface is the niche surface.
- Current documents are the current scheme, not a survey of versions: “version N” appears only in boundary statements (version discovery and declaration, legacy fallback, “created before version N”), never as a qualifier on the scheme’s own descriptions. Legacy documents own the old schemes.
- Example labels reflect the feature’s intended use — `github` for a derived password, `hotwallet` for a derived wallet — never a use the feature’s own warnings argue against (`savings`).

### Canonical sentences

Exact sentences reused verbatim wherever the fact is stated:

- Failure modes: “a missing switch/flag or a YubiKey provisioned with a different secret fails exactly like a wrong passphrase, while an absent YubiKey or unprovisioned slot reports a specific YubiKey error” — drop the surface a feature lacks (blocks have no command-line interface, so block.md says “a missing switch”).
- Recovery story: “a backup of the secret or a second YubiKey provisioned with it”.
- Strength gate: “the second factor strengthens it rather than replacing it” — the only sanctioned use of “strengthens” for the YubiKey.
- Blocks only: “is supported for single blocks only, never blocksets” — with the rationale clause where space allows: “a blockset’s shares are meant to restore on any machine holding enough blocks, a property a hardware binding would defeat”.

## Prose mechanics

- All prose — documentation, guides, skills, script comments — must pass the typography lint: [eslint/typography.ts](../../eslint/typography.ts) is the rule implementation (curly quotes and apostrophes, ellipsis character, no Oxford comma) and the ground truth when in doubt. Lint runs on the host (`npm run lint`).
- One job per sentence. Split any sentence juggling delegation + mechanism + consequence; unpack parenthetical pileups (parens are for source pointers, em-dash pairs for appositives).
- Address the reader as “you” at the human-action surface (workflow lead-ins, exclusivity claims); keep scheme prose impersonal.
- No similes or marketing flourish in technical documents.
- When two documents describe mirrored mechanisms (composition/recovery, block/blockset version declaration), mirror the structure: same intro-plus-bullets or lead-plus-numbered-steps shape, with differences only where the mechanisms differ.
