# Superbacked OS tests guide

> Heads-up: the confinement checks need a **debug** image (`BUILD_VARIANT=debug`), which keeps `sudo` for the primary user and loads the AppArmor profiles in complain mode until switched — on any other image they refuse to run. Debug images are test artifacts, never for distribution. The hardening checks need no root and run on debug and release images alike.

Two runners live in `superbacked-os-utilities/debug/` and print one `PASS`, `FAIL` or `SKIP` line per check, split by privilege: `test-hardening.sh` is everything the primary user can check with no root, so it verifies the running system behaves as the [security model](../docs/technical-documentation/superbacked-os-security.md) says on any image; `test-confinement.sh` is everything that needs `sudo` or enters a profile, so it exercises the boundaries from the other side on a debug image. Both test outcomes only — nothing the bootstrap wrote is read back — so two properties are checked by hand where the steps say so. Every `SKIP` names its reason, so a run is read by its summary line and its `FAIL` lines. The harvest pair, `capture-apparmor-log.sh` and `summarize-apparmor-log.sh`, is not a test: it lists what the apps themselves were denied, which no runner can enumerate, so it is taken after a profile reload (which clears the journal) and real use of the apps, never right after a runner, whose probes provoke denials on purpose.

### Step 1 (Mac): build the app and a debug image

> Heads-up: the first debug build runs the base bootstrap in full and saves it as a cached layer; later debug builds reuse the layer unless the base bootstrap changed, so an app or hardening change rebuilds in minutes.

```console
$ BUILD_VARIANT=debug npm run package -- --all
```

### Step 2 (Mac): flash `dist/superbacked-os-amd64-live-<semver>.img` to a USB flash drive as described in [How to run Superbacked OS on desktop or laptop](../docs/guides/how-to-run-superbacked-os-on-desktop-or-laptop/README.md)

### Step 3 (Mac): stage the profiles, the debug scripts and the app deb on a second USB flash drive

> Heads-up: replace “Samsung DUO” with the drive’s volume name; `update-apparmor-profiles.sh` looks for the `apparmor` folder next to `debug` on the same drive.

```console
$ bash superbacked-os-utilities/debug/copy-debug-assets.sh "/Volumes/Samsung DUO"

$ diskutil eject "/Volumes/Samsung DUO"
```

### Step 4 (Superbacked OS): boot the “Superbacked OS (hardened browser)” entry, plug in the second drive, open Terminal and load the profiles in enforce mode

> Heads-up: the drive must not mount on its own — automount is off, and this is its only check. Open the drive in Files, which mounts it under `/media/superbacked`.

```console
$ cd "/media/superbacked/Samsung DUO/debug"

$ bash update-apparmor-profiles.sh --enforce
```

### Step 5 (Superbacked OS): run the hardening checks

> Heads-up: the run opens the Superbacked app and Yubico Authenticator through their desktop entries, reads their labels and closes them again — leave those windows alone. In hardened browser mode it then opens Firefox the same way, checks every label in the chain and waits for you to **close the Firefox window** — the one action the platform reserves for a human, since the primary user can neither signal the browser user’s processes nor close another client’s window. An app already open is checked and left open. When the network cable or a USB printer is missing, the run asks for it and waits — the network first, in the network isolation section, then the printer, in the printing section, so the machine moves once; type `s` to skip only if there is none to plug in.

```console
$ bash test-hardening.sh
```

Expected: `0 failed`, with the Firefox chain labelled `superbacked-browser (enforce)`, `superbacked-browser-sudo (enforce)`, `superbacked-browser-helper (enforce)` and `firefox (enforce)` and gone after the window is closed. The printing section walks the chain the app depends on — ipp-usb serving the printer, CUPS discovering it, its attributes answering and a permanent queue for the app to list. On a debug image the sudo policy checks print `SKIP` (debug images keep `sudo`, so the rule cannot be observed there).

### Step 6 (Superbacked OS): run the confinement checks

