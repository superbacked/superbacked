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

On macOS, create an alias to the app binary.

```console
$ alias superbacked="/Applications/Superbacked.app/Contents/MacOS/Superbacked"
```

On Linux, make the AppImage executable and create an alias (adjusting the path and version to the downloaded release).

```console
$ chmod +x "$HOME/Downloads/superbacked-x64-1.13.0.AppImage"

$ alias superbacked="$HOME/Downloads/superbacked-x64-1.13.0.AppImage"
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
