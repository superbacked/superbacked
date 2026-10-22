---
name: technical-documentation
description: Rules for documents under docs/technical-documentation/ that copying an existing document does not show — skeleton, shared sentences, what to quote verbatim, what to point at. Use when creating or editing anything under docs/technical-documentation/.
user_invocable: true
---

# Technical documentation

- Copy the closest existing document before writing a new one
- `superbacked-os-security.md` is the sanctioned exception — a narrative security-model document with its own anatomy
- Skeleton: Abstract, Introduction, Terminology, Overview (feature and derived-secret documents), mechanics sections, then workflows
- Feature documents end with Creation workflow and Restoration workflow; shared-scheme documents end with a Consumers section
- The abstract opens “This document specifies the design and implementation of ⟨bare subject⟩” — “cryptographic design” only where the document owns its cryptography
- The two-sentence introduction is identical across documents (the legacy variant ends at “succession planning built in”) — a search for its first words finds every copy; change them all in the same pass
- Workflows are numbered imperatives (“Enter a passphrase.”); the app’s actions read “The app …”; UI labels are quoted verbatim
- Canonical sentences are reused verbatim wherever the fact is stated: the failure-modes sentence (as in `block.md`), the recovery story (“a backup of the secret or a second YubiKey provisioned with it”), the strength gate (“the second factor strengthens it rather than replacing it”) and “is supported for single blocks only, never blocksets”
- Vocabulary comes from the implementation surface that owns it — feature names match UI labels and error strings, internal names match the source — never coin a synonym
- Feature enumerations lead with blocks, then archives, then derived secrets
- The app comes before the command line when both are named
- “Version N” appears only in boundary statements, never as a qualifier on the current scheme
- Quote frozen constructions verbatim — KDF, HKDF and HMAC constructions, format shapes, calibration math — because artifacts in the wild depend on them
- Snippets are comment-stripped and dedented, otherwise byte-identical to source; a diff against source is an alarm, not maintenance
- Never quote implementation details — describe them and point at them with “(see `symbol` in [path](…))”, aimed at the most stable owning layer, link resolving
- Legacy documents quote legacy code in its entirety — it is frozen
- One job per sentence; “you” only at the human-action surface, scheme prose stays impersonal; no marketing flourish
