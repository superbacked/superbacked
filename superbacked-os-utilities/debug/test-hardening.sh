#! /bin/bash
# Verifies that a running Superbacked OS behaves as the security model
# document says — the scripted form of its “Verifying the hardening”
# section, one PASS, FAIL or SKIP line per check. Every check tests an
# outcome the build could not see: how the machine actually booted,
# what the finished image contains, what the kernel reports, what the
# primary user is refused. Nothing the bootstrap wrote is read back —
# a build that completed already guarantees that. The split with
# test-confinement.sh is by privilege: everything here runs as the
# primary user with no root, so it runs unchanged on release and debug
# images alike (checks that only make sense on one kind of image print
# SKIP on the other); everything that needs sudo, enters a profile with
# aa-exec or disturbs the session lives in test-confinement.sh, which
# needs a debug image. The full run opens and closes the bundled apps,
# waits for a hand to close Firefox and asks for a USB printer when
# none is plugged in — a SKIP is a decision, never a default. No
# errexit — some checks expect a command to fail.
#
# Usage: bash test-hardening.sh

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
# non-zero, printing its first line of output for review
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
# “unreachable”: without one every egress probe would pass for the
# wrong reason.
network_present() { [ -n "$(ip route show default 2> /dev/null)" ]; }

launcher=/usr/local/bin/superbacked-browser
helper=/usr/local/libexec/superbacked-browser-helper
allowed_url=https://superbacked.com/superbacked-os
refusal="Error: expected zero arguments or one allowed external URL"
runtime_dir="/run/user/$(id --user)"
compositor="${runtime_dir}/wayland-0"
compositor_link="${runtime_dir}/superbacked-browser/compositor"
# Mozilla’s deb names the main process firefox-bin; older layouts used
# firefox. pgrep patterns are regular expressions, and --exact anchors
# them to the whole name.
firefox_name="firefox(-bin)?"

if grep --quiet superbacked.browser /proc/cmdline; then
  mode="hardened browser"
else
  mode="air-gapped"
fi
if id --groups --name | grep --quiet --word-regexp sudo; then
  full_sudo=true
else
  full_sudo=false
fi

printf "%s\n" "== Environment"
note "user: $(id --user --name), groups: $(id --groups --name)"
note "boot mode: ${mode}"
note "full sudo: ${full_sudo} (debug image: true, release image: false)"
note "kernel: $(uname --kernel-release)"

printf "\n%s\n" "== Application confinement"
expect_success "AppArmor enabled" grep --quiet Y /sys/module/apparmor/parameters/enabled
expect_success "apparmor.service active" systemctl --quiet is-active apparmor.service
# Labels are per process, so an app has to be running to have one.
# Each bundled app is opened through its desktop entry — the path the
# dock takes, so the entry itself is under test — its main process
# found by binary path, its label read and, if this script opened it,
# closed again with SIGTERM. Firefox is handled in the browser launch
# chain section below: its chain runs as the browser user, which the
# primary user cannot signal.
for entry in \
  "Superbacked app|/opt/Superbacked/superbacked|/usr/local/share/applications/superbacked.desktop" \
  "Yubico Authenticator|/opt/yubico-authenticator/authenticator|/usr/local/share/applications/com.yubico.yubioath.desktop"; do
  IFS="|" read -r name binary desktop <<< "${entry}"
  pid="$(pgrep --full --oldest "^${binary}" 2> /dev/null)"
  opened=false
  if [ -z "${pid}" ]; then
    gio launch "${desktop}" > /dev/null 2>&1
    for _ in $(seq 60); do
      pid="$(pgrep --full --oldest "^${binary}" 2> /dev/null)"
      [ -n "${pid}" ] && break
      sleep 0.5
    done
    opened=true
  fi
  if [ -n "${pid}" ]; then
    expect_success "${name} runs enforced ($(cat "/proc/${pid}/attr/current" 2> /dev/null))" bash -c "grep --quiet '(enforce)' /proc/${pid}/attr/current"
    if [ "${opened}" = true ]; then
      # Let the window come up before closing, so teardown runs the
      # same path a user’s close does.
      sleep 3
      kill "${pid}" 2> /dev/null
      for _ in $(seq 20); do
        pgrep --full "^${binary}" > /dev/null || break
        sleep 0.5
      done
      expect_failure "${name} closed again on SIGTERM" pgrep --full "^${binary}"
    fi
  else
    fail "${name} did not start within 30 s of gio launch ${desktop}"
  fi
