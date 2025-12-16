import {
  GlobalWorkerOptions,
  getDocument,
} from "pdfjs-dist/legacy/build/pdf.mjs"

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url
).href

export type PdfToJpegResult = {
  imageData: ImageData
  dataUrl: string
}

export default async (pdfBuffer: ArrayBuffer): Promise<PdfToJpegResult> => {
  const doc = await getDocument(pdfBuffer).promise
  const page = await doc.getPage(1)
  const scale = 4
  const viewport = page.getViewport({ scale: scale })
  const canvas = document.createElement("canvas")
  const canvasContext = canvas.getContext("2d")
  if (!canvasContext) {
    throw new Error("Could not get canvas context")
  }
  canvas.height = viewport.height
  canvas.width = viewport.width
  await page.render({
    canvasContext: canvasContext,
    viewport: viewport,
  }).promise
  return {
    imageData: canvasContext.getImageData(0, 0, canvas.width, canvas.height),
    dataUrl: canvas.toDataURL("image/jpeg", 100),
  }
}
