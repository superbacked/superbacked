# Superbacked trademark policy

The name “Superbacked”, the Superbacked logo and the superbacked.com domain are trademarks of Superbacked, Inc. (the “marks”). The Superbacked visual identity — the logo together with the signature gradient and the overall appearance of the app — is claimed as trade dress.

The software license (see [LICENSE](LICENSE)) grants rights under copyright only. It does not grant any right to use the marks, and nothing in this repository should be read as such a grant. Trademark rights and copyright are separate: releasing source code does not release the name.

This separation protects users, not just the project. Superbacked protects secrets, so its worst-case abuse is a counterfeit build distributed under the Superbacked name that exfiltrates what users type into it. The marks are the lever for taking such counterfeits down — which only works if official use is the only use.

## Allowed without permission

- Building and running the software from this repository’s unmodified source for use permitted by the license, referring to it as Superbacked
- Truthful, nominative references: “a fork of Superbacked”, “compatible with Superbacked”, “restores Superbacked archives”
- Linking to superbacked.com or this repository

## Not allowed without written permission

- Distributing modified builds — or unmodified builds through unofficial channels — under the Superbacked name or logo
- Using the marks, or confusingly similar names, in product names, package names, app store listings, domain names, social media handles or company names in ways that imply official status or endorsement
- Using the Superbacked logo in forks or derived projects, in any form

## Forks

Forks that redistribute must choose their own name and remove Superbacked branding: the product name, the logo, the signature gradient and visual styling that would make the fork pass for Superbacked, the domain references and the app identifiers. Building unmodified source necessarily reproduces the visual identity — that is not a violation; presenting a derived product in Superbacked’s dress is.

**Frozen protocol identifiers are exempt.** The `.superbacked` file extension and the frozen cryptographic context strings (for example `superbacked-derived-key-v1` and `superbacked-derived-password-v1`) are functional protocol constants — changing them breaks compatibility with every existing archive and derived password by design. Retaining them for interoperability is required, permitted and not a use of the marks.

## Counterfeits

If you find a build, site, domain or listing impersonating Superbacked, please report it through the process in [SECURITY.md](SECURITY.md).
