import { existsSync } from "fs"

// Superbacked OS bakes /etc/superbacked-os-release into its image (see
// superbacked-os-utilities/superbacked-os-bootstrap-main.sh). The marker gates
// recommendations only — deliberately not a security boundary, as accidental
// false negatives (a hostname or username collision) are the failure mode a
// detection mechanism must rule out, not deliberate spoofing
export const isSuperbackedOs = (): boolean => {
  return (
    process.platform === "linux" && existsSync("/etc/superbacked-os-release")
  )
}
