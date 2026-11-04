// Paper sizes app can print blocks on
export type PaperSize = "letter" | "statement"

// Print settings persisted by printer, then by paper size
export interface PrintSetting {
  heavyweight: boolean
  customScale: boolean
  scale: number
}
