import store, { Schema } from "electron-store"

import {
  maximumClipboardClearSeconds,
  minimumClipboardClearSeconds,
} from "@/src/shared/clipboardClearSeconds"
import type { PaperSize, PrintSetting } from "@/src/shared/types/print"

// width/height are the window’s *content* size (createWindow consumes them
// with useContentSize: true); x/y are the outer window position.
export interface WindowGeometry {
  height: number
  width: number
  x: number
  y: number
}

export interface YubiKeySettings {
  // Last used HMAC-SHA1 challenge-response slot (never its secret),
  // preselected wherever the app offers YubiKey protection — the
  // command-line interface reads flags only
  challengeResponseSlot?: "1" | "2"
}

export interface Store {
  // Seconds before app-copied secrets are cleared from the clipboard,
  // defaulting to defaultClipboardClearSeconds when unset (see
  // src/shared/clipboardClearSeconds.ts); the command-line interface
  // reads its --clear flags only
  clipboardClearSeconds?: number
  scannerDevice?: string
  scannerSource?: string
  windowGeometry?: WindowGeometry
  // Last selected printer, preferred over the system default when available
  printer?: string
  // Last used paper size by printer
  paperSizes?: Record<string, PaperSize>
  // Print settings nested by printer, then by paper size
  printSettings?: Record<string, Record<string, PrintSetting>>
  yubikey?: YubiKeySettings
  // Role name resolved to the newest matching profile row (see
  // src/shared/kdfProfiles.ts) — gates creation cost and
  // whether restoration trials the paranoid row; the command-line
  // interface reads the --paranoid flag only
  kdfProfile?: "paranoid" | "standard"
}

const schema: Schema<Store> = {
  clipboardClearSeconds: {
    type: "integer",
    minimum: minimumClipboardClearSeconds,
    maximum: maximumClipboardClearSeconds,
  },
  scannerDevice: {
    type: "string",
  },
  scannerSource: {
    type: "string",
  },
  windowGeometry: {
    type: "object",
    properties: {
      height: { type: "number" },
      width: { type: "number" },
      x: { type: "number" },
      y: { type: "number" },
    },
  },
  printer: {
    type: "string",
  },
  paperSizes: {
    type: "object",
    additionalProperties: {
      type: "string",
    },
  },
  printSettings: {
    type: "object",
    additionalProperties: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          heavyweight: { type: "boolean" },
          customScale: { type: "boolean" },
          scale: { type: "number" },
        },
      },
    },
  },
  yubikey: {
    type: "object",
    properties: {
      challengeResponseSlot: {
        type: "string",
        enum: ["1", "2"],
      },
    },
  },
  kdfProfile: {
    type: "string",
    enum: ["paranoid", "standard"],
  },
}

const config = new store<Store>({
  name: process.env.ENV === "development" ? `config.development` : undefined,
  schema: schema,
  migrations: {
    "1.13.0-beta.1": (configStore) => {
      // windowBounds stored the outer window rectangle, which createWindow
      // read back as a content size — on platforms with a real title bar,
      // the window grew at every launch. windowGeometry replaces it.
      configStore.delete("windowBounds" as never)
    },
  },
  serialize: (value: object) => {
    return JSON.stringify(value, null, 2)
  },
})

export function set(object: Partial<Store>): void
export function set<Key extends keyof Store>(key: Key, value: Store[Key]): void
export function set<Key extends keyof Store>(
  objectOrKey: Partial<Store> | Key,
  value?: Store[Key]
): void {
  if (typeof objectOrKey === "object") {
    return config.set(objectOrKey)
  } else {
    return config.set(objectOrKey, value)
  }
}

export function get(): Store
export function get<Key extends keyof Store>(key?: Key): Store[Key]
export function get<Key extends keyof Store>(key?: Key): Store | Store[Key] {
  if (key) {
    return config.get(key)
  } else {
    return config.store
  }
}

export function unset<Key extends keyof Store>(key: Key): void {
  return config.delete(key)
}
