# Superbacked OS — confined Yubico Authenticator (Flutter tarball in
# /opt/yubico-authenticator, launched with GDK_BACKEND=wayland).
#
# Installed as /etc/apparmor.d/yubico-authenticator.profile. Fully
# offline: it reads codes straight off the YubiKey via pcscd (CCID) and
# raw hidraw/USB (the OTP/FIDO paths of the bundled helper). Known
# non-AppArmor pitfall: the tarball bundles its own libpcsclite — a
# protocol mismatch with the system pcscd breaks CCID regardless of
# this profile.

abi <abi/4.0>,

include <tunables/global>

profile yubico-authenticator /opt/yubico-authenticator/authenticator {
  include <abstractions/base>
  include <abstractions/dbus-session-strict>
  include <abstractions/dconf>
  include <abstractions/dri-common>
  include <abstractions/dri-enumerate>
  include <abstractions/fonts>
  include <abstractions/freedesktop.org>
  include <abstractions/mesa>
  include <abstractions/nameservice>
  include <abstractions/wayland>

  # Offline by design (the denials override the inet grants
  # abstractions/nameservice pulls in).
  deny network inet,
  deny network inet6,
  deny network packet,
  deny network bluetooth,

  dbus (send, receive) bus=session,

  unix,
  deny unix addr="@/tmp/.X11-unix/*",
  deny unix peer=(addr="@/tmp/.X11-unix/*"),

  # Bundled Flutter app and libraries, and the bundled helper the GUI
  # spawns to talk to the key.
  /opt/yubico-authenticator/ r,
  /opt/yubico-authenticator/** mr,
  /opt/yubico-authenticator/authenticator mrix,
  /opt/yubico-authenticator/helper/** mrix,

  # Smartcard path: the system pcscd socket.
  /run/pcscd/pcscd.comm rw,

  # Direct USB/FIDO/OTP paths used by the helper.
  /dev/bus/usb/ r,
  /dev/bus/usb/*/ r,
  /dev/bus/usb/*/[0-9]* rw,
  /dev/hidraw* rw,
  /sys/class/hidraw/ r,
  /sys/bus/usb/devices/ r,
  /sys/devices/**/uevent r,
  /run/udev/data/* r,

  # Settings (Flutter shared_preferences and friends).
  owner @{HOME}/.config/ r,
  owner @{HOME}/.config/com.yubico* rwk,
  owner @{HOME}/.config/com.yubico*/{,**} rwk,
  owner @{HOME}/.local/share/ r,
  owner @{HOME}/.local/share/com.yubico*/{,**} rwk,
  owner @{HOME}/.cache/com.yubico*/{,**} rwk,

  # GTK embedder (Flutter Linux shell) on superbacked’s Wayland socket.
  owner @{run}/user/[0-9]*/ r,
  /usr/share/X11/xkb/{,**} r,
  /usr/share/glib-2.0/schemas/gschemas.compiled r,
  /etc/gtk-3.0/{,**} r,
  owner /dev/shm/** rwk,

  owner @{PROC}/@{pid}/cgroup r,
  owner @{PROC}/@{pid}/fd/ r,
  owner @{PROC}/@{pid}/mounts r,
  owner @{PROC}/@{pid}/status r,
  owner @{PROC}/@{pid}/task/ r,
  owner @{PROC}/@{pid}/task/*/comm rw,

  # Temp files — includes PyInstaller self-extraction (/tmp/_MEI*) if
  # the bundled helper ships as a one-file bundle.
  owner /tmp/ r,
  owner /tmp/** rwk,
  owner /tmp/_MEI*/{,**} mr,

  deny /tmp/.X11-unix/{,**} rw,
  deny /media/{,**} mrwklx,
  deny @{HOME}/.gnupg/{,**} mrwkl,
  deny @{HOME}/.ssh/{,**} mrwkl,
  deny capability sys_ptrace,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/yubico-authenticator>
}
