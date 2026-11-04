import { useCallback, useState } from "react"

// The default YubiKey slot — the slot last used (never its secret), like
// the selected printer — read once per mount, as invokeSync is a
// synchronous IPC round-trip that must stay out of the render path, and
// persisted only when actually used so a hidden control never overwrites
// a real choice
export const useDefaultYubiKeySlot = (): {
  defaultSlot: "1" | "2"
  setDefaultSlot: (slot: "1" | "2") => void
} => {
  const [defaultSlot] = useState(
    () =>
      window.api.invokeSync.getConfig("yubikey")?.challengeResponseSlot ?? "2"
  )
  const setDefaultSlot = useCallback((slot: "1" | "2") => {
    window.api.invokeSync.setConfig("yubikey", {
      ...window.api.invokeSync.getConfig("yubikey"),
      challengeResponseSlot: slot,
    })
  }, [])
  return { defaultSlot, setDefaultSlot }
}