> Heads-up: the run opens Firefox and closes it again itself, then opens it a second time and kills the bridge client to prove the chain tears down with it — leave both windows alone. The second teardown makes the browser launcher show its “Browser exited with an error” dialog, which is the expected behaviour and which the script checks for and dismisses itself. It also moves the session’s compositor socket aside for a few seconds (new windows cannot open during that time, and the socket is restored on every exit path) and unloads and reloads the browser-launch profiles. When the network cable, a FIDO security key or a USB printer is missing, the run asks for it and waits — the network first, then the key, then the printer, so the machine moves once; type `s` to skip only if there is none to plug in.

```console
$ bash test-confinement.sh
```

Expected: `0 failed`, including “no AppArmor events during the real launch” and “chain gone after the bridge client died”, with a label table showing the browser launcher and its waypipe under `superbacked-browser (enforce)`, `sudo` under `superbacked-browser-sudo (enforce)`, the browser helper’s waypipe as the browser user under `superbacked-browser-helper (enforce)` and Firefox under `firefox (enforce)`; the user separation section showing the browser user opening the key’s FIDO node and refused on every other hidraw device; and the Superbacked app profile fetching the printer’s attributes. The events listing at the end is for information and is never empty after a run — the probes provoke those denials on purpose.

### Step 7 (Superbacked OS): use the apps by hand, harvest real use, then confirm cleanup

Reload the profiles first — this clears the journal, so the harvest below holds only what the apps themselves did:

```console
$ bash update-apparmor-profiles.sh --enforce
```

Open the Superbacked app and Yubico Authenticator and close them. Click the Superbacked OS link in the Superbacked app’s disclaimer — it must open the browser; this is the only check that the app’s own call enters the confined chain, since the runners enter it through the desktop entry. With a FIDO security key plugged in, use it in Firefox where the page asks for it, then close Firefox. Then harvest before running anything else, and confirm cleanup:

```console
$ bash capture-apparmor-log.sh | bash summarize-apparmor-log.sh

$ bash test-confinement.sh
```

Expected: an empty harvest — the apps hit no profile boundary in real use — and `0 failed`, including “no leftover waypipe processes”. A non-empty harvest is a profile gap. Fixing one is development work described in the Superbacked OS development style skill; the fix ships in the next image.

### Step 8 (Superbacked OS): reboot on the default “Superbacked OS” entry, reload the profiles and repeat both runners in air-gapped mode

> Heads-up: in air-gapped mode the confinement run adds a dummy interface and route for a few seconds so the firewall’s own refusal is observable rather than “unreachable”; both are removed on every exit path. Firefox cannot be launched in this mode, so those checks print `SKIP` with the reason.

```console
$ cd "/media/superbacked/Samsung DUO/debug"

$ bash update-apparmor-profiles.sh --enforce

$ bash test-hardening.sh

$ bash test-confinement.sh

$ bash update-apparmor-profiles.sh --enforce
```

The second reload clears the runners’ probes from the journal. Now use the apps by hand: open the Superbacked app and Yubico Authenticator and close them, then double-click Firefox in the dock and click the app’s link once each — both must show only the notice that Superbacked OS is running in air-gapped mode, and dismissing the notice must leave the dock icon ready to click again at once, with no lingering starting spinner. Then harvest:

```console
$ bash capture-apparmor-log.sh | bash summarize-apparmor-log.sh
```

Expected: `0 failed` from both runners and an empty harvest.

### Step 9 (Mac): build a release image and flash it

```console
$ npm run package -- --os
```

### Step 10 (Superbacked OS): run the hardening checks on the release image, in both boot modes

Release images remove `sudo` from the primary user, so `test-confinement.sh` refuses to run and `test-hardening.sh` is the whole procedure. It now also runs the sudo policy checks that debug images cannot — that `superbacked` cannot become root, that the single rule is exactly the browser helper and that every variant of misusing it is refused.

```console
$ cd "/media/superbacked/Samsung DUO/debug"

$ bash test-hardening.sh
```

Expected: `0 failed` in both modes, with the sudo policy checks passing rather than skipped, both bundled apps labelled `(enforce)`, the printing section passing with the printer plugged in and, in hardened browser mode, the Firefox chain labelled and gone after the window is closed.
