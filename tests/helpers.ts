import { readFileSync } from "fs"

import { decode as decodeJpeg } from "jpeg-js"
import decodeQR from "qr/decode.js"

// Shared fixture plumbing for suites that consume the golden assets
// (see tests/fixtures/README.md) — JPGs are decoded to pixels and QR
// payloads exactly like a drag and dropped block

export interface ReferencePayload {
  data: string
  headers?: string
  iv?: string
  metadata: { label?: string }
  salt: string
}

export const decodeBlockPayload = (path: string): ReferencePayload => {
  const image = decodeJpeg(readFileSync(path))
  return JSON.parse(
    decodeQR({ data: image.data, height: image.height, width: image.width })
  ) as ReferencePayload
}

export const readPassphrase = (path: string): string =>
  readFileSync(path, "utf-8").trim()
