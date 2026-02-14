import { IpcMainEvent, ipcMain } from "electron"

import { validateSender } from "@/src/index"
import { IpcSyncHandlers } from "@/src/registerHandlers"

// Extract channel names from IpcSyncHandlers
type HandleSyncChannel = keyof IpcSyncHandlers

// Extract handler signature for a specific channel
type SyncHandler<Channel extends HandleSyncChannel> = IpcSyncHandlers[Channel]

// Extract parameters from handler
type SyncHandlerParams<Channel extends HandleSyncChannel> =
  SyncHandler<Channel> extends (...args: infer Params) => unknown
    ? Params
    : never

/**
 * Type-safe handleSync utility for main process synchronous IPC handler registration.
 * Automatically validates channel names, parameter types, and sender.
 * Wraps ipcMain.on with type inference and security validation for synchronous (sendSync) calls.
 *
 * @example
 * handleSync("getColorScheme", () => {
 *   return shouldUseDarkColors() === true ? "dark" : "light"
 * })
 *
 * @example
 * handleSync("generateMnemonic", (...args) => {
 *   return generateMnemonic(...args)
 * })
 */
export function handleSync<Channel extends HandleSyncChannel>(
  channel: Channel,
  handler: (...args: SyncHandlerParams<Channel>) => unknown
): void {
  ipcMain.on(channel as string, (event: IpcMainEvent, ...args: unknown[]) => {
    if (event.senderFrame && validateSender(event.senderFrame) !== true) {
      throw new Error("Wrong sender")
    }
    event.returnValue = handler(...(args as SyncHandlerParams<Channel>))
  })
}