done
expect_success "unprivileged user namespaces are restricted system-wide" bash -c '[ "$(sysctl --values kernel.apparmor_restrict_unprivileged_userns)" = 1 ]'

# Second so that both sections that open windows — and the one action
# that needs a hand, closing Firefox — come first; the rest of the run
# is unattended.
printf "\n%s\n" "== Browser launch chain"
# The browser launcher run directly by the primary user, with the
# startup variables an attacker would set; the browser helper run
# through the one sudo rule the primary user holds, with the arguments
# it must refuse. The same chain entered from inside the Superbacked
# app’s confinement is exercised by test-confinement.sh.
printf '%s\n' 'touch /tmp/pwned-bash-env' > /tmp/evil
rm --force /tmp/pwned-*
expect_refusal "browser launcher rejects BASH_ENV + non-allowlisted URL" "${refusal}" \
  env BASH_ENV=/tmp/evil "${launcher}" https://example.com
expect_refusal "browser launcher rejects exported kill() + non-allowlisted URL" "${refusal}" \
  env 'BASH_FUNC_kill%%=() { touch /tmp/pwned-func; }' "${launcher}" https://example.com
expect_refusal "browser launcher rejects two arguments" "${refusal}" "${launcher}" "${allowed_url}" "${allowed_url}"
expect_refusal "browser launcher rejects trailing slash variant" "${refusal}" "${launcher}" "${allowed_url}/"
if ls /tmp/pwned-* > /dev/null 2>&1; then
  fail "marker files appeared: $(ls /tmp/pwned-* | tr '\n' ' ')"
else
  pass "no marker files created by any hostile input"
fi
rm --force /tmp/evil /tmp/pwned-*
if [ "${mode}" = "hardened browser" ]; then
  expect_refusal "browser helper rejects non-allowlisted URL" "${refusal}" sudo --non-interactive --user browser "${helper}" https://evil.example
  expect_refusal "browser helper rejects option-looking argument" "${refusal}" sudo --non-interactive --user browser "${helper}" --new-window
  expect_refusal "browser helper rejects query string" "${refusal}" sudo --non-interactive --user browser "${helper}" "${allowed_url}?x"
else
  expect_refusal "browser helper refuses to run in air-gapped mode" "hardened browser mode is not active" sudo --non-interactive --user browser "${helper}"
  expect_failure "no browser chain started by that call" bash -c "pgrep --exact '${firefox_name}' || pgrep waypipe"
fi
# The real chain, entered the way the dock enters it. Every label in it
# is readable through ps whatever user owns the process, and the bridge
# socket is readable because the primary user is party to it. What the
# primary user cannot do is close Firefox: it runs as the browser user,
# and no client may close another client’s window through the
# compositor — the same property the display isolation rests on. So
# after the checks the script waits for the window to be closed by
# hand, then confirms the chain tore itself down. Firefox’s environment
# and descriptors are browser-owned and stay in test-confinement.sh.
chain_labels() {
  ps -eo user,label,args | grep --extended-regexp "superbacked-browser|waypipe|firefox" | grep --invert-match --extended-regexp "grep|test-hardening"
}
check_chain_labels() {
  local labels
  labels="$(chain_labels)"
  printf "%s\n" "${labels}" | sed 's/^/      /' | cut --characters 1-140
  expect_success "browser launcher labeled superbacked-browser (enforce)" bash -c "printf '%s\n' \"${labels}\" | grep --quiet 'superbacked-browser (enforce).*/bin/bash -p ${launcher}'"
  expect_success "sudo labeled superbacked-browser-sudo (enforce)" bash -c "printf '%s\n' \"${labels}\" | grep --quiet 'superbacked-browser-sudo (enforce)'"
  expect_success "browser helper’s waypipe runs as the browser user under superbacked-browser-helper (enforce)" bash -c "printf '%s\n' \"${labels}\" | grep --quiet '^browser .*superbacked-browser-helper (enforce).*waypipe'"
  expect_success "Firefox runs as the browser user under firefox (enforce)" bash -c "printf '%s\n' \"${labels}\" | grep --quiet '^browser .*firefox (enforce).*firefox'"
  expect_failure "nothing in the chain is unconfined" bash -c "printf '%s\n' \"${labels}\" | grep --quiet unconfined"
  expect_success "bridge socket is superbacked:browser 660" bash -c '[ "$(stat --format=%U:%G:%a /run/browser-bridge/waypipe.sock)" = superbacked:browser:660 ]'
}
if pgrep --exact "${firefox_name}" > /dev/null; then
  note "Firefox is already open — checking the running chain and leaving it open"
  check_chain_labels
