import { ipcRenderer } from "electron"

import { IpcHandlers } from "@/src/registerHandlers"

// Use IPC handler signatures from main process
type InvokeHandlers = IpcHandlers

// Extract channel names
type InvokeChannel = keyof InvokeHandlers

// Extract handler signature for a specific channel
type InvokeHandler<Channel extends InvokeChannel> = InvokeHandlers[Channel]

// Extract parameters from handler
type InvokeParams<Channel extends InvokeChannel> =
  InvokeHandler<Channel> extends (...args: infer Params) => unknown
    ? Params
    : never

/**
 * Type-safe invoke utility for renderer process to main process communication.
 * Returns a handler function that can be called with the appropriate arguments.
 *
 * @example
 * const create = invoke("create")
 * const result = await create(secrets, dataLength, label)
 *
 * const getPrinters = invoke("getPrinters")
 * const printers = await getPrinters()
 */
export function invoke<Channel extends InvokeChannel>(
  channel: Channel
): InvokeHandler<Channel> {
  return ((...args: InvokeParams<Channel>) =>
    ipcRenderer.invoke(channel as string, ...args)) as InvokeHandler<Channel>
}
