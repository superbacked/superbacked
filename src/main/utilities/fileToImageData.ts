import pdfToJpeg from "@/src/shared/utilities/pdfToJpeg"

export const fileToImageData = async (file: File): Promise<ImageData> => {
  if (["application/pdf", "image/jpeg"].includes(file.type) === false) {
    throw new Error("Invalid file type")
  }
  if (file.type === "application/pdf") {
    const pdfBuffer = await file.arrayBuffer()
    const jpeg = await pdfToJpeg(pdfBuffer)
    return jpeg.imageData
  } else {
    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error("Failed to read file"))
      reader.readAsDataURL(file)
    })
    const image = document.createElement("img")
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("Failed to load image"))
      image.src = dataUrl
    })
    const canvas = document.createElement("canvas")
    canvas.width = image.width
    canvas.height = image.height
    const canvasContext = canvas.getContext("2d")
    if (!canvasContext) {
      throw new Error("Could not get canvas context")
    }
    canvasContext.drawImage(image, 0, 0)
    return canvasContext.getImageData(0, 0, canvas.width, canvas.height)
  }
}
