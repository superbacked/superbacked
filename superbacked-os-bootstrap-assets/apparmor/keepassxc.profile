# Superbacked OS — confined KeePassXC (Ubuntu deb).
#
# Installed as /etc/apparmor.d/keepassxc.profile. Replaces the snap’s
# interface hardening: network and network-bind were disconnected
# (denied below), x11 was disconnected (Wayland pin in the launcher +
# X denials below); home, raw-usb (YubiKey challenge-response over
# hidraw) and removable-media (databases on USB) were connected and are
# preserved.

abi <abi/4.0>,

include <tunables/global>

profile keepassxc /usr/bin/keepassxc {
  include <abstractions/base>
  include <abstractions/dbus-session-strict>
  include <abstractions/dri-common>
  include <abstractions/dri-enumerate>
  include <abstractions/fonts>
  include <abstractions/freedesktop.org>
  include <abstractions/mesa>
  include <abstractions/nameservice>
  include <abstractions/qt5>
  include <abstractions/wayland>

  # A password manager has no business on the network (this also
  # disables favicon downloads and update checks — intended). The
  # denials override the inet grants abstractions/nameservice pulls in.
  # AF_UNIX is deliberately untouched: the session bus and the Wayland
  # socket ride on unix sockets (a bare "deny network," would sweep
  # those in too), and netlink stays allowed for glibc interface
  # enumeration.
  deny network inet,
  deny network inet6,
  deny network packet,
  deny network bluetooth,

  # Session bus: tray/StatusNotifier, single-instance detection,
  # screen-lock signals, and the Secret Service it can provide.
  dbus (send, receive) bus=session,
  dbus bind bus=session name=org.keepassxc.**,
  dbus bind bus=session name=org.freedesktop.secrets,
  dbus bind bus=session name=org.kde.StatusNotifierItem*,

  unix,
  deny unix addr="@/tmp/.X11-unix/*",
  deny unix peer=(addr="@/tmp/.X11-unix/*"),

  /usr/bin/keepassxc mr,
  # Browser integration must never run — the browser lives in another
  # user and KeePassXC has no network anyway.
  deny /usr/bin/keepassxc-proxy x,
  /usr/share/keepassxc/{,**} r,
  /usr/lib/@{multiarch}/keepassxc/*.so mr,

  # Home stays broad — the snap had the home interface connected, and
  # users open databases from anywhere in home (nothing there survives
  # a reboot). The sensitive corners are carved out.
  owner @{HOME}/ r,
  owner @{HOME}/** rwk,
  deny @{HOME}/.gnupg/{,**} mrwkl,
  deny @{HOME}/.ssh/{,**} mrwkl,
  deny @{HOME}/.mozilla/{,**} mrwkl,
  deny @{HOME}/.local/share/keyrings/{,**} mrwkl,
  deny @{HOME}/.local/superbacked/{,**} wl,

  # Databases on USB drives — the only storage that survives a reboot.
  /media/ r,
  /media/*/ r,
  /media/** rwk,

  # YubiKey challenge-response over raw hidraw (snap raw-usb parity).
  /dev/hidraw* rw,
  /sys/class/hidraw/ r,
  /sys/devices/**/hidraw*/uevent r,
  /run/udev/data/* r,

  # Wayland session plumbing (abstractions/wayland covers the
  # compositor socket) plus keymaps and Qt shm buffers.
  owner @{run}/user/[0-9]*/ r,
  /usr/share/X11/xkb/{,**} r,
  owner /dev/shm/** rwk,

  owner @{PROC}/@{pid}/cgroup r,
  owner @{PROC}/@{pid}/mounts r,
  owner @{PROC}/@{pid}/mountinfo r,
  owner @{PROC}/@{pid}/status r,
  @{PROC}/sys/kernel/random/boot_id r,

  # Single-instance lock and Qt temp files.
  owner /tmp/ r,
  owner /tmp/*keepassxc* rwk,
  owner /tmp/#[0-9]* mrw,

  deny /tmp/.X11-unix/{,**} rw,
  deny capability sys_ptrace,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/keepassxc>
}
