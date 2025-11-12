import spawn from "@/src/utilities/spawn"

export const installed = async (): Promise<boolean> => {
  try {
    const { stdout } = await spawn(`which`, ["zbarimg"])
    return stdout.includes("zbarimg")
  } catch {
    return false
  }
}

interface ImageDataLike {
  width: number
  height: number
  data: number[]
}

const imageDataToPpm = (imageData: ImageDataLike): Buffer => {
  const { width, height, data } = imageData

  // Validate dimensions
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions: ${width}x${height}`)
  }

  // Validate data length
  const expectedLength = width * height * 4
  if (data.length !== expectedLength) {
    throw new Error(
      `Invalid data length: expected ${expectedLength}, got ${data.length}`
    )
  }

  // Build PPM header
  const header = `P6\n${width} ${height}\n255\n`
  const headerBuffer = Buffer.from(header, "ascii")

  // Pre-allocate RGB buffer (3 bytes per pixel)
  const rgbBuffer = Buffer.allocUnsafe(width * height * 3)

  // Convert RGBA to RGB with validation
  let rgbIndex = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    if (r === undefined || g === undefined || b === undefined) {
      throw new Error(`Missing pixel data at index ${i}`)
    }

    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      throw new Error(
        `Invalid pixel values at index ${i}: R=${r}, G=${g}, B=${b}`
      )
    }

    rgbBuffer[rgbIndex++] = r
    rgbBuffer[rgbIndex++] = g
    rgbBuffer[rgbIndex++] = b
    // Skip alpha channel (data[i + 3])
  }

  return Buffer.concat([headerBuffer, rgbBuffer])
}

export const decode = async (
  imageData: ImageDataLike
): Promise<null | string> => {
  try {
    const { stdout } = await spawn(
      `zbarimg`,
      [
        "--nodisplay",
        "--quiet",
        "--raw",
        "--set",
        "disable",
        "--set",
        "qrcode.enable",
        "-",
      ],
      {
        input: imageDataToPpm(imageData),
      }
    )
    return stdout
  } catch (error) {
    // Exit code 4 means "no QR code found"
    if (
      error instanceof Error &&
      "exitCode" in error &&
      (error as { exitCode: number }).exitCode === 4
    ) {
      return null
    }
    throw error
  }
}