elif [ "${mode}" != "hardened browser" ]; then
  skip "Firefox chain labels (air-gapped mode — the desktop entry shows the mode notice instead; checked by hand)"
else
  gio launch /usr/local/share/applications/firefox.desktop > /dev/null 2>&1
  for _ in $(seq 60); do
    pgrep --exact "${firefox_name}" > /dev/null && break
    sleep 0.5
  done
  if ! pgrep --exact "${firefox_name}" > /dev/null; then
    fail "Firefox did not start within 30 s of gio launch firefox.desktop"
  else
    sleep 2
    check_chain_labels
    note "close the Firefox window to continue (waiting up to 120 s)"
    for _ in $(seq 240); do
      if ! pgrep --exact "${firefox_name}" > /dev/null; then
        break
      fi
      sleep 0.5
    done
    if pgrep --exact "${firefox_name}" > /dev/null; then
      fail "Firefox still open after 120 s — teardown not checked"
    else
      # Give the browser launcher’s exit trap a moment to reap its
      # waypipe.
      for _ in $(seq 20); do
        pgrep waypipe > /dev/null || break
        sleep 0.5
      done
      # Patterns are anchored so pgrep --full cannot match this very
      # shell, whose command line contains them.
      expect_failure "chain gone after the window was closed (no browser launcher, waypipe, sudo or browser helper left)" bash -c "pgrep waypipe || pgrep --full '^/bin/bash -p ${launcher}' || pgrep --full '^/bin/bash -p ${helper}' || pgrep --full '^/usr/bin/sudo --user browser'"
    fi
  fi
fi

printf "\n%s\n" "== Persistence"
expect_success "kernel command line has boot=live toram init_on_free=1" \
  bash -c '[ "$(grep --only-matching --extended-regexp "boot=live|init_on_free=1|toram" /proc/cmdline | sort --unique | wc --lines)" = 3 ]'
if [ "$(findmnt --noheadings --output FSTYPE /run/live/medium 2> /dev/null)" = tmpfs ]; then
  pass "live medium copied to RAM (toram) — the drive can be unplugged"
else
  skip "live medium is not in RAM (tethered fallback on this machine)"
fi
expect_success "root is the RAM-backed overlay" bash -c '[ "$(findmnt --noheadings --output FSTYPE /)" = overlay ]'
expect_success "root squashfs mounted read-only" bash -c 'findmnt --noheadings --output OPTIONS --types squashfs | grep --quiet "^ro"'
expect_success "overlay upper layer is tmpfs" bash -c '[ "$(findmnt --noheadings --output FSTYPE /run/live/overlay)" = tmpfs ]'
expect_success "CUPS spool lands in the overlay" bash -c '[ "$(findmnt --noheadings --output FSTYPE --target /var/spool/cups)" = overlay ]'
lower="$(findmnt --noheadings --first-only --output TARGET --types squashfs)"
expect_success "machine-id empty in the image, regenerated in RAM" \
  bash -c "[ \"\$(stat --format=%s '${lower}/etc/machine-id')\" = 0 ] && [ \"\$(stat --format=%s /etc/machine-id)\" = 33 ]"
expect_failure "no entropy seed shipped in the image" test -e "${lower}/var/lib/systemd/random-seed"
expect_failure "no shell history shipped in the image" test -e "${lower}/home/superbacked/.bash_history"
# live-boot appends its own runtime entries to /etc/fstab at boot; the
# claim is about what the image ships, so the squashfs copy is checked.
expect_failure "fstab in the image mounts nothing" grep --quiet --extended-regexp '^[^#[:space:]]' "${lower}/etc/fstab"

