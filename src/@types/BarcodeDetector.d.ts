type Formats = "qr_code"
interface Options {
  formats: Formats[]
}
interface DetectedBarcodes {
  rawValue: string
}
declare class BarcodeDetector {
  constructor(options?: Options)
  detect(image: ImageData): Promise<DetectedBarcodes[]>
}
