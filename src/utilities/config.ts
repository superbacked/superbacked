import store, { Schema } from "electron-store"

export type ColorScheme = "dark" | "light"

export interface Store {
  colorScheme: ColorScheme
}

const schema: Schema<Store> = {
  colorScheme: {
    enum: ["light", "dark"],
    type: "string",
  },
}

const config = new store<Store>({
  name: process.env.ENV === "development" ? `config.development` : undefined,
  schema: schema,
  serialize: (value) => {
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
