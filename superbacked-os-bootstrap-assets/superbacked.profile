abi <abi/4.0>,
include <tunables/global>

profile superbacked /home/superbacked/.local/superbacked/superbacked.AppImage flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/superbacked>
}
