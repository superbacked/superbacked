import styled from "@emotion/styled"
import {
  ActionIcon,
  Avatar,
  ComboboxItem,
  Dialog,
  Group,
  Loader,
  Select,
  Space,
  Text,
  useMantineColorScheme,
} from "@mantine/core"
import decodeQR from "qr/decode.js"
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react"
import { useTranslation } from "react-i18next"
import {
  DeviceDesktop as DeviceDesktopIcon,
  Settings as SettingsIcon,
  Video as VideoIcon,
  X as XIcon,
} from "tabler-icons-react"

import { ValidateTranslationKeys } from "@/src/@types/react-i18next"
import { CustomDesktopCapturerSource } from "@/src/index"
import ErrorModal from "@/src/main/components/ErrorModal"
import confirmationSound from "@/src/main/confirmation.wav"
import { useDebounce } from "@/src/main/utilities/debounce"

const audio = new Audio(confirmationSound)

const play = async () => {
  await audio.play()
}

const maxFrameRate = 24
const minVideoWidth = 1280
const minVideoHeight = 720
const maxVideoWidth = 1920
const maxVideoHeight = 1080

const Container = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  z-index: 0;
`

const TopRightContainer = styled.div`
  position: absolute;
  top: 24px;
  right: 24px;
`

interface VideoProps {
  radius?: number
}

const Video = styled.video<VideoProps>`
  position: absolute;
  top: 0;
  left: 0;
  background-color: transparent;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  object-fit: cover;
  width: 100%;
  height: 100%;
  z-index: -1;
`

const OverlayContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
`

const Overlay = styled.div`
  height: 75%;
  aspect-ratio: 1;
  box-shadow: 0 0 0 100vh rgba(0, 0, 0, 0.25);
`

interface ImageProps {
  radius?: number
}

export const Image = styled.img<ImageProps>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  object-fit: cover;
  z-index: -1;
