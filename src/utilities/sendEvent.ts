import { BrowserWindow } from "electron"

import { IpcEvents } from "@/src/registerHandlers"

// Extract event names from IpcEvents
type EventNames = keyof IpcEvents

// Extract callback signature for a specific event
type EventCallback<EventName extends EventNames> =
  IpcEvents[EventName] extends (callback: infer Callback) => () => void
    ? Callback
    : never

// Extract parameters from callback
type EventParameters<EventName extends EventNames> =
  EventCallback<EventName> extends (...args: infer Parameters) => void
    ? Parameters
    : never

/**
 * Type-safe event sender for main process to renderer communication.
 * Automatically validates event names and parameter types based on Api.events.
 * Uses event names directly as IPC channel names.
 *
 * @example
 * sendEvent(window, "menuTriggeredRoute", "/restore")
 *
 * @example
 * sendEvent(window, "systemColorSchemeChange", "dark")
 *
 * @example
 * sendEvent(window, "systemLocaleChange", "en")
 */
export function sendEvent<EventName extends EventNames>(
  window: BrowserWindow,
  event: EventName,
  ...args: EventParameters<EventName>
): void {
  window.webContents.send(event as string, ...args)
}
