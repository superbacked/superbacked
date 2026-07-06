import store, { Schema } from "electron-store"

export interface WindowBounds {
  height: number
  width: number
  x: number
  y: number
}

export interface PrintSetting {
  heavyweight: boolean
  customScale: boolean
  scale: number
}

export interface Store {
  scannerDevice?: string
  scannerSource?: string
  windowBounds?: WindowBounds
  // Last selected printer, preferred over the system default when available
  printer?: string
  // Print settings nested by printer, then by paper size
  printSettings?: Record<string, Record<string, PrintSetting>>
}

const schema: Schema<Store> = {
  scannerDevice: {
    type: "string",
  },
  scannerSource: {
    type: "string",
  },
  windowBounds: {
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
}

const config = new store<Store>({
  name: process.env.ENV === "development" ? `config.development` : undefined,
  schema: schema,
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
