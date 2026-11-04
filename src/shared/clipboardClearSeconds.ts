// Seconds before a copied secret is cleared from the clipboard — the
// app reads it as the default of the clipboardClearSeconds config value
// (see src/utilities/config.ts), the command-line interface as the
// default of its --clear flags. The config value never reaches the
// command-line interface, which reads flags only.
export const defaultClipboardClearSeconds = 10

// Bounds of the app’s clipboardClearSeconds config value — enforced by
// the Settings input and the config schema alike
export const maximumClipboardClearSeconds = 60
export const minimumClipboardClearSeconds = 10
