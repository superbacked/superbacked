import { BrowserWindow } from "electron"

import spawn from "@/src/utilities/spawn"

export interface Printer {
  name: string
  displayName: string
  isDefault: boolean
}

export type PrinterStatus = "printing" | "standby"

export const getPrinters = async (): Promise<Printer[]> => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    // This should never happen, but tracking edge case (required by TypeScript type check)
    throw new Error("Could not get focussed window")
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

export const getDefaultPrinter = async (): Promise<Printer | null> => {
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

/**
 * Print base64-encoded JPEG or PDF
 * @param printer printer name
 * @param data base64-encoded JPEG or PDF
 * @returns stdout
 */
export const print = async (
  printer: string,
  data: string,
  copies: number
): Promise<string> => {
  const pageSizes = await getPrinterPageSizes(printer)
  const printersSupportsCustomPageSize =
    pageSizes.indexOf("Custom.WIDTHxHEIGHT") !== -1
  const execaArguments: string[] = [
    "-d",
    printer,
    "-n",
    copies.toString(),
    "-o",
    "Duplex=None",
    "-o",
    "MediaType=stationery-heavyweight",
    "-o",
    "Quality=High",
    "-o",
    "fit-to-page",
  ]
  if (printer === "Brother_HL_L2460DW") {
    // Handle recommended printer
    execaArguments.push(...["-o", "media=Custom.102x152mm"])
  } else if (printersSupportsCustomPageSize === true) {
    // Handle printers that support custom page size
    execaArguments.push(...["-o", "media=Custom.4x6in"])
  } else {
    // Default to A6 page size
    execaArguments.push(...["-o", "media=A6"])
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
