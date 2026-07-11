# Superbacked OS — confined Firefox (Mozilla apt deb).
#
# Installed as /etc/apparmor.d/firefox, deliberately overwriting
# Ubuntu’s stock file of that name: the stock profile is
# flags=(unconfined) and exists only to grant userns under
# kernel.apparmor_restrict_unprivileged_userns=1, and two profiles
# cannot share an attachment path.
#
# Firefox only ever runs as the no-shell clearnet user, on a private
# waypipe Wayland display. This profile is the third layer: user
# separation isolates it from superbacked’s session and files, nftables
# limits egress to web ports for uid clearnet, and the rules below
# remove what the snap’s disconnected interfaces used to remove —
# camera, audio capture, X11, printing, USB media, other homes — while
# keeping hardware security keys (the snap kept u2f-devices connected).

abi <abi/4.0>,

include <tunables/global>

profile firefox /usr/lib/firefox/firefox{,-bin} {
  include <abstractions/base>
  include <abstractions/dbus-session-strict>
  include <abstractions/dconf>
  include <abstractions/dri-common>
  include <abstractions/dri-enumerate>
  include <abstractions/fonts>
  include <abstractions/freedesktop.org>
  include <abstractions/mesa>
  include <abstractions/nameservice>
  include <abstractions/ssl_certs>
  include <abstractions/vulkan>
  include <abstractions/wayland>

  # Content-process sandbox: unprivileged user namespaces, plus the
  # capabilities Firefox exercises inside those namespaces (AppArmor
  # still mediates capability use in a user namespace). Without userns
  # the sandbox fails closed and Firefox refuses to start content
  # processes.
  userns,
  capability sys_admin,
  capability sys_chroot,
  owner @{PROC}/@{pid}/{uid_map,gid_map,setgroups} w,

  # The only egress identity on the machine — nftables does the real
  # limiting (ports 80/443/QUIC for uid clearnet).
  network inet stream,
  network inet dgram,
  network inet6 stream,
  network inet6 dgram,
  network netlink raw,

  # AF_UNIX for Mozilla IPC socketpairs and the session bus, with the
  # abstract X11 socket carved out (Wayland-only OS; the path-based X
  # socket is denied below).
  unix,
  deny unix addr="@/tmp/.X11-unix/*",
  deny unix peer=(addr="@/tmp/.X11-unix/*"),

  # Own installation (libxul, omni.ja, dependentlibs.list,
  # distribution files).
  /usr/lib/firefox/ r,
  /usr/lib/firefox/** r,
  /usr/lib/firefox/**.so mr,
  /usr/lib/firefox/{firefox,firefox-bin} mrix,
  /usr/lib/firefox/{plugin-container,glxtest,vaapitest} mrix,
  # No crash reports, no self-updates (versions are decided by apt at
  # image creation time; policies.json disables updates too), no
  # telemetry uploads.
  deny /usr/lib/firefox/{crashreporter,minidump-analyzer,pingsender,updater} x,

  # Enterprise policy.
  /etc/firefox/ r,
  /etc/firefox/** r,

  # clearnet’s profile, cache, and the single blessed download folder
  # (policies.json pins DownloadDirectory to it; superbacked reads it
  # through a bind mount).
  owner /home/clearnet/ r,
  owner /home/clearnet/.mozilla/ rw,
  owner /home/clearnet/.mozilla/** rwk,
  owner /home/clearnet/.cache/ rw,
  owner /home/clearnet/.cache/mozilla/ rw,
  owner /home/clearnet/.cache/mozilla/** rwk,
  owner /home/clearnet/Downloads/ rw,
  owner /home/clearnet/Downloads/** rw,
  # Everything else under any home is out of bounds — including
  # superbacked’s (defense in depth; file permissions already forbid
  # it) and any key material that could ever appear in clearnet’s own
  # home.
  deny /home/superbacked/{,**} mrwklx,
  deny /home/clearnet/.gnupg/{,**} mrwkl,
  deny /home/clearnet/.ssh/{,**} mrwkl,

  # waypipe’s private Wayland display in clearnet’s XDG_RUNTIME_DIR.
  # wayland-firefox is the name clearnet-browser pins via --display;
  # the wildcard also covers waypipe’s unpinned default
  # (wayland-<8 random alphanumerics>, which the wayland abstraction’s
  # wayland-[0-9]* glob does not match).
  owner @{run}/user/[0-9]*/ r,
  owner @{run}/user/[0-9]*/wayland-firefox rw,
  owner @{run}/user/[0-9]*/wayland-* rw,
  # Session bus socket path (dbus-session-strict mediates the bus
  # itself).
  owner @{run}/user/[0-9]*/bus rw,
  # No audio in either direction. PipeWire carries playback and capture
  # over one socket, so allowing playback would also expose the
  # microphone — and this browser must never hear the room where
  # blocks are handled (the snap disconnected audio-record for the
  # same reason). Playback is sacrificed deliberately: it almost
  # certainly never worked anyway, since clearnet has no login seat and
  # logind grants its user instance no /dev/snd ACLs. Raw ALSA is
  # denied alongside the socket.
  deny @{run}/user/[0-9]*/pipewire-0 rw,
  deny /dev/snd/{,**} rw,

  # Shared memory for Mozilla IPC and Wayland wl_shm buffers (modern
  # Firefox mostly uses memfd, which AppArmor does not path-mediate;
  # these cover the /dev/shm fallbacks).
  owner /dev/shm/org.mozilla.ipc.* rw,
  owner /dev/shm/wayland.mozilla.ipc.* rw,
  owner /dev/shm/mozilla-ipc-* rw,

  # Keyboard layouts (Wayland clients compile keymaps themselves) and
  # GTK/GSettings plumbing.
  /usr/share/X11/xkb/{,**} r,
  /usr/share/glib-2.0/schemas/gschemas.compiled r,
  /etc/gtk-3.0/{,**} r,
  /usr/share/gtk-3.0/{,**} r,
  /etc/mime.types r,

  # Process introspection Firefox does on itself and its children
  # (same-label signal/ptrace is implicitly allowed; nothing else is).
  @{PROC}/ r,
  @{PROC}/cpuinfo r,
  @{PROC}/meminfo r,
  @{PROC}/sys/kernel/yama/ptrace_scope r,
  owner @{PROC}/@{pid}/cgroup r,
  owner @{PROC}/@{pid}/environ r,
  owner @{PROC}/@{pid}/fd/ r,
  owner @{PROC}/@{pid}/mountinfo r,
  owner @{PROC}/@{pid}/mounts r,
  owner @{PROC}/@{pid}/oom_score_adj rw,
  owner @{PROC}/@{pid}/smaps r,
  owner @{PROC}/@{pid}/smaps_rollup r,
  owner @{PROC}/@{pid}/stat r,
  owner @{PROC}/@{pid}/statm r,
  owner @{PROC}/@{pid}/status r,
  owner @{PROC}/@{pid}/task/ r,
  owner @{PROC}/@{pid}/task/*/comm rw,
  owner @{PROC}/@{pid}/task/*/stat r,
  /sys/devices/system/cpu/{,**} r,
  /sys/bus/pci/devices/ r,

  # Temp files (clearnet owns nothing else in /tmp; downloads never
  # land here — the policy pins DownloadDirectory).
  owner /tmp/ r,
  owner /tmp/** rwk,

  # WebAuthn: hardware security keys stay usable — same breadth as the
  # snap’s connected u2f-devices interface.
  /dev/hidraw* rw,
  /sys/class/hidraw/ r,
  /sys/devices/**/hidraw*/uevent r,
  /run/udev/data/* r,

  # What the snap interface hardening used to remove, restated as
  # explicit denials (also silences audit noise from probing):
  deny /dev/video[0-9]* mrwkl,                    # camera
  deny /media/{,**} mrwklx,                       # removable-media
  deny /mnt/{,**} mrwklx,
  deny /tmp/.X11-unix/{,**} rw,                   # x11 (path socket)
  deny /run/cups/{,**} rw,                        # cups-control
  deny /run/avahi-daemon/{,**} rw,                # avahi-observe
  deny /etc/shadow r,
  deny /etc/sudoers r,
  deny /etc/sudoers.d/{,**} r,
  deny capability sys_ptrace,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/firefox>
}