printf "\n%s\n" "== Network isolation (${mode} mode)"
if [ "${mode}" = "hardened browser" ]; then
  expect_success "firewall was up before NetworkManager started" bash -c '
    firewall="$(systemctl show superbacked-browser-firewall.service --property=ExecMainExitTimestampMonotonic --value)"
    network="$(systemctl show NetworkManager.service --property=ExecMainStartTimestampMonotonic --value)"
    [ -n "${firewall}" ] && [ -n "${network}" ] && [ "${firewall}" -lt "${network}" ]'
  # The egress probes only mean something with a route: refused is the
  # firewall, unreachable is just a missing cable. So the script asks
  # for the cable and waits for the route, as it does for hardware.
  if await_hardware "the network cable" network_present; then
    expect_failure "primary user has no egress (1.1.1.1:443)" timeout 5 bash -c "exec 3<> /dev/tcp/1.1.1.1/443"
    expect_failure "primary user cannot resolve names (superbacked.com)" timeout 5 getent ahosts superbacked.com
    # The default drop covers every protocol, not just TCP — probed
    # rather than trusted. ping uses ICMP datagram sockets, so it needs
    # no root.
    expect_failure "primary user cannot send UDP (1.1.1.1:53)" timeout 5 bash -c "exec 3<> /dev/udp/1.1.1.1/53; echo x >&3"
    expect_failure "primary user cannot send UDP on the QUIC port (1.1.1.1:443)" timeout 5 bash -c "exec 3<> /dev/udp/1.1.1.1/443; echo x >&3"
    if command -v ping > /dev/null; then
      expect_failure "primary user cannot ping (1.1.1.1)" timeout 5 ping -c 1 -W 2 1.1.1.1
    else
      skip "ICMP probe (ping not installed)"
    fi
  else
    skip "primary user egress probes (no network connection — a refusal cannot be told apart from unreachable)"
  fi
else
  expect_failure "no default route" bash -c '[ -n "$(ip route show default)" ]'
  expect_failure "no interface up besides loopback" bash -c 'ip --brief link show up | grep --invert-match --quiet "^lo "'
  expect_failure "primary user has no egress (1.1.1.1:443)" timeout 5 bash -c "exec 3<> /dev/tcp/1.1.1.1/443"
  if rfkill --noheadings --output TYPE 2> /dev/null | grep --quiet wlan; then
    expect_success "Wi-Fi soft-blocked by rfkill" bash -c 'rfkill --noheadings --output TYPE,SOFT | grep --quiet "wlan *blocked"'
  else
    skip "Wi-Fi rfkill state (no wireless hardware)"
  fi
fi
# IPv4-only by design: IPv6 is off by sysctl on every interface, so
# there is no second address family for the firewall to police.
# Checked as the kernel sees it — no address on any interface, loopback
# included, an empty IPv6 interface table and no IPv6 loopback to reach.
# The reach probe is a UDP connect to ::1: it succeeds whenever ::1 is
# configured (nothing need listen) and fails only when it is not,
# whereas a TCP connect would fail either way.
expect_failure "no IPv6 address on any interface (IPv4-only system)" bash -c 'ip -6 address show 2> /dev/null | grep --quiet inet6'
expect_failure "IPv6 interface table empty (/proc/net/if_inet6)" test -s /proc/net/if_inet6
expect_failure "IPv6 loopback unreachable (UDP connect to ::1)" bash -c 'exec 3<> /dev/udp/::1/9'

printf "\n%s\n" "== Privilege and user separation"
expect_failure "primary user cannot list /home/browser" ls /home/browser
if [ "${full_sudo}" = true ]; then
  skip "sudo policy checks (primary user has full sudo on debug images — run this script on a release image)"
  note "sudo --non-interactive true                         → refused"
  note "sudo --list                                         → exactly the browser helper rule"
  note "sudo --user browser /usr/bin/env FOO=1 /bin/sh -c true"
  note "sudo --user browser --preserve-env ${helper}"
  note "sudo --user browser LD_PRELOAD=/tmp/x.so ${helper}"
  note "sudo --user root ${helper}"
  note "mount --options remount,rw /   and   nft list ruleset  → refused"
