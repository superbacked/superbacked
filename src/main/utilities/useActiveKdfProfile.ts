import { useEffect, useState } from "react"

import {
  KdfProfile,
  paranoidKdfProfile,
  standardKdfProfile,
} from "@/src/shared/utilities/kdfProfiles"

// Same-window signal fired by the Settings toggle — cross-window
// staleness is covered by the focus re-read below, and the handlers read
// config at call time regardless, so a stale renderer can only ever gate
// stricter than the artifact it creates
export const kdfProfileChangedEvent = "superbacked:kdf-profile-changed"

const readProfile = (): KdfProfile => {
  return window.api.invokeSync.getConfig("kdfProfile") === "paranoid"
    ? paranoidKdfProfile
    : standardKdfProfile
}

// The KDF profile new artifacts will stretch under — drives the estimator
// display and the passphrase gate (see src/shared/utilities/zxcvbn.ts).
// Read once per mount (invokeSync must stay out of the render path),
// refreshed by the Settings toggle and on window focus
export const useActiveKdfProfile = (): KdfProfile => {
  const [profile, setProfile] = useState(readProfile)
  useEffect(() => {
    const update = () => setProfile(readProfile())
    window.addEventListener(kdfProfileChangedEvent, update)
    window.addEventListener("focus", update)
    return () => {
      window.removeEventListener(kdfProfileChangedEvent, update)
      window.removeEventListener("focus", update)
    }
  }, [])
  return profile
}