`

interface Source {
  id: string
  type: "device" | "source"
}

export interface Code {
  value: string
}

export interface ScannerRef {
  beep: () => void
  start: () => void
  stop: () => void
}

interface ScannerProps {
  handleCode: (code: string, imageDataUrl?: string) => void
  autoBeep?: boolean
  autoStop?: boolean
}

class NoDeviceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NoDeviceError"
  }
}

/**
 * Scanner component for detecting QR codes using camera or screen capture
 *
 * @param handleCode - Callback function when QR code is detected (required)
 * @param autoBeep - Whether to play confirmation sound (optional, defaults to true)
 * @param autoStop - Whether to automatically stop scanning after detecting code (optional, defaults to true)
 *
 * @example
 * ```tsx
 * const scannerRef = useRef<ScannerRef>(null)
 *
 * <Scanner
 *   ref={scannerRef}
 *   handleCode={(code) => console.log(code)}
 * />
 * ```
 */
const Scanner = forwardRef<ScannerRef, ScannerProps>((props, ref) => {
  const { t } = useTranslation()
  const { colorScheme } = useMantineColorScheme()
  const videoRef = useRef<null | HTMLVideoElement>(null)
  const mediaStreamRef = useRef<null | MediaStream>(null)
  const imageDataUrlRef = useRef<null | string>(null)
  const sourceRef = useRef<null | Source>(null)
  const computingRef = useRef(false)
  const handleCodeRef = useRef(props.handleCode)
  const [showSourceSettings, setShowSourceSettings] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [sources, setSources] = useState<CustomDesktopCapturerSource[]>([])
  const [deviceValue, setDeviceValue] = useState<null | string>(null)
  const [sourceValue, setSourceValue] = useState<null | string>(null)
  const [deviceDropdownOpened, setDeviceDropdownOpened] = useState(false)
  const [sourceDropdownOpened, setSourceDropdownOpened] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<null | ValidateTranslationKeys<
    | "components.scanner.pleaseAllowCameraAccess"
    | "components.scanner.pleaseConnectCamera"
    | "components.scanner.cameraDoesNotMeetMinimumRequirementOf720p"
    | "components.scanner.pleaseAllowScreenRecording"
    | "components.scanner.couldNotRunScanner"
  >>(null)
  const [showError, setShowError] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const { handleCode, autoBeep = true, autoStop = true } = props

  const stop = useCallback(() => {
    setStreaming(false)
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        if (track.readyState === "live") {
          track.stop()
        }
      }
      mediaStreamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const compute = useCallback(
    async (imageData?: ImageData) => {
      computingRef.current = true
      let canvas: null | HTMLCanvasElement = null
      if (!imageData && videoRef.current) {
        if (
          videoRef.current.videoWidth === 0 ||
          videoRef.current.videoHeight === 0
        ) {
          // Wait for video to be ready
          computingRef.current = false
          return
        }
        canvas = document.createElement("canvas")
        canvas.width = videoRef.current.videoWidth
        canvas.height = videoRef.current.videoHeight
        const canvas2d = canvas.getContext("2d")
        if (!canvas2d) {
          // This should never happen, but tracking edge case (required by TypeScript type check)
          throw new Error("Could not get canvas context")
        }
        const ratio = canvas.width / canvas.height
        let height: number, width: number
        if (ratio > 1) {
          height = canvas.height
          width = height * ratio
          if (width > canvas.width) {
            width = canvas.width
            height = width / ratio
          }
        } else {
          width = canvas.width
          height = width / ratio
          if (height > canvas.height) {
            height = canvas.height
            width = height * ratio
          }
        }
        const x = -(width - canvas.width) / 2
        const y = -(height - canvas.height) / 2
        canvas2d.drawImage(videoRef.current, x, y, width, height)
        imageData = canvas2d.getImageData(x, y, width, height)
      }
      if (!imageData) {
        // Wait for image data
        computingRef.current = false
        return
      }
      // Useful for debugging
      // console.log(canvas.toDataURL("image/jpeg", 100))
      let code: null | string = null
      if (typeof BarcodeDetector !== "undefined") {
        // Use BarcodeDetector when available (currently macOS-only, see https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)
        const barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] })
        const detectedBarcodes = await barcodeDetector.detect(imageData)
        code = detectedBarcodes[0]?.rawValue ?? null
      } else {
        // Use qr as fallback (see https://github.com/paulmillr/qr)
        try {
          code = decodeQR(imageData)
        } catch {
          // QR code not found, continue scanning
        }
      }
      if (
        videoRef.current !== null &&
        mediaStreamRef.current !== null &&
        canvas &&
        code
      ) {
        imageDataUrlRef.current = canvas.toDataURL("image/png", 100)
        handleCodeRef.current(code)
        if (autoBeep) {
          void play()
        }
        if (autoStop) {
          stop()
        }
      }
      computingRef.current = false
    },
    [autoBeep, autoStop, stop]
  )

  const debouncedCompute = useDebounce(compute, 100)

  const updateDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    const enumerateDevices = await navigator.mediaDevices.enumerateDevices()
    const videoInputDevices: MediaDeviceInfo[] = []
    for (const enumerateDevice of enumerateDevices) {
      if (enumerateDevice.kind === "videoinput") {
        videoInputDevices.push(enumerateDevice)
      }
    }
    setDevices(videoInputDevices)
    return videoInputDevices
  }, [])

  const capture = useCallback(async () => {
    try {
      setError(null)
      setShowError(false)
      setLoading(true)
      const updatedDevices = await updateDevices()
      if (!sourceRef.current) {
        if (updatedDevices[0]) {
          sourceRef.current = {
            id: updatedDevices[0].deviceId,
            type: "device",
          }
        }
      }
      if (sourceRef.current === null) {
        throw new NoDeviceError("No device available")
      }
      let constraints: MediaStreamConstraints
      if (sourceRef.current.type === "device") {
        constraints = {
          audio: false,
          video: {
            deviceId: {
              exact: sourceRef.current.id,
            },
            frameRate: { max: maxFrameRate },
            width: { min: minVideoWidth, max: maxVideoWidth },
            height: { min: minVideoHeight, max: maxVideoHeight },
          },
        }
      } else {
        constraints = {
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sourceRef.current.id,
              maxFrameRate: maxFrameRate,
            },
          } as MediaTrackConstraints,
        }
      }
      mediaStreamRef.current =
        await navigator.mediaDevices.getUserMedia(constraints)
      setLoading(false)
      if (videoRef.current) {
        const metadataTimeout = setTimeout(() => {
          if (sourceRef.current?.type === "device") {
            setError("components.scanner.pleaseAllowCameraAccess")
            setShowError(true)
            stop()
          }
        }, 1000)
        videoRef.current.srcObject = mediaStreamRef.current
        videoRef.current.onloadedmetadata = async () => {
          clearTimeout(metadataTimeout)
          await videoRef.current?.play()
        }
        videoRef.current.ontimeupdate = async () => {
          clearTimeout(metadataTimeout)
          if (computingRef.current === false) {
            await debouncedCompute()
          }
        }
      }
    } catch (captureError) {
      setLoading(false)
      if (
        captureError instanceof Error &&
        captureError.name === "NoDeviceError"
      ) {
        setError("components.scanner.pleaseConnectCamera")
      } else if (
        sourceRef.current?.type === "device" &&
        captureError instanceof Error &&
        captureError.name === "NotAllowedError"
      ) {
        setError("components.scanner.pleaseAllowCameraAccess")
      } else if (
        sourceRef.current?.type === "device" &&
        captureError instanceof Error &&
        captureError.name === "NotReadableError"
      ) {
        setError("components.scanner.pleaseConnectCamera")
      } else if (
        sourceRef.current?.type === "device" &&
        captureError instanceof Error &&
        captureError.name === "OverconstrainedError"
      ) {
        setError("components.scanner.cameraDoesNotMeetMinimumRequirementOf720p")
      } else if (
        sourceRef.current?.type === "source" &&
        captureError instanceof Error &&
        captureError.name === "NotReadableError"
      ) {
        setError("components.scanner.pleaseAllowScreenRecording")
      } else {
        setError("components.scanner.couldNotRunScanner")
      }
      setShowError(true)
    }
  }, [updateDevices, stop, debouncedCompute])

  const start = useCallback(() => {
    if (!mediaStreamRef.current || mediaStreamRef.current.active === false) {
      setStreaming(true)
      void capture()
    }
  }, [capture])

  const updateSources = async (): Promise<CustomDesktopCapturerSource[]> => {
    const result = await window.api.getDesktopCapturerSources()
    if (result.success === false) {
      setError("components.scanner.pleaseAllowScreenRecording")
      setShowError(true)
      return []
    }
    setSources(result.customDesktopCapturerSources)
    // On Linux, set source to selected window
    // See https://www.electronjs.org/docs/latest/api/desktop-capturer#caveats
    const sourceId = result.customDesktopCapturerSources[0]?.id
    if (window.api.platform === "linux" && sourceId) {
      sourceRef.current = {
        id: sourceId,
        type: "source",
      }
      setSourceValue(sourceId)
      setShowSourceSettings(false)
      start()
    }
    return result.customDesktopCapturerSources
  }

  const beep = useCallback(() => {
    void play()
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      beep,
      start,
      stop,
    }),
    [beep, start, stop]
  )

  useEffect(() => {
    handleCodeRef.current = handleCode
  }, [handleCode])

  useEffect(() => {
    start()
    return () => {
      stop()
    }
  }, [start, stop])

  if (showSourceSettings === true) {
    const deviceData: ComboboxItem[] = []
    for (const device of devices) {
      deviceData.push({ label: device.label, value: device.deviceId })
    }
    interface CustomComboboxItem extends ComboboxItem {
      thumbnailDataUrl: string
    }
    const sourceData: CustomComboboxItem[] = []
    for (const source of sources) {
      sourceData.push({
        label: source.label,
        thumbnailDataUrl: source.thumbnailDataUrl,
        value: source.id,
      })
    }
    return (
      <Fragment>
        <Container>
          <Select
            comboboxProps={{ keepMounted: false }}
            data={deviceData}
            defaultValue={
              sourceRef.current?.type === "device" ? sourceRef.current.id : null
            }
            dropdownOpened={deviceDropdownOpened}
            leftSection={<VideoIcon size={16} />}
            label={t("components.scanner.device")}
            maxDropdownHeight={240}
            placeholder={`${t("components.scanner.selectDevice")}…`}
            value={
              (deviceValue ?? sourceRef.current?.type === "device")
                ? sourceRef.current?.id
                : null
            }
            onChange={(value) => {
              if (value) {
                sourceRef.current = {
                  id: value,
                  type: "device",
                }
                setDeviceValue(value)
              }
              setShowSourceSettings(false)
              start()
            }}
            onDropdownClose={() => setDeviceDropdownOpened(false)}
            onDropdownOpen={async () => {
              await updateDevices()
              setDeviceDropdownOpened(true)
            }}
          />
          <Space h="lg" />
          <Select
            comboboxProps={{ keepMounted: false }}
            data={sourceData}
            defaultValue={
              sourceRef.current?.type === "source" ? sourceRef.current.id : null
            }
            dropdownOpened={sourceDropdownOpened}
            leftSection={<DeviceDesktopIcon size={16} />}
            label={t("components.scanner.source")}
            maxDropdownHeight={240}
            placeholder={`${t("components.scanner.selectSource")}…`}
            renderOption={({ option }) => (
              <Group wrap="nowrap">
                <Avatar src={(option as CustomComboboxItem).thumbnailDataUrl} />
                <Text>{option.label}</Text>
              </Group>
            )}
            value={
              (sourceValue ?? sourceRef.current?.type === "source")
                ? sourceRef.current?.id
                : null
            }
            onChange={(value) => {
              if (value) {
                sourceRef.current = {
                  id: value,
                  type: "source",
                }
                setSourceValue(value)
              }
              setShowSourceSettings(false)
              start()
            }}
            onDropdownClose={() => setSourceDropdownOpened(false)}
            onDropdownOpen={async () => {
              await updateSources()
              // On Linux, source is selected automatically
              if (window.api.platform !== "linux") {
                setSourceDropdownOpened(true)
              }
            }}
          />
        </Container>
        <TopRightContainer>
          <ActionIcon
            color="dark"
            radius="xl"
            size="sm"
            variant="filled"
            onClick={() => {
              setShowSourceSettings(false)
              start()
            }}
          >
            <XIcon size={16} />
          </ActionIcon>
        </TopRightContainer>
        <ErrorModal
          error={error}
          opened={showError}
          onClose={() => {
            setShowError(false)
            setShowSourceSettings(true)
          }}
        />
      </Fragment>
    )
  } else {
    return (
      <Fragment>
        <Video ref={videoRef} />
        {loading === true ? (
          <Fragment>
            <Container>
              <Loader
                color={colorScheme === "dark" ? "white" : "dark"}
                size="sm"
              />
            </Container>
            <Dialog
              opened={true}
              withCloseButton
              onClose={() => setLoading(false)}
              radius="sm"
              size="md"
            >
              {t("components.scanner.loading")}…
            </Dialog>
          </Fragment>
        ) : null}
        {loading === false && streaming === true ? (
          <OverlayContainer>
            <Overlay />
          </OverlayContainer>
        ) : null}
        {loading === false && streaming === false && imageDataUrlRef.current ? (
          <Image src={imageDataUrlRef.current} />
        ) : null}
        <TopRightContainer>
          <ActionIcon
            color="dark"
            radius="xl"
            size="sm"
            variant="filled"
            onClick={() => {
              setShowSourceSettings(true)
              stop()
            }}
          >
            <SettingsIcon size={16} />
          </ActionIcon>
        </TopRightContainer>
        <ErrorModal
          error={error}
          opened={showError}
          onClose={() => {
            setShowError(false)
            setShowSourceSettings(true)
          }}
        />
      </Fragment>
    )
  }
})

Scanner.displayName = "Scanner"

export default Scanner
