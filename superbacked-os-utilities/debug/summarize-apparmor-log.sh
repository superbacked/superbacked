#! /bin/bash
# Collapses a capture-apparmor-log.sh capture into unique accesses —
# one line per profile, operation and object (with masks), prefixed by
# an event count — for reading and rule folding. The capture itself
# stays verbatim on purpose (nothing hidden by a pattern that never
# anticipated it); this is a lens over it, not a replacement. Field
# values are extracted by regular expression rather than word
# splitting, so quoted paths with spaces stay intact. Runs anywhere
# (portable options only — macOS included).
#
# Usage: bash summarize-apparmor-log.sh denials.txt
#        bash capture-apparmor-log.sh superbacked | bash summarize-apparmor-log.sh

set -o errexit
set -o pipefail

awk '
  # Returns key="value" (or key=value for unquoted values like
  # addr=none) from the whole line, or nothing — the leading space
  # keeps denied= from matching denied_mask= and name= from matching
  # peer_label=name….
  function grab(key,    pattern) {
    pattern = " " key "=\"[^\"]*\""
    if (match($0, pattern)) return substr($0, RSTART + 1, RLENGTH - 1)
    pattern = " " key "=[^ ]+"
    if (match($0, pattern)) return substr($0, RSTART + 1, RLENGTH - 1)
    return ""
  }

  {
    # dbus events carry label= instead of profile=.
    line = grab("profile")
    if (line == "") line = grab("label")

    keys = "operation class bus interface member name family sock_type addr requested_mask requested denied_mask denied"
    split(keys, fields, " ")
    for (i in fields) {
      value = grab(fields[i])
      if (value != "") line = line " " value
    }
    print line
  }
' "${@}" | sort | uniq -c | sort -rn
