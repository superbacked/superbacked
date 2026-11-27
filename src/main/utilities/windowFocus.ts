import { useState, useSyncExternalStore } from "react"

// Whether the window holds keyboard focus, as the main process sees it —
// the compositor’s truth, which the renderer cannot read for itself:
// Blink keeps reporting a focused document, caret and all, after a file
// is dropped onto a window the compositor never activated (see
// src/handlers/focusWindow.ts). Read once from the main process when
// first needed, then following the window’s focus and blur events

let focused: null | boolean = null
let subscribed = false
const listeners = new Set<() => void>()

const getSnapshot = (): boolean => {
  focused ??= window.api.invokeSync.isWindowFocused()
  return focused
}

const subscribe = (listener: () => void): (() => void) => {
  if (subscribed === false) {
    subscribed = true
    window.api.events.windowFocusChange((value) => {
      focused = value
      for (const notify of listeners) {
        notify()
      }
    })
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useWindowFocus = (): boolean => {
  return useSyncExternalStore(subscribe, getSnapshot)
}

// A modal’s focus trap, held off until the window has held keyboard
// focus at some point since the modal opened. Mantine focuses the first
// field when the trap activates, so a prompt opened by a drop shows no
// caret while keystrokes would land in the file manager, and takes the
// field the moment the window gains focus — a click anywhere in it, or
// the compositor granting it (X11, Superbacked OS). Latched per opening
// so the trap stays active across later blurs rather than seizing the
// first field again on every return to the window
export const useTrapFocusOnceWindowFocused = (opened: boolean): boolean => {
  const windowFocused = useWindowFocus()
  const [trapFocus, setTrapFocus] = useState(false)
  // Adjusted while rendering rather than in an effect — React’s pattern
  // for state that follows props, re-rendering at once with the new value
  if (opened === false && trapFocus === true) {
    setTrapFocus(false)
  } else if (opened === true && windowFocused === true && trapFocus === false) {
    setTrapFocus(true)
  }
  return trapFocus
}
