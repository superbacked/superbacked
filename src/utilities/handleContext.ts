import { BrowserWindow, IpcMainInvokeEvent } from "electron"
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

export const getSenderWindow = (): BrowserWindow | null => {
  const context = storage.getStore()
  if (!context) {
    return null
  }
  return BrowserWindow.fromWebContents(context.event.sender)
}
