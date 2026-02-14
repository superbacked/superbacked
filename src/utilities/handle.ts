import { IpcMainInvokeEvent, ipcMain } from "electron"

import { validateSender } from "@/src/index"
import { IpcHandlers } from "@/src/registerHandlers"

// Extract channel names from IpcHandlers
type HandleChannel = keyof IpcHandlers

// Extract handler signature for a specific channel
type Handler<Channel extends HandleChannel> = IpcHandlers[Channel]

// Extract parameters from handler
type HandlerParams<Channel extends HandleChannel> =
  Handler<Channel> extends (...args: infer Params) => unknown ? Params : never

/**
 * Type-safe handle utility for main process asynchronous IPC handler registration.
 * Automatically validates channel names, parameter types, and sender.
 * Wraps ipcMain.handle with type inference and security validation for asynchronous (invoke) calls.
 *
 * @example
 * handle("create", (_event, secrets, dataLength, label) => {
 *   return create(secrets, dataLength, label)
 * })
 *
 * @example
 * handle("getPrinters", async () => {
 *   return getPrinters()
 * })
 */
export function handle<Channel extends HandleChannel>(
  channel: Channel,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: HandlerParams<Channel>
  ) => unknown
): void {
  ipcMain.handle(
    channel as string,
    (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (event.senderFrame && validateSender(event.senderFrame) !== true) {
        throw new Error("Wrong sender")
      }
      return handler(event, ...(args as HandlerParams<Channel>))
    }
  )
}
