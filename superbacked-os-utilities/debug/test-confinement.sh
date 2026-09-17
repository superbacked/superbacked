#! /bin/bash
# Confinement check for a debug-variant Superbacked OS — one PASS, FAIL
# or SKIP line per check, so the whole output can be pasted back for
# review. Every check exercises a boundary and shows it holds: the
# firewall for root and the browser user, the AppArmor profiles from
# inside (a shell entered with aa-exec makes the profile’s own connects
# and opens), user separation seen from the browser user, the
# display-isolation link, and the browser-launch chain entered from
# the Superbacked app’s confinement. Nothing the bootstrap wrote is
# read back — a build that completed already guarantees that; a check
# earns its line by attempting the forbidden thing. The split with
# test-hardening.sh is by privilege: everything here needs sudo, enters
# a profile with aa-exec or disturbs the session, so it needs a debug
# image (which keeps sudo for the primary user) and refuses to run
# elsewhere; everything the primary user can attempt with no root lives
# in test-hardening.sh, which runs on any image. Load the repository
# profiles in enforce mode first (update-apparmor-profiles.sh
# --enforce); checks note complain mode but do not switch it. The full
# run launches Firefox twice, moves the session’s compositor socket
# aside for a few seconds, unloads and reloads the browser-launch
# profiles, adds a dummy route in air-gapped mode and asks for a FIDO
# key and a USB printer when none is plugged in — a SKIP is a decision,
# never a default. Every check restores what it changes, including on
# interrupt. No errexit — most checks expect a command to fail.
#
# Usage: bash test-confinement.sh

set -o pipefail

