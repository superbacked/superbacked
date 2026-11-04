import { BrowserWindow, IpcMainInvokeEvent, WebContents } from "electron"
import { AsyncLocalStorage } from "node:async_hooks"

interface HandleContext {
  event: IpcMainInvokeEvent
}

const storage = new AsyncLocalStorage<HandleContext>()

export const runWithHandleContext = <T>(
  context: HandleContext,
  fn: () => Promise<T>
): Promise<T> => {
  return storage.run(context, fn)
}

export const getSenderWindow = (): null | BrowserWindow => {
  const context = storage.getStore()
  if (context === undefined) {
    return null
  }
  return BrowserWindow.fromWebContents(context.event.sender)
}

export const getSenderWebContents = (): null | WebContents => {
  const context = storage.getStore()
  if (context === undefined) {
    return null
  }
  return context.event.sender
}
