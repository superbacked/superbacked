import { desktopCapturer } from "electron"

export interface CustomDesktopCapturerSource {
  id: string
  label: string
  thumbnailDataUrl: string
}

export type GetDesktopCapturerSourcesResult =
  | {
      customDesktopCapturerSources: CustomDesktopCapturerSource[]
      success: true
    }
  | { error: string; success: false }

export default async function getDesktopCapturerSources(): Promise<GetDesktopCapturerSourcesResult> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
    })
    const customDesktopCapturerSources: CustomDesktopCapturerSource[] = []
    for (const source of sources) {
      customDesktopCapturerSources.push({
        id: source.id,
        label: source.name,
        thumbnailDataUrl: source.thumbnail.toDataURL(),
      })
    }
    return {
      customDesktopCapturerSources: customDesktopCapturerSources,
      success: true,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not get desktop capturer sources",
      success: false,
    }
  }
}