if [ $# -gt 0 ]; then
  printf "%s\n" "Error: this script takes no options — there is one way to run it, in full" >&2
  exit 1
fi

passed=0
failed=0
skipped=0

pass() { passed=$((passed + 1)); printf "PASS  %s\n" "${1}"; }
fail() { failed=$((failed + 1)); printf "FAIL  %s\n" "${1}"; }
skip() { skipped=$((skipped + 1)); printf "SKIP  %s\n" "${1}"; }
note() { printf "      %s\n" "${1}"; }

# expect_success DESCRIPTION COMMAND… — passes when the command exits 0
expect_success() {
  local description="${1}"
  shift
  if "$@" > /dev/null 2>&1; then pass "${description}"; else fail "${description}"; fi
}

# expect_failure DESCRIPTION COMMAND… — passes when the command exits
# non-zero (a refusal), printing its first line of output for review
expect_failure() {
  local description="${1}"
  local output
  shift
  output="$("$@" 2>&1)"
  if [ $? -ne 0 ]; then
    pass "${description}"
  else
    fail "${description} (command succeeded)"
  fi
  [ -z "${output}" ] || note "$(printf "%s" "${output}" | head --lines 1)"
}

# expect_refusal DESCRIPTION EXPECTED COMMAND… — like expect_failure,
# but the refusal must come from the browser launcher or helper itself
# (its output contains EXPECTED); a failure for any other reason, such
# as the exec being denied, is a harness problem and fails the check
expect_refusal() {
  local description="${1}"
  local expected="${2}"
  local output
  shift 2
  output="$("$@" 2>&1)"
  if [ $? -eq 0 ]; then
    fail "${description} (command succeeded)"
  elif printf "%s" "${output}" | grep --quiet --fixed-strings "${expected}"; then
    pass "${description}"
  else
    fail "${description} (refused for the wrong reason)"
  fi
  [ -z "${output}" ] || note "$(printf "%s" "${output}" | head --lines 1)"
}

# await_hardware NAME CHECK… — when CHECK fails, asks for NAME to be
# plugged in and retries until it passes or the answer is s; returns 0
# when present, 1 to skip. With no terminal to ask on, absent hardware
# skips without asking.
await_hardware() {
  local name="${1}"
  local answer
  shift
  while ! "$@" > /dev/null 2>&1; do
    if [ ! -t 0 ]; then
      return 1
    fi
    printf "      plug in %s and press Enter to test it, or type s to skip: " "${name}"
    read -r answer < /dev/tty
    if [ "${answer}" = s ]; then
      return 1
    fi
    sleep 2
  done
  return 0
}
usb_printer_present() { grep --quiet --line-regexp 07 /sys/bus/usb/devices/*/bInterfaceClass 2> /dev/null; }
# A default route is what makes a refusal distinguishable from
# “unreachable”, and what lets the browser user’s allowed paths be
# shown to work at all.
network_present() { [ -n "$(ip route show default 2> /dev/null)" ]; }
fido_key_present() {
  local node
  for node in /dev/hidraw*; do
    [ -e "${node}" ] || continue
    if udevadm info --query=property --name="${node}" | grep --quiet "^ID_FIDO_TOKEN=1$"; then
      return 0
    fi
  done
  return 1
}

launcher=/usr/local/bin/superbacked-browser
helper=/usr/local/libexec/superbacked-browser-helper
allowed_url=https://superbacked.com/superbacked-os
uid="$(id --user)"
runtime_dir="/run/user/${uid}"
compositor="${runtime_dir}/wayland-0"
compositor_link="${runtime_dir}/superbacked-browser/compositor"
# Mozilla’s deb names the main process firefox-bin; older layouts used
# firefox. pgrep and pkill patterns are regular expressions, and
# --exact anchors them to the whole name.
firefox_name="firefox(-bin)?"
refusal="Error: expected zero arguments or one allowed external URL"

if grep --quiet superbacked.browser /proc/cmdline; then
  mode="hardened browser"
else
  mode="air-gapped"
fi
if ! id --groups --name | grep --quiet --word-regexp sudo; then
  printf "%s\n" "Error: the primary user has no sudo here — this script needs a debug image (run test-hardening.sh on this one)" >&2
  exit 1
fi

# Runs the browser launcher the way the Superbacked app does: a process
# already confined by the app’s profile execs it, so the profile’s Px
# rule is what transitions into the browser launcher profile. dash is
# the stepping stone because it reads none of the Bash startup
# variables, so hostile environments reach the launcher intact.
# (aa-exec on the launcher directly would run the launcher’s own shell
# under the app’s profile, which may exec that file but not read it.)
# Leading NAME=VALUE arguments become the hostile environment; the rest
# are launcher arguments.
from_app() {
  local -a pairs=()
  while [ $# -gt 0 ] && [[ "${1}" =~ ^[A-Za-z_][A-Za-z0-9_%]*= ]]; do
    pairs+=("${1}")
    shift
  done
  env "${pairs[@]}" aa-exec --profile superbacked -- /usr/bin/dash -c 'exec "$0" "$@"' "${launcher}" "$@"
}

# A shell entered through aa-exec runs under the named profile, so its
# own opens and built-in TCP/UDP connects are that profile’s — this
# tests the AppArmor layer independently of file permissions and of
# the firewall. Profiles are named in check descriptions by what they
# confine: the Superbacked app, Firefox, Yubico Authenticator, the
# browser launcher (superbacked-browser) and the browser helper
# (superbacked-browser-helper).
in_profile() {
  local profile="${1}"
  shift
  timeout 5 aa-exec --profile "${profile}" -- "$@"
}
tcp_probe() { in_profile "${1}" bash -c "exec 3<> /dev/tcp/${2}/${3}"; }
# UDP has no handshake, so the send is what the firewall or profile
# refuses (EPERM), not the connect.
udp_probe() { in_profile "${1}" bash -c "exec 3<> /dev/udp/${2}/${3}; echo x >&3"; }
as_user() {
  local user="${1}"
  shift
  sudo --non-interactive --user "${user}" timeout 5 "$@"
}
# The default drop covers every protocol — the probes below cover TCP,
# UDP and ICMP rather than trusting that. ping uses ICMP datagram
# sockets, so it needs no root. The system is IPv4-only by design
# (IPv6 is off by sysctl on every interface), so IPv6 is probed as an
# attempt that must fail for root and the browser user too, not as a
# second family with its own rules. The attempt is a UDP connect to
# ::1, which succeeds whenever ::1 is configured (nothing need listen)
# and fails only when it is not — a TCP connect would fail either way.
if command -v ping > /dev/null; then have_ping=true; else have_ping=false; fi

printf "%s\n" "== Environment"
note "user: $(id --user --name), groups: $(id --groups --name)"
note "boot mode: ${mode}"
note "kernel: $(uname --kernel-release)"

printf "\n%s\n" "== AppArmor"
profiles="$(sudo cat /sys/kernel/security/apparmor/profiles 2> /dev/null)"
for profile in firefox superbacked superbacked-browser superbacked-browser-helper superbacked-browser-sudo yubico-authenticator; do
  line="$(printf "%s\n" "${profiles}" | grep --extended-regexp "^${profile} \(")"
  case "${line}" in
    *"(enforce)"*) pass "profile ${profile} loaded (enforce)" ;;
    *"(complain)"*) fail "profile ${profile} loaded but in complain mode" ;;
    *) fail "profile ${profile} not loaded" ;;
  esac
done

printf "\n%s\n" "== Network confinement by user (firewall)"
# Both rulesets drop IPv6 before any allowance, but with IPv6 off by
# sysctl there is no address to send from, so the rule is invisible.
# IPv6 is re-enabled on loopback alone for the probe — ::1 comes back,
# nothing can leave the machine — and disabled again on every exit
# path. The datagram must be refused by the firewall (EPERM), not
# delivered, which proves the second layer holds without the first.
if sudo sysctl --quiet --write net.ipv6.conf.lo.disable_ipv6=0; then
  trap 'sudo sysctl --quiet --write net.ipv6.conf.lo.disable_ipv6=1' EXIT INT TERM
  for _ in $(seq 20); do
    ip -6 address show dev lo 2> /dev/null | grep --quiet "inet6 ::1" && break
    sleep 0.1
  done
  expect_success "IPv6 loopback address present for the probe (::1)" bash -c 'ip -6 address show dev lo | grep --quiet "inet6 ::1"'
  expect_failure "firewall drops the primary user’s IPv6 even with an address (::1:9/udp)" timeout 5 bash -c "exec 3<> /dev/udp/::1/9; echo x >&3"
  expect_failure "firewall drops root’s IPv6 even with an address (::1:9/udp)" sudo timeout 5 bash -c "exec 3<> /dev/udp/::1/9; echo x >&3"
  sudo sysctl --quiet --write net.ipv6.conf.lo.disable_ipv6=1
  trap - EXIT INT TERM
  expect_failure "IPv6 loopback address gone again" bash -c 'ip -6 address show dev lo 2> /dev/null | grep --quiet inet6'
else
  skip "IPv6 firewall probe (could not re-enable IPv6 on loopback)"
fi
if [ "${mode}" = "hardened browser" ]; then
  expect_failure "root cannot open an IPv6 socket (IPv4-only system)" sudo timeout 5 bash -c "exec 3<> /dev/udp/::1/9"
  expect_failure "browser user cannot open an IPv6 socket (IPv4-only system)" as_user browser bash -c "exec 3<> /dev/udp/::1/9"
  expect_failure "browser user kept off loopback (127.0.0.1:631)" as_user browser bash -c "exec 3<> /dev/tcp/127.0.0.1/631"
  # Everything else here needs a route: the refusals to be the
  # firewall’s rather than “unreachable”, and the browser user’s and
  # timesync user’s allowed paths to be shown to work. So the script
  # asks for the cable and waits for the route, as it does for hardware.
  if await_hardware "the network cable" network_present; then
    expect_failure "root has no web egress (1.1.1.1:443)" sudo timeout 5 bash -c "exec 3<> /dev/tcp/1.1.1.1/443"
    expect_failure "root cannot resolve names (superbacked.com)" sudo timeout 5 getent ahosts superbacked.com
    expect_failure "root cannot send UDP (1.1.1.1:53)" sudo timeout 5 bash -c "exec 3<> /dev/udp/1.1.1.1/53; echo x >&3"
    expect_success "browser user reaches the web (1.1.1.1:443)" as_user browser bash -c "exec 3<> /dev/tcp/1.1.1.1/443"
    expect_success "browser user may send QUIC (1.1.1.1:443/udp)" as_user browser bash -c "exec 3<> /dev/udp/1.1.1.1/443; echo x >&3"
    expect_failure "browser user cannot send plaintext DNS (1.1.1.1:53/udp)" as_user browser bash -c "exec 3<> /dev/udp/1.1.1.1/53; echo x >&3"
    expect_failure "browser user denied non-web port (1.1.1.1:22)" as_user browser bash -c "exec 3<> /dev/tcp/1.1.1.1/22"
    expect_failure "browser user denied non-web port (1.1.1.1:8080)" as_user browser bash -c "exec 3<> /dev/tcp/1.1.1.1/8080"
    if [ "${have_ping}" = true ]; then
      expect_failure "root cannot ping (1.1.1.1)" sudo timeout 5 ping -c 1 -W 2 1.1.1.1
      expect_failure "browser user cannot ping (1.1.1.1)" as_user browser ping -c 1 -W 2 1.1.1.1
    else
      skip "ICMP probes (ping not installed)"
    fi
    expect_success "timesync user reaches its pinned server (162.159.200.1:123/udp)" as_user systemd-timesync bash -c "exec 3<> /dev/udp/162.159.200.1/123; echo x >&3"
    expect_failure "timesync user denied other servers (1.1.1.1:123/udp)" as_user systemd-timesync bash -c "exec 3<> /dev/udp/1.1.1.1/123; echo x >&3"
  else
    skip "per-user egress probes (no network connection — a refusal cannot be told apart from unreachable)"
  fi
else
  # Without a route every send fails with “unreachable”, which says
  # nothing about the firewall. A dummy interface with a route
  # (documentation prefix) makes the firewall’s own refusal (“not
  # permitted”) observable. Removed on every exit path.
  if sudo ip link add sbtest type dummy 2> /dev/null; then
    trap 'sudo ip link delete sbtest 2> /dev/null' EXIT INT TERM
    if sudo ip link set sbtest up && sudo ip route add 192.0.2.0/24 dev sbtest; then
      expect_failure "air-gapped firewall drops the primary user’s TCP even with a route (192.0.2.1:443)" timeout 5 bash -c "exec 3<> /dev/tcp/192.0.2.1/443"
      expect_failure "air-gapped firewall drops the primary user’s UDP even with a route (192.0.2.1:53)" timeout 5 bash -c "exec 3<> /dev/udp/192.0.2.1/53; echo x >&3"
      if [ "${have_ping}" = true ]; then
        expect_failure "air-gapped firewall drops the primary user’s ICMP even with a route (192.0.2.1)" timeout 5 ping -c 1 -W 2 192.0.2.1
      fi
      expect_failure "air-gapped firewall drops root’s DHCP even with a route (192.0.2.1:67/udp)" sudo timeout 5 bash -c "exec 3<> /dev/udp/192.0.2.1/67; echo x >&3"
      expect_failure "air-gapped firewall drops the browser user’s TCP even with a route (192.0.2.1:443)" as_user browser bash -c "exec 3<> /dev/tcp/192.0.2.1/443"
    else
      skip "air-gapped firewall probe (could not route through the dummy interface)"
    fi
    sudo ip link delete sbtest
    trap - EXIT INT TERM
  else
    skip "air-gapped firewall probe (could not create a dummy interface)"
  fi
  expect_failure "browser user has no egress (1.1.1.1:443)" as_user browser bash -c "exec 3<> /dev/tcp/1.1.1.1/443"
fi

printf "\n%s\n" "== Network confinement by profile (AppArmor)"
expect_failure "Superbacked app profile denies egress (1.1.1.1:443)" tcp_probe superbacked 1.1.1.1 443
expect_failure "Superbacked app profile denies UDP even on loopback (127.0.0.1:53)" udp_probe superbacked 127.0.0.1 53
if systemctl --quiet is-active cups.service; then
  expect_success "Superbacked app profile allows loopback TCP (127.0.0.1:631, cupsd)" tcp_probe superbacked 127.0.0.1 631
  expect_failure "browser launcher profile denies loopback (127.0.0.1:631)" tcp_probe superbacked-browser 127.0.0.1 631
  expect_failure "browser helper profile denies loopback (127.0.0.1:631)" tcp_probe superbacked-browser-helper 127.0.0.1 631
  expect_failure "Yubico Authenticator profile denies loopback (127.0.0.1:631)" tcp_probe yubico-authenticator 127.0.0.1 631
else
  skip "loopback probes (cups.service not active)"
fi
expect_failure "browser launcher profile denies egress (1.1.1.1:443)" tcp_probe superbacked-browser 1.1.1.1 443
expect_failure "browser helper profile denies egress (1.1.1.1:443)" tcp_probe superbacked-browser-helper 1.1.1.1 443
expect_failure "Yubico Authenticator profile denies egress (1.1.1.1:443)" tcp_probe yubico-authenticator 1.1.1.1 443
expect_failure "Yubico Authenticator profile denies UDP (127.0.0.1:53)" udp_probe yubico-authenticator 127.0.0.1 53

printf "\n%s\n" "== User separation seen from the browser user"
expect_failure "browser user cannot log in" sudo --non-interactive su - browser --command true
expect_success "browser user has no sudo" bash -c 'sudo --non-interactive --list --other-user browser 2>&1 | grep --quiet "not allowed to run sudo"'
expect_failure "browser user cannot list /home/superbacked" as_user browser ls /home/superbacked
expect_failure "browser user cannot list the primary user’s runtime directory" as_user browser ls "${runtime_dir}"
if [ -d /media/superbacked ]; then
  expect_failure "browser user cannot list /media/superbacked" as_user browser ls /media/superbacked
else
  skip "browser user access to USB media (no drive mounted)"
fi
# The FIDO node is the one hidraw device the browser user may open
# (WebAuthn); every other hidraw device, the YubiKey’s OTP interface
# included, must be refused. Without a key the script asks for one.
if await_hardware "a FIDO security key" fido_key_present; then
  # Firefox finds the key through libudev, which lists the sysfs
  # subsystem directories before descending into hidraw — the
  # enumeration is probed from inside the Firefox profile, and the node
  # is opened as the browser user under that profile, which is the
  # real path. ls is entered through aa-exec directly: the profile
  # permits no exec but Firefox’s own binaries, so a shell launching
  # ls would be refused the exec and prove nothing about sysfs.
  expect_success "Firefox profile may enumerate HID devices for WebAuthn (/sys/class, /sys/bus, /sys/class/hidraw)" in_profile firefox ls /sys/class/ /sys/bus/ /sys/class/hidraw/
  fido_seen=false
  other_seen=false
  for node in /dev/hidraw*; do
    [ -e "${node}" ] || continue
    if udevadm info --query=property --name="${node}" | grep --quiet "^ID_FIDO_TOKEN=1$"; then
      fido_seen=true
      expect_success "browser user can open the FIDO node ${node} (WebAuthn)" as_user browser bash -c "exec 3<> ${node}"
      expect_success "Firefox profile as the browser user can open the FIDO node ${node}" as_user browser aa-exec --profile firefox -- bash -c "exec 3<> ${node}"
    else
      other_seen=true
      expect_failure "browser user cannot open non-FIDO hidraw ${node}" as_user browser bash -c "exec 3<> ${node}"
    fi
  done
  [ "${fido_seen}" = true ] || fail "FIDO key reported present but no FIDO hidraw node found"
  [ "${other_seen}" = true ] || skip "browser user non-FIDO hidraw denial (no other hidraw device present)"
else
  skip "browser user FIDO access (no FIDO key plugged in)"
fi

printf "\n%s\n" "== Downloads share boundary"
as_user browser bash -c 'printf "%s\n" "#! /bin/sh" "echo ran" > /home/browser/Downloads/sbtest.sh && chmod +x /home/browser/Downloads/sbtest.sh && ln --symbolic --force /home/browser/.config /home/browser/Downloads/sbtest-link' > /dev/null 2>&1
expect_success "primary user can read a downloaded file" cat /home/superbacked/Downloads/sbtest.sh
expect_failure "primary user cannot execute a downloaded file (noexec)" /home/superbacked/Downloads/sbtest.sh
expect_failure "a symlink planted by the browser user is not followed (nosymfollow)" ls /home/superbacked/Downloads/sbtest-link/
expect_failure "Superbacked app profile cannot read browser-owned downloads (owner rule)" in_profile superbacked cat /home/superbacked/Downloads/sbtest.sh
expect_success "primary user can clear downloads" rm --force /home/superbacked/Downloads/sbtest.sh /home/superbacked/Downloads/sbtest-link
expect_failure "browser user cannot see the primary user’s Downloads view" as_user browser ls /home/superbacked/Downloads

printf "\n%s\n" "== Display isolation"
expect_failure "Superbacked app profile cannot list the compositor link directory" in_profile superbacked ls "${runtime_dir}/superbacked-browser"
expect_failure "Superbacked app profile cannot remove the compositor link" in_profile superbacked rm --force "${compositor_link}"
expect_failure "Superbacked app profile cannot replace the compositor link" in_profile superbacked ln --force "${compositor}" "${compositor_link}"
expect_success "compositor link intact afterwards" test -S "${compositor_link}"
# The real socket is moved aside and a waypipe client bound in its
# place. The browser launcher connects through the session unit’s hard
# link, which references mutter’s socket inode, so the link must still
# name the real socket and not the fake. New Wayland clients cannot
# connect to the session for the few seconds this takes, so the socket
# is restored on every exit path.
if [ ! -S "${compositor}" ]; then
  skip "fake compositor (${compositor} is not a socket)"
elif [ ! -S "${compositor_link}" ]; then
  fail "compositor link missing (${compositor_link}) — did the session unit run?"
else
  fake_pid=""
  restore_compositor() {
    if [ -n "${fake_pid}" ]; then
      kill "${fake_pid}" 2> /dev/null || true
      wait "${fake_pid}" 2> /dev/null || true
    fi
    rm --force "${compositor}"
    mv "${compositor}.real" "${compositor}"
    trap - EXIT INT TERM
  }
  mv "${compositor}" "${compositor}.real"
  trap restore_compositor EXIT INT TERM
  waypipe --socket "${compositor}" client > /dev/null 2>&1 &
  fake_pid=$!
  for _ in $(seq 50); do
    if [ -S "${compositor}" ]; then
      break
    fi
    sleep 0.1
  done
  expect_success "compositor link still names the real socket" \
    bash -c "[ \"\$(stat --format=%i '${compositor_link}')\" = \"\$(stat --format=%i '${compositor}.real')\" ]"
  expect_failure "compositor link does not name the fake" \
    bash -c "[ \"\$(stat --format=%i '${compositor_link}')\" = \"\$(stat --format=%i '${compositor}')\" ]"
  restore_compositor
  expect_success "session compositor socket restored" test -S "${compositor}"
fi

printf "\n%s\n" "== Application confinement"
# unshare execs a command inside the new namespace, so each probe uses
# one its profile may exec — otherwise an exec denial would masquerade
# as a namespace denial.
expect_success "Superbacked app profile may create user namespaces (Chromium sandbox)" in_profile superbacked unshare --user cat /dev/null
expect_failure "browser launcher profile may not create user namespaces" in_profile superbacked-browser unshare --user id
mkdir --parents ~/.ssh ~/.gnupg ~/.local/share/keyrings
for canary in ~/.ssh/sbtest-canary ~/.gnupg/sbtest-canary ~/.local/share/keyrings/sbtest-canary; do
  touch "${canary}"
  expect_failure "Superbacked app profile denies key material ${canary/#$HOME/~}" in_profile superbacked cat "${canary}"
  rm --force "${canary}"
done
expect_failure "Superbacked app profile denies /mnt" in_profile superbacked ls /mnt
expect_failure "Superbacked app profile denies the pathname X11 socket" in_profile superbacked bash -c 'exec 3<> /tmp/.X11-unix/X0'
expect_failure "Firefox profile denies the primary user’s home" in_profile firefox ls /home/superbacked
expect_failure "Firefox profile denies /media" in_profile firefox ls /media
if [ -e /dev/video0 ]; then
  expect_failure "Firefox profile denies the camera" in_profile firefox bash -c 'exec 3<> /dev/video0'
  expect_success "Superbacked app profile may open the camera (block scanner)" in_profile superbacked bash -c 'exec 3<> /dev/video0'
else
  skip "camera probes (no /dev/video0)"
fi
if [ -e /dev/snd/controlC0 ]; then
  expect_failure "Firefox profile denies raw ALSA" in_profile firefox bash -c 'exec 3<> /dev/snd/controlC0'
else
  skip "ALSA probe (no /dev/snd/controlC0)"
fi
expect_failure "Firefox profile denies the pipewire socket" in_profile firefox bash -c "exec 3<> ${runtime_dir}/pipewire-0"
# The Firefox profile’s CUPS socket denial is not probed: no client the
# profile may exec can open a unix socket, so any probe would be refused
# at exec time and prove nothing about the socket rule.
# The Superbacked app profile’s side of printing: the same CUPS calls
# the app makes (src/handlers/print.ts), made from inside the profile.
# lpstat needs no printer; the attribute fetch needs a USB printer, and
# the script asks for one as test-hardening.sh does.
expect_success "Superbacked app profile may query CUPS (lpstat -r)" in_profile superbacked lpstat -r
expect_success "Superbacked app profile may read the default destination (lpstat -d)" in_profile superbacked lpstat -d
if await_hardware "a USB printer" usb_printer_present; then
  destination="$(lpstat -e 2> /dev/null | head --lines 1)"
  if [ -n "${destination}" ]; then
    expect_success "Superbacked app profile may fetch printer attributes (lpoptions -p ${destination} -l)" bash -c "timeout 20 aa-exec --profile superbacked -- lpoptions -p '${destination}' -l 2> /dev/null | grep --quiet '^PageSize'"
  else
    fail "USB printer present but CUPS lists no destination (see test-hardening.sh)"
  fi
else
  skip "Superbacked app profile printer attribute fetch (no USB printer plugged in)"
fi
expect_failure "Yubico Authenticator profile denies /media" in_profile yubico-authenticator ls /media
mkdir --parents ~/.ssh
expect_failure "Yubico Authenticator profile denies ~/.ssh" in_profile yubico-authenticator ls ~/.ssh
expect_failure "browser launcher profile denies the primary user’s home" in_profile superbacked-browser ls /home/superbacked
expect_failure "browser launcher profile denies /tmp" in_profile superbacked-browser ls /tmp
expect_failure "browser helper profile denies /media" in_profile superbacked-browser-helper ls /media
expect_failure "browser helper profile denies /tmp" in_profile superbacked-browser-helper ls /tmp
# aa-exec bypasses the target profile’s exec rules, so this shows sudo
# cannot run under the profile (its libraries are denied), not that the
# browser helper is refused the exec itself.
expect_failure "sudo cannot run under the browser helper profile" in_profile superbacked-browser-helper sudo true

printf "\n%s\n" "== Browser launch chain: hostile inputs from the Superbacked app’s confinement"
printf '%s\n' 'touch /tmp/pwned-bash-env' > /tmp/evil
rm --force /tmp/pwned-*
expect_refusal "browser launcher rejects BASH_ENV + non-allowlisted URL" "${refusal}" \
  from_app BASH_ENV=/tmp/evil https://example.com
expect_refusal "browser launcher rejects exported kill() + non-allowlisted URL" "${refusal}" \
  from_app 'BASH_FUNC_kill%%=() { touch /tmp/pwned-func; }' https://example.com
expect_refusal "browser launcher rejects SHELLOPTS=xtrace + PS4 substitution + query string" "${refusal}" \
  from_app SHELLOPTS=xtrace 'PS4=$(touch /tmp/pwned-ps4)' "${allowed_url}?x"
expect_refusal "browser launcher ignores the caller’s WAYLAND_DISPLAY (non-allowlisted URL still refused)" "${refusal}" \
  from_app WAYLAND_DISPLAY=wayland-9 https://example.com
expect_refusal "browser launcher rejects two arguments" "${refusal}" \
  from_app "${allowed_url}" "${allowed_url}"
expect_refusal "browser launcher rejects trailing slash variant" "${refusal}" \
  from_app "${allowed_url}/"
if ls /tmp/pwned-* > /dev/null 2>&1; then
  fail "marker files appeared: $(ls /tmp/pwned-* | tr '\n' ' ')"
else
  pass "no marker files created by any hostile input"
fi
rm --force /tmp/evil /tmp/pwned-*

printf "\n%s\n" "== Browser launch chain: fail closed"
# Unloading a profile under live processes is not something to do with
# a browser chain running, so this only runs when none is.
if pgrep --exact "${firefox_name}" > /dev/null || pgrep waypipe > /dev/null; then
  skip "fail-closed probe (a browser chain is running — close Firefox first)"
else
  sudo apparmor_parser --remove /etc/apparmor.d/superbacked-browser
  expect_failure "Superbacked app profile cannot exec the browser launcher with its profile unloaded" from_app
  sudo apparmor_parser --replace /etc/apparmor.d/superbacked-browser
  expect_success "browser-launch profiles reloaded" bash -c 'sudo cat /sys/kernel/security/apparmor/profiles | grep --quiet "^superbacked-browser-helper "'
fi

printf "\n%s\n" "== Browser launch chain: real launch"
if [ "${mode}" != "hardened browser" ]; then
  skip "launch (boot the hardened browser entry)"
elif pgrep --exact "${firefox_name}" > /dev/null || pgrep waypipe > /dev/null; then
  fail "launch skipped: a browser chain is already running — close Firefox first"
else
  note "Firefox opens and is closed again by this check — do not close it yourself"
  # The kernel log is checked for the launch window only, so the
  # denials the probes above provoke on purpose do not count. The
  # window opens a second after the last probe (journalctl resolves
  # --since to the second) and closes once Firefox has exited.
  sleep 1
  launch_since="$(date '+%Y-%m-%d %H:%M:%S')"
  # SBTEST_CANARY rides in the caller’s environment; nothing below the
  # browser launcher may carry it.
  from_app SBTEST_CANARY=1 "${allowed_url}" > /tmp/launch.log 2>&1 &
  # Capture the chain as soon as Firefox is up rather than after a
  # fixed wait, so a quickly closed window cannot empty the table.
  labels=""
  for _ in $(seq 60); do
    labels="$(ps -eo user,label,args | grep --extended-regexp "superbacked-browser|waypipe|firefox" | grep --invert-match --extended-regexp "grep|test-confinement")"
    if printf "%s\n" "${labels}" | grep --quiet "/usr/lib/firefox/firefox"; then
      break
    fi
    sleep 0.5
  done
  sleep 2
  labels="$(ps -eo user,label,args | grep --extended-regexp "superbacked-browser|waypipe|firefox" | grep --invert-match --extended-regexp "grep|test-confinement")"
  note "browser launcher output so far (/tmp/launch.log):"
  sed 's/^/        /' /tmp/launch.log | cut --characters 1-160
  printf "%s\n" "${labels}" | sed 's/^/      /' | cut --characters 1-140
  expect_success "browser launcher labeled superbacked-browser (enforce)" bash -c "printf '%s\n' \"${labels}\" | grep --quiet 'superbacked-browser (enforce).*/bin/bash -p ${launcher}'"
  expect_success "sudo labeled superbacked-browser-sudo (enforce)" bash -c "printf '%s\n' \"${labels}\" | grep --quiet 'superbacked-browser-sudo (enforce)'"
  expect_success "browser helper’s waypipe runs as the browser user under superbacked-browser-helper (enforce)" bash -c "printf '%s\n' \"${labels}\" | grep --quiet '^browser .*superbacked-browser-helper (enforce).*waypipe'"
  expect_success "Firefox runs as the browser user under firefox (enforce)" bash -c "printf '%s\n' \"${labels}\" | grep --quiet '^browser .*firefox (enforce).*firefox'"
  expect_failure "nothing in the chain is unconfined" bash -c "printf '%s\n' \"${labels}\" | grep --quiet unconfined"
  expect_success "bridge socket is superbacked:browser 660" bash -c '[ "$(stat --format=%U:%G:%a /run/browser-bridge/waypipe.sock)" = superbacked:browser:660 ]'
  firefox_pid="$(pgrep --exact "${firefox_name}" | head --lines 1)"
  if [ -n "${firefox_pid}" ]; then
    expect_failure "caller’s environment does not reach Firefox" sudo grep --quiet --null-data SBTEST_CANARY "/proc/${firefox_pid}/environ"
    expect_failure "no DISPLAY, LD_*, BASH_ENV or SUDO_* in Firefox’s environment" sudo bash -c "tr '\0' '\n' < /proc/${firefox_pid}/environ | grep --quiet --extended-regexp '^(DISPLAY|LD_[A-Z_]+|BASH_ENV|SUDO_[A-Z_]+)='"
    expect_success "Firefox sees the private display name" sudo bash -c "tr '\0' '\n' < /proc/${firefox_pid}/environ | grep --quiet '^WAYLAND_DISPLAY=wayland-firefox$'"
    expect_success "Firefox’s standard input and output are /dev/null" sudo bash -c "[ \"\$(readlink /proc/${firefox_pid}/fd/0)\" = /dev/null ] && [ \"\$(readlink /proc/${firefox_pid}/fd/1)\" = /dev/null ]"
  else
    fail "Firefox process not found for environment checks"
  fi
  # Closing Firefox takes the same path as closing its window: Firefox
  # exits, the browser helper’s waypipe ends, sudo returns and the
  # browser launcher’s exit trap reaps its own waypipe — so the cleanup
  # check below exercises the real teardown in this same run.
  sudo pkill --exact --signal TERM "${firefox_name}" || true
  for _ in $(seq 40); do
    if ! pgrep --exact "${firefox_name}" > /dev/null && ! pgrep waypipe > /dev/null; then
      break
    fi
    sleep 0.5
  done
  expect_failure "Firefox closed on SIGTERM" pgrep --exact "${firefox_name}"
  launch_events="$(sudo journalctl --boot --dmesg --since "${launch_since}" 2> /dev/null | grep --extended-regexp 'apparmor="(ALLOWED|DENIED)"')"
  if [ -z "${launch_events}" ]; then
    pass "no AppArmor events during the real launch"
  else
    fail "AppArmor events during the real launch (a profile gap or an unexpected access)"
    printf "%s\n" "${launch_events}" | grep --only-matching --extended-regexp 'apparmor="[A-Z]+"|profile="[^"]+"|operation="[^"]*"|name="[^"]*"|denied_mask="[^"]*"' | paste - - - - - | sort | uniq --count | sed 's/^/      /'
  fi
  # A second launch, torn down from the other end: the primary user’s
  # waypipe client is killed instead of Firefox. The bridge dying must
  # take the whole chain with it — a browser-user Firefox left running
  # with no window would be invisible to the user. This is a
  # resilience property, distinct from the close above, and it is
  # not a substitute for it.
  printf "\n%s\n" "== Browser launch chain: bridge client dies"
  from_app "${allowed_url}" > /dev/null 2>&1 &
  for _ in $(seq 60); do
    pgrep --exact "${firefox_name}" > /dev/null && break
    sleep 0.5
  done
  # The waypipe client forks one relay per Wayland connection, so the
  # primary user owns a listener and a relay; only the relay carries
  # Firefox’s display, so every one of them is killed.
  client_pids="$(pgrep --euid "${uid}" --exact waypipe)"
  if ! pgrep --exact "${firefox_name}" > /dev/null; then
    fail "second launch: Firefox did not start within 30 s"
  elif [ -z "${client_pids}" ]; then
    fail "second launch: no waypipe client owned by the primary user found"
  else
    sleep 2
    # Unquoted on purpose: one PID per word.
    kill ${client_pids}
    for _ in $(seq 40); do
      if ! pgrep --exact "${firefox_name}" > /dev/null && ! pgrep waypipe > /dev/null; then
        break
      fi
      sleep 0.5
    done
    # Patterns are anchored so pgrep --full cannot match this very
    # shell, whose command line contains them.
    expect_failure "chain gone after the bridge client died (no Firefox, waypipe, sudo or browser helper left)" bash -c "pgrep --exact '${firefox_name}' || pgrep waypipe || pgrep --full '^/usr/bin/sudo --user browser' || pgrep --full '^/bin/bash -p ${helper}'"
    # Firefox dying takes the browser helper down with a non-zero exit,
    # and the browser launcher reports that to the user in an error
    # dialog — the right behaviour, since a browser that vanished
    # silently would be worse. The dialog is the launcher’s own zenity,
    # owned by the primary user, so this script can dismiss it.
    expect_success "browser launcher reports the broken bridge in an error dialog" pgrep --euid "${uid}" --exact zenity
    pkill --euid "${uid}" --exact zenity 2> /dev/null
    for _ in $(seq 20); do
      pgrep --full "^/bin/bash -p ${launcher}" > /dev/null || break
      sleep 0.5
    done
    expect_failure "browser launcher exited once the dialog was dismissed" pgrep --full "^/bin/bash -p ${launcher}"
  fi
fi

printf "\n%s\n" "== Radios"
# The one radio check that is a boundary rather than a readback: the
# module block must refuse a root load, not merely be absent right now.
expect_failure "Bluetooth module cannot be loaded even by root" sudo modprobe btusb

printf "\n%s\n" "== Cleanup after launches"
# Post-conditions of the run itself: the probes above move the session
# socket, kill bridge clients and abort Firefox, and none of that may
# leave the launch path damaged for the next click. A dead compositor
# link fails every launch silently (even the error dialog needs it).
if pgrep --list-full waypipe > /dev/null; then
  fail "waypipe processes still running with no browser open"
else
  pass "no leftover waypipe processes"
fi
expect_success "compositor link still names the session socket after the run" \
  bash -c "[ \"\$(stat --format=%i '${compositor_link}')\" = \"\$(stat --format=%i '${compositor}')\" ]"
browser_runtime_dir="/run/user/$(id --user browser)"
expect_failure "no leftover Firefox display socket in the browser user’s runtime directory" sudo test -e "${browser_runtime_dir}/wayland-firefox"
expect_failure "no leftover Firefox display lock in the browser user’s runtime directory" sudo test -e "${browser_runtime_dir}/wayland-firefox.lock"

printf "\n%s\n" "== AppArmor events this boot (kernel log, for information)"
# Not a check: the probes above provoke denials by design, so this
# boot’s log is never empty after a run. The launch window has its own
# check; real use is harvested after a profile reload (see the tests
# guide), when the log holds only what the apps themselves did.
events="$(sudo journalctl --boot --dmesg 2> /dev/null | grep --extended-regexp 'apparmor="(ALLOWED|DENIED)"')"
if [ -z "${events}" ]; then
  note "no AppArmor events logged this boot"
else
  printf "%s\n" "${events}" | grep --only-matching --extended-regexp 'apparmor="[A-Z]+"|profile="[^"]+"' | paste - - | sort | uniq --count | sed 's/^/      /'
  note "expected: only DENIED entries caused by the probes above — the denial checks themselves, /dev/tty and /dev/pts opens from the shells entered under each profile, and Firefox’s crash handler ptrace attempts from the bridge-cut teardown"
  note "for full lines: bash capture-apparmor-log.sh | bash summarize-apparmor-log.sh"
fi

printf "\n%s\n" "== Summary: ${passed} passed, ${failed} failed, ${skipped} skipped (${mode} mode)"