else
  expect_failure "primary user has no sudo" bash -c 'id --groups --name | grep --quiet --word-regexp sudo'
  expect_failure "primary user cannot become root" sudo --non-interactive true
  # The listing must contain the rule exactly as the bootstrap writes
  # it (sudo prints tags in its own order, and the file uses that
  # order) and no other rule at all.
  expect_success "sudo --list shows exactly the browser helper rule" bash -c "listing=\"\$(sudo --non-interactive --list 2> /dev/null)\" && [ \"\$(printf '%s\n' \"\${listing}\" | grep --count --line-regexp ' *(browser) NOSETENV: NOPASSWD: ${helper}')\" = 1 ] && [ \"\$(printf '%s\n' \"\${listing}\" | grep --count '^ *(')\" = 1 ]"
  expect_failure "sudo refuses env as the browser user" sudo --non-interactive --user browser /usr/bin/env FOO=1 /bin/sh -c true
  expect_failure "sudo refuses --preserve-env" sudo --non-interactive --user browser --preserve-env "${helper}"
  expect_failure "sudo refuses LD_PRELOAD on command line" sudo --non-interactive --user browser LD_PRELOAD=/tmp/x.so "${helper}"
  expect_failure "sudo refuses the browser helper as root" sudo --non-interactive --user root "${helper}"
  expect_failure "primary user cannot remount the root filesystem" mount --options remount,rw /
  expect_failure "primary user cannot read the firewall" nft list ruleset
fi

printf "\n%s\n" "== Downloads share"
expect_success "Downloads bind mount from /home/browser" bash -c 'findmnt --noheadings --output SOURCE /home/superbacked/Downloads | grep --quiet /home/browser/Downloads'
# The kernel reports mount options in its own order, so each flag is
# checked on its own.
for option in noexec nosuid nodev nosymfollow; do
  expect_success "Downloads mounted ${option}" bash -c "findmnt --noheadings --output OPTIONS /home/superbacked/Downloads | tr ',' '\n' | grep --quiet --line-regexp ${option}"
done

printf "\n%s\n" "== Printing"
# The Superbacked app lists CUPS’s permanent queues and reads page sizes
# with lpoptions (src/handlers/print.ts), so those are the outcomes
# checked, in the order the chain produces them: ipp-usb serving the
# printer, CUPS discovering it, its attributes answering, cups-browsed
# turning it into a queue. No default destination is expected: CUPS
# sets none for a queue cups-browsed creates, and the app preselects
# the last printer used or the default only when one exists, leaving
# the choice to the user otherwise. A USB printer is any device with a
# printer-class interface; without one the script asks for it, and
# skips only when told to.
if await_hardware "a USB printer" usb_printer_present; then
  expect_success "ipp-usb serves the printer (127.0.0.1:60000 accepts)" timeout 5 bash -c "exec 3<> /dev/tcp/127.0.0.1/60000"
  destination="$(lpstat -e 2> /dev/null | head --lines 1)"
  expect_success "CUPS discovers the printer (lpstat -e)" test -n "${destination}"
  if [ -n "${destination}" ]; then
    expect_success "printer attributes answer within 20 s (lpoptions -p ${destination} -l)" bash -c "timeout 20 lpoptions -p '${destination}' -l 2> /dev/null | grep --quiet '^PageSize'"
  fi
  expect_success "cups-browsed created a permanent queue — what the Superbacked app lists (lpstat -p)" bash -c 'lpstat -p 2> /dev/null | grep --quiet .'
else
  skip "USB printing (no USB printer plugged in)"
fi

printf "\n%s\n" "== Display isolation"
expect_success "compositor link unit active" systemctl --user --quiet is-active superbacked-browser-compositor.service
expect_success "compositor link names the session socket" \
  bash -c "[ \"\$(stat --format=%i '${compositor_link}')\" = \"\$(stat --format=%i '${compositor}')\" ]"

printf "\n%s\n" "== Radios and desktop hardening"
expect_failure "no Bluetooth modules loaded" bash -c 'lsmod | grep --quiet --extended-regexp "^(bluetooth|btusb|btintel|btbcm|btrtl|btmtk|hci_uart|btsdio) "'
expect_failure "no Bluetooth controller registered" bash -c 'ls --almost-all /sys/class/bluetooth 2> /dev/null | grep --quiet .'
expect_success "session is Wayland" bash -c 'loginctl show-session "$(loginctl --no-legend | awk "\$3==\"superbacked\" { print \$1; exit }")" --property=Type --value | grep --quiet wayland'
expect_failure "no X11 sessions offered" bash -c 'ls --almost-all /usr/share/xsessions/ 2> /dev/null | grep --quiet .'
expect_failure "no Xorg server or snapd binaries" ls /usr/bin/Xorg /usr/lib/xorg/Xorg /usr/bin/snap

printf "\n%s\n" "== Summary: ${passed} passed, ${failed} failed, ${skipped} skipped (${mode} mode)"
