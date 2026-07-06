import { getMainWindow } from "@/src/index"
import { getSenderWindow } from "@/src/utilities/handleContext"
import spawn from "@/src/utilities/spawn"

export interface Printer {
  name: string
  displayName: string
  isDefault: boolean
}

export type PrinterStatus = "printing" | "standby"

export const getPrinters = async (): Promise<Printer[]> => {
  const window = getSenderWindow() ?? getMainWindow()
  if (!window) {
    throw new Error("Could not get sender window")
  }
  const printers = await window.webContents.getPrintersAsync()

  const { stdout } = await spawn("lpstat", ["-d"])
  const defaultPrinterName =
    stdout !== "no system default destination"
      ? stdout.replace("system default destination: ", "").trim()
      : null

  const sanitizedPrinters: Printer[] = []
  for (const printer of printers) {
    sanitizedPrinters.push({
      name: printer.name,
      displayName: printer.displayName,
      isDefault: printer.name === defaultPrinterName,
    })
  }
  return sanitizedPrinters
}

export const getDefaultPrinter = async (): Promise<null | Printer> => {
  const printers = await getPrinters()
  for (const printer of printers) {
    if (printer.isDefault === true) {
      return printer
    }
  }
  return null
}

export const getPrinterPageSizes = async (printer: string): Promise<string> => {
  const { stdout } = await spawn("lpoptions", ["-p", printer, "-l"])
  const lines = stdout.split("\n")
  const pageSizeLine = lines.find((line) =>
    line.startsWith("PageSize/Media Size:")
  )
  if (!pageSizeLine) {
    throw new Error("Could not determine printer page sizes")
  }
  return pageSizeLine.replace("PageSize/Media Size:", "").trim()
}

export type PaperSize = "letter" | "statement"

// For each paper size: the named CUPS page size, and the custom media fallback
// used when the printer supports custom sizes but not the named one.
const paperSizeMedia: Record<PaperSize, { named: string; custom: string }> = {
  letter: { named: "Letter", custom: "Custom.8.5x11in" },
  statement: { named: "Statement", custom: "Custom.5.5x8.5in" },
}

// Printer's supported page sizes, with the default marker stripped
const getPageSizes = async (printer: string): Promise<string[]> => {
  return (await getPrinterPageSizes(printer))
    .split(/\s+/)
    .map((pageSize) => pageSize.replace(/^\*/, ""))
}

// Paper sizes the printer can produce, given its supported page sizes
export const getSupportedPaperSizes = async (
  printer: string
): Promise<PaperSize[]> => {
  const pageSizes = await getPageSizes(printer)
  const supportsCustomPageSize = pageSizes.includes("Custom.WIDTHxHEIGHT")
  return (Object.keys(paperSizeMedia) as PaperSize[]).filter(
    (paperSize) =>
      supportsCustomPageSize ||
      pageSizes.includes(paperSizeMedia[paperSize].named)
  )
}

/**
 * Print base64-encoded JPEG or PDF
 * @param printer printer name
 * @param data base64-encoded JPEG or PDF
 * @returns stdout
 */
export const print = async (
  printer: string,
  data: string,
  copies: number,
  paperSize: PaperSize = "letter",
  heavyweight = false
): Promise<string> => {
  const execaArguments: string[] = [
    "-d",
    printer,
    "-n",
    copies.toString(),
    "-o",
    "Duplex=None",
    "-o",
    "Quality=High",
  ]
  // Prefer the named page size, fall back to a custom size, else fail
  const pageSizes = await getPageSizes(printer)
  const { named, custom } = paperSizeMedia[paperSize]
  if (pageSizes.includes(named)) {
    execaArguments.push(...["-o", `media=${named}`])
  } else if (pageSizes.includes("Custom.WIDTHxHEIGHT")) {
    execaArguments.push(...["-o", `media=${custom}`])
  } else {
    throw new Error(`Printer does not support ${named} or custom page sizes`)
  }
  if (heavyweight) {
    // Heavy / synthetic stock (cardstock, TerraSlate, index cards)
    execaArguments.push(...["-o", "MediaType=stationery-heavyweight"])
  }
  const { stdout } = await spawn("lp", execaArguments, {
    input: Buffer.from(data, "base64"),
  })
  return stdout
}

export const getPrinterStatus = async (
  printer: string
): Promise<PrinterStatus> => {
  const { stdout } = await spawn("lpstat", ["-o", printer])
  if (stdout === "") {
    return "standby"
  } else {
    return "printing"
  }
}
