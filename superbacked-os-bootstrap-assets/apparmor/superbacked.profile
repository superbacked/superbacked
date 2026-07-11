# Superbacked OS — confined Superbacked app (Electron AppImage).
#
# Installed as /etc/apparmor.d/superbacked.profile, replacing the
# previous unconfined-but-named profile that only granted userns. This
# is the app that handles the secrets, so it is the most important
# boundary: it must never reach the network (the air-gap, enforced a
# layer below nftables, inside the process that holds the secrets) and
# it is walled off from the clearnet browser user. It keeps what it
# genuinely needs — its own files, the camera (block scanner), the
# user’s home, USB drives and the printer.
#
# Electron/AppImage caveat: the app FUSE-mounts its own squashfs and
# runs a Chromium sandbox that creates user namespaces and pivots root.
# The namespace and mount rules below are deliberately broad so those
# mechanics work — the real confinement here is the network denial and
# the filesystem scope, not the sandbox internals. Tuned without
# hardware: if the app fails to launch, harvest the exact missing rules
# from one APPARMOR_MODE=complain build (journalctl -b -k | grep DENIED)
# and fold them in.

abi <abi/4.0>,

include <tunables/global>

profile superbacked /home/superbacked/.local/superbacked/superbacked.AppImage flags=(attach_disconnected) {
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

  # The air-gap, and the whole point of confining this app. nftables
  # already blocks egress; denying it here means a compromised app
  # cannot exfiltrate secrets even if the firewall is somehow bypassed.
  # Unix sockets (Wayland, D-Bus) and netlink (nss) stay.
  deny network inet,
  deny network inet6,
  deny network raw,
  deny network packet,
  unix,

  # Chromium/Electron sandbox: unprivileged user namespaces and the
  # namespace, mount and signal operations it performs inside them.
  # Broad by necessity — the sandbox pivots root and bind-mounts within
  # its own namespace; access to actual files is still governed by the
  # path rules below.
  userns,
  capability sys_admin,
  capability sys_chroot,
  capability sys_ptrace,
  capability dac_override,
  capability dac_read_search,
  capability setgid,
  capability setuid,
  owner @{PROC}/@{pid}/{uid_map,gid_map,setgroups} w,
  mount,
  umount,
  pivot_root,
  signal peer=@{profile_name},
  ptrace peer=@{profile_name},

  # The AppImage and everything it mounts and runs. A type-2 AppImage
  # FUSE-mounts its squashfs at a random /tmp/.mount_* and execs its
  # bundled Electron binaries from there — they inherit this profile
  # (ix), keeping the whole app confined.
  /home/superbacked/.local/superbacked/superbacked.AppImage mrix,
  /dev/fuse rw,
  /usr/bin/fusermount{,3} mrix,
  owner /tmp/.mount_*/ r,
  owner /tmp/.mount_*/** mrix,

  # Its window on superbacked’s own Wayland session, GPU and shared
  # memory; the session bus for portals and notifications.
  owner @{run}/user/[0-9]*/ r,
  owner @{run}/user/[0-9]*/wayland-[0-9]* rw,
  owner @{run}/user/[0-9]*/bus rw,
  owner @{run}/user/[0-9]*/at-spi/bus{,*} rw,
  /dev/dri/ r,
  /dev/dri/* rw,
  owner /dev/shm/** rwk,
  /etc/machine-id r,
  /run/udev/data/* r,
  /sys/bus/pci/devices/ r,
  /sys/devices/**/uevent r,
  /sys/devices/system/cpu/{,**} r,

  # Camera — the block/QR scanner reads V4L2 directly.
  /dev/video[0-9]* rw,
  /dev/media[0-9]* rw,
  /sys/class/video4linux/ r,
  /sys/class/video4linux/** r,

  # The user’s home — its own config and cache, and the backups and
  # exports the user reads and writes. Broad, minus the sensitive
  # corners denied at the end; nothing in home survives a reboot.
  owner @{HOME}/ rw,
  owner @{HOME}/** rwk,

  # External USB drives — the persistent storage users export to.
  /media/ r,
  /media/*/ r,
  /media/** rwk,

  # Printing blocks. CUPS job privacy (the cupsd.conf default)
  # keeps other users’ job names and documents opaque, so allowing the
  # socket does not let the app read what else was printed.
  /{run,var/run}/cups/cups.sock rw,
  /etc/cups/client.conf r,

  # Scratch space and self-introspection Chromium needs.
  owner /tmp/ r,
  owner /tmp/** rwk,
  @{PROC}/ r,
  @{PROC}/filesystems r,
  @{PROC}/mounts r,
  @{PROC}/sys/kernel/random/boot_id r,
  @{PROC}/sys/kernel/yama/ptrace_scope r,
  @{PROC}/sys/vm/max_map_count r,
  owner @{PROC}/@{pid}/ r,
  owner @{PROC}/@{pid}/** rw,
  /sys/fs/cgroup/** r,

  # Off-limits even though same-user or otherwise reachable: the
  # browser user’s world and any key material.
  deny /home/clearnet/{,**} mrwklx,
  deny @{HOME}/.gnupg/{,**} mrwkl,
  deny @{HOME}/.ssh/{,**} mrwkl,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/superbacked>
}
