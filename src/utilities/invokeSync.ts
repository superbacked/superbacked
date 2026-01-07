import { ipcRenderer } from "electron"

import { IpcSyncHandlers } from "@/src/registerHandlers"

// Use IPC sync handler signatures from main process (source of truth)
type InvokeSyncHandlers = IpcSyncHandlers

// Extract channel names
type InvokeSyncChannel = keyof InvokeSyncHandlers

// Extract handler signature for a specific channel
type InvokeSyncHandler<Channel extends InvokeSyncChannel> =
  InvokeSyncHandlers[Channel]

// Extract parameters from handler
type InvokeSyncParams<Channel extends InvokeSyncChannel> =
  InvokeSyncHandler<Channel> extends (...args: infer Params) => unknown
    ? Params
    : never

/**
 * Type-safe invokeSync utility for synchronous renderer process to main process communication.
 * Returns a handler function that can be called with the appropriate arguments.
 *
 * @example
 * const getColorScheme = invokeSync("getColorScheme")
 * const colorScheme = getColorScheme()
 *
 * @example
 * const generateMnemonic = invokeSync("generateMnemonic")
 * const mnemonic = generateMnemonic(128)
 */
export function invokeSync<Channel extends InvokeSyncChannel>(
  channel: Channel
): InvokeSyncHandler<Channel> {
  return ((...args: InvokeSyncParams<Channel>) =>
    ipcRenderer.sendSync(channel, ...args)) as InvokeSyncHandler<Channel>
}
