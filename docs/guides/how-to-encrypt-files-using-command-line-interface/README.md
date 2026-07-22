<!--
Title: How to encrypt files using command-line interface
Description: Learn how to encrypt files and folders as standalone archives using the Superbacked command-line interface
Publication date: 2026-07-22T12:00:00.000Z
Pinned:
-->

# How to encrypt files using command-line interface

## Overview

Superbacked can encrypt files and folders as standalone archives — portable `.superbacked` files encrypted using AES-256-GCM with a key derived from a passphrase using Argon2d. Archives created using the command-line interface are byte-identical to app-created ones, so they can also be restored by drag and drop in the app.

## Guide

### Step 1: access command-line interface

The command-line interface is built into the app.

On macOS, add a persistent alias to the app binary (running the following commands once).

```console
$ echo 'alias superbacked="/Applications/Superbacked.app/Contents/MacOS/Superbacked"' >> "$HOME/.zshrc"

$ source "$HOME/.zshrc"
```

On Linux, install the AppImage as `superbacked` in `~/.local/bin` (adjusting the path and version to the downloaded release and opening a new terminal if `~/.local/bin` did not exist).

```console
$ install -m 755 "$HOME/Downloads/superbacked-x64-1.13.0.AppImage" "$HOME/.local/bin/superbacked"
```

On Superbacked OS, the `superbacked` command is preinstalled.

### Step 2: create standalone archive

> Heads-up: the passphrase cannot be recovered — without it, the standalone archive content is lost. Consider backing up the passphrase using a Superbacked block or blockset.

Encrypt one or more files and/or folders (the `.superbacked` extension is appended automatically and the command refuses weak passphrases).

```console
$ superbacked create-standalone-archive ~/Documents/passport.pdf ~/Documents/wallet --output backup
Passphrase:
Confirm passphrase:
/Users/sun/backup.superbacked
```

The archive path is printed on success. Use `--force` to overwrite an existing archive.

### Step 3: restore standalone archive

Restore the standalone archive to an existing directory.

```console
$ mkdir restored

$ superbacked restore-standalone-archive backup.superbacked --output restored
Passphrase:
/Users/sun/restored
```

The destination path is printed on success. Standalone archives can also be restored by dragging and dropping them in the app.
