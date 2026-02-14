import { IpcRendererEvent, ipcRenderer } from "electron"

/**
 * Helper to create event listeners with automatic cleanup.
 * Returns a function that accepts a callback and returns a cleanup function.
 *
 * @example
 * const onMenuAbout = createEventListener("menuAbout")
 * const cleanup = onMenuAbout(() => console.log("Menu about clicked"))
 * // Later: cleanup()
 */
export function createEventListener<T extends (...args: never[]) => void>(
  eventName: string
): (callback: T) => () => void {
  return (callback: T) => {
    const listener = (_event: IpcRendererEvent, ...args: Parameters<T>) => {
      callback(...args)
    }
    ipcRenderer.on(eventName, listener)
    return () => {
      ipcRenderer.removeListener(eventName, listener)
    }
  }
}
