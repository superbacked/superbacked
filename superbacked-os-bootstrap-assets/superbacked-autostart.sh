#! /bin/bash

# Every boot is a first boot under overlayroot, so GNOME has never seen the
# desktop launcher — mark it trusted so the icon launches directly instead
# of requiring “Allow Launching” each session.
gio set /home/superbacked/Desktop/superbacked.desktop "metadata::trusted" true

# Pinned to native Wayland via environment (an argv flag would be rejected
# by the app’s commander CLI) — “wayland” hard-selects the backend so the
# passphrase-isolation property fails closed rather than silently falling
# back to a snoopable X11 client. Same pin as superbacked.desktop — the two
# must stay in lockstep.
ELECTRON_OZONE_PLATFORM_HINT=wayland /home/superbacked/.local/superbacked/superbacked.AppImage
