#! /bin/bash
# Captures the current boot’s AppArmor audit events verbatim — no
# parsing, no deduplication, so nothing can be hidden by a pattern that
# never anticipated it. Completeness comes from the debug-variant
# image’s kernel command line (printk rate limiting disabled — see
# docker/create-superbacked-os-live-image.sh); the check below catches
# harvesting on a boot without it. For rule proposals, feed the capture
# to libapparmor’s own tooling off-device:
#
#   sudo aa-logprof -d superbacked-os-bootstrap-assets/apparmor -f denials.txt
#
# Pass a profile name to narrow the capture to one app — its //null-
# children included, and the lines stay verbatim either way.
#
# Usage: bash capture-apparmor-log.sh [profile] > denials.txt

profile="${1:-}"

if [ "$(journalctl -b -k | grep -c "callbacks suppressed")" -gt 0 ]; then
  printf "%s\n" "Error: rate-limit suppression detected — the log is incomplete (harvest on a debug-variant image, which disables rate limiting at boot)" >&2
  exit 1
fi

captured="$(journalctl -b -k \
  | grep -E 'apparmor="(ALLOWED|DENIED)"' \
  | { if [ -n "${profile}" ]; then grep -E "(profile|label)=\"${profile}\b"; else cat; fi } || true)"

# An empty capture is success late in tuning (nothing left to fold) but
# a trap when the filter or timing is wrong — say so on stderr instead
# of leaving a silently empty file.
if [ -z "${captured}" ]; then
  printf "%s\n" "Note: 0 events matched${profile:+ profile “${profile}”} this boot — the journal may have been cleared since the app last ran, or the app runs under another profile" >&2
else
  printf "%s\n" "${captured}"
fi
