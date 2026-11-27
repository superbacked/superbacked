// Seconds before a copied secret is cleared from the clipboard — the
// app reads it as the default of the clipboardClearSeconds config value
// (see src/utilities/config.ts), the command-line interface as the
// default of its --clear flags. The config value never reaches the
// command-line interface, which reads flags only.
export const defaultClipboardClearSeconds = 10

// Bounds of the app’s clipboardClearSeconds config value — enforced by
// the config schema; the Settings dropdown offers the options below
export const maximumClipboardClearSeconds = 60
export const minimumClipboardClearSeconds = 10

// Choices the Settings dropdown offers, in seconds
export const clipboardClearSecondsOptions = [10, 15, 30, 60]

// Snaps a value typed into the number input the dropdown replaced (app
// versions before 2.2.0) to the nearest option — ties resolve to the
// shorter delay, the safer of the two
export const nearestClipboardClearSeconds = (seconds: number): number => {
  let nearest = clipboardClearSecondsOptions[0] as number
  for (const option of clipboardClearSecondsOptions) {
    if (Math.abs(option - seconds) < Math.abs(nearest - seconds)) {
      nearest = option
    }
  }
  return nearest
}
