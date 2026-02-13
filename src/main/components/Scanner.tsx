import styled from "@emotion/styled"
import {
  ActionIcon,
  Avatar,
  Button,
  ComboboxItem,
  Group,
  Select,
  Space,
  Text,
} from "@mantine/core"
import {
  IconDeviceDesktop,
  IconSettings,
  IconVideo,
  IconX,
} from "@tabler/icons-react"
import decodeQR from "qr/decode.js"
import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { CustomDesktopCapturerSource } from "@/src/handlers/getDesktopCapturerSources"
import ActionBadge from "@/src/main/components/ActionBadge"
import Dropzone from "@/src/main/components/Dropzone"
import ErrorModal, { ErrorState } from "@/src/main/components/ErrorModal"
import Loading from "@/src/main/components/Loading"
import confirmationSound from "@/src/main/confirmation.wav"
import { useDebounce } from "@/src/main/utilities/debounce"
import { fileToImageData } from "@/src/main/utilities/fileToImageData"

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

const CenterContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
`

const TopRightContainer = styled.div`
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 2;
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

const GuideContainer = styled.div`
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

const Guide = styled.div`
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
  clear: () => void
  start: () => void
  stop: () => void
  isUsingCamera: () => boolean
}

type ScannerProps = {
  handleCode: (code: string, imageDataUrl?: string) => void
  autoBeep?: boolean
  autoStart?: boolean
  autoStop?: boolean
  dropzone?: boolean
  badge?: string
}

class NoDeviceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NoDeviceError"
  }
}

/**
 * Scanner component for detecting QR codes using camera or screen capture or optional dropzone
 *
 * @param handleCode callback function that handles detected codes
 * @param autoBeep automatically play confirmation sound when code is detected, defaults to `true`
 * @param autoStart automatically start camera on mount, defaults to `false`
 * @param autoStop automatically stop scanning once code is detected, defaults to `true`
 * @param dropzone enable dropzone, defaults to `false`
 * @param badge display badge (optional)
 *
 * @example
 * const scannerRef = useRef<ScannerRef>(null)
 *
 * <Scanner
 *   ref={scannerRef}
 *   handleCode={(code) => console.log(code)}
 * />
 */
const Scanner = forwardRef<ScannerRef, ScannerProps>((props, ref) => {
  const { t } = useTranslation()
  const videoRef = useRef<null | HTMLVideoElement>(null)
  const mediaStreamRef = useRef<null | MediaStream>(null)
  const computingRef = useRef(false)
  const handleCodeRef = useRef(props.handleCode)
  const [showSourceSettings, setShowSourceSettings] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [sources, setSources] = useState<CustomDesktopCapturerSource[]>([])
  const [source, setSource] = useState<null | Source>(() => {
    const deviceId = window.api.invokeSync.getConfig("scannerDevice")
    if (deviceId) {
      return { id: deviceId, type: "device" }
    }
    const sourceId = window.api.invokeSync.getConfig("scannerSource")
    if (sourceId) {
      return { id: sourceId, type: "source" }
    }
    return null
  })
  const [deviceDropdownOpened, setDeviceDropdownOpened] = useState(false)
  const [sourceDropdownOpened, setSourceDropdownOpened] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<null | ErrorState<
    | "components.scanner.pleaseAllowCameraAccess"
    | "components.scanner.pleaseConnectCamera"
    | "components.scanner.cameraDoesNotMeetMinimumRequirementOf720p"
    | "components.scanner.pleaseAllowScreenRecording"
    | "components.scanner.couldNotRunScanner"
    | "components.scanner.couldNotHandleFile"
  >>(null)
  const [isUsingCamera, setIsUsingCamera] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [imageDataUrl, setImageDataUrl] = useState<null | string>(null)
  const {
    handleCode,
    autoBeep = true,
    autoStart = false,
    autoStop = true,
    dropzone = false,
  } = props

  const stop = useCallback(() => {
    setIsStreaming(false)
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
    async (imageData?: ImageData, isUsingDropzone = false) => {
      computingRef.current = true
      let canvas: null | HTMLCanvasElement = null
      if (imageData === undefined && videoRef.current) {
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
        if (canvas2d === null) {
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
      } else if (imageData) {
        canvas = document.createElement("canvas")
        canvas.width = imageData.width
        canvas.height = imageData.height
        const canvas2d = canvas.getContext("2d")
        if (canvas2d === null) {
          throw new Error("Could not get canvas context")
        }
        canvas2d.putImageData(imageData, 0, 0)
      }
      if (imageData === undefined) {
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
        canvas &&
        code &&
        (isUsingDropzone ||
          (videoRef.current !== null && mediaStreamRef.current !== null))
      ) {
        setImageDataUrl(canvas.toDataURL("image/jpeg", 100))
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
    videoInputDevices.sort((a, b) => a.label.localeCompare(b.label))
    setDevices(videoInputDevices)
    return videoInputDevices
  }, [])

  const capture = useCallback(async () => {
    try {
      setError(null)
      setIsLoading(true)
      const updatedDevices = await updateDevices()
      let currentSource = source
      if (currentSource === null) {
        if (updatedDevices[0]) {
          currentSource = {
            id: updatedDevices[0].deviceId,
            type: "device",
          }
          setSource(currentSource)
        }
      } else if (currentSource.type === "device") {
        const deviceExists = updatedDevices.some(
          (device) => device.deviceId === currentSource?.id
        )
        if (deviceExists === false) {
          window.api.invokeSync.unsetConfig("scannerDevice")
          if (updatedDevices[0]) {
            currentSource = {
              id: updatedDevices[0].deviceId,
              type: "device",
            }
            setSource(currentSource)
          } else {
            currentSource = null
            setSource(null)
          }
        }
      }
      if (currentSource === null) {
        throw new NoDeviceError("No device available")
      }
      let constraints: MediaStreamConstraints
      if (currentSource.type === "device") {
        constraints = {
          audio: false,
          video: {
            deviceId: {
              exact: currentSource.id,
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
              chromeMediaSourceId: currentSource.id,
              maxFrameRate: maxFrameRate,
            },
          } as MediaTrackConstraints,
        }
      }
      mediaStreamRef.current =
        await navigator.mediaDevices.getUserMedia(constraints)
      setIsLoading(false)
      if (videoRef.current) {
        const metadataTimeout = setTimeout(() => {
          if (currentSource?.type === "device") {
            setError({
              message: "components.scanner.pleaseAllowCameraAccess",
            })
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
      setIsLoading(false)
      if (
        captureError instanceof Error &&
        captureError.name === "NoDeviceError"
      ) {
        setError({ message: "components.scanner.pleaseConnectCamera" })
      } else if (
        source?.type === "device" &&
        captureError instanceof Error &&
        captureError.name === "NotAllowedError"
      ) {
        setError({ message: "components.scanner.pleaseAllowCameraAccess" })
      } else if (
        source?.type === "device" &&
        captureError instanceof Error &&
        captureError.name === "NotReadableError"
      ) {
        setError({ message: "components.scanner.pleaseConnectCamera" })
      } else if (
        source?.type === "device" &&
        captureError instanceof Error &&
        captureError.name === "OverconstrainedError"
      ) {
        setError({
          message:
            "components.scanner.cameraDoesNotMeetMinimumRequirementOf720p",
        })
      } else if (
        source?.type === "source" &&
        captureError instanceof Error &&
        captureError.name === "NotReadableError"
      ) {
        setError({ message: "components.scanner.pleaseAllowScreenRecording" })
      } else {
        setError({ message: "components.scanner.couldNotRunScanner" })
      }
    }
  }, [updateDevices, source, stop, debouncedCompute])

  const start = useCallback(() => {
    if (
      mediaStreamRef.current === null ||
      mediaStreamRef.current.active === false
    ) {
      setIsUsingCamera(true)
      setIsStreaming(true)
      void capture()
    }
  }, [capture])

  const updateSources = async (): Promise<CustomDesktopCapturerSource[]> => {
    const result = await window.api.invoke.getDesktopCapturerSources()
    if (result.success === false) {
      setError({ message: "components.scanner.pleaseAllowScreenRecording" })
      return []
    }
    const sortedSources = result.customDesktopCapturerSources.sort((a, b) =>
      a.label.localeCompare(b.label)
    )
    setSources(sortedSources)
    // On Linux, set source to selected window
    // See https://www.electronjs.org/docs/latest/api/desktop-capturer#caveats
    const sourceId = sortedSources[0]?.id
    if (window.api.platform === "linux" && sourceId) {
      setSource({
        id: sourceId,
        type: "source",
      })
      window.api.invokeSync.setConfig("scannerSource", sourceId)
      setShowSourceSettings(false)
      start()
    }
    return sortedSources
  }

  const beep = useCallback(() => {
    void play()
  }, [])

  const clear = useCallback(() => {
    setImageDataUrl(null)
  }, [])

  const getIsUsingCamera = useCallback(() => {
    return isUsingCamera
  }, [isUsingCamera])

  useImperativeHandle(
    ref,
    () => ({
      beep,
      clear,
      start,
      stop,
      isUsingCamera: getIsUsingCamera,
    }),
    [beep, clear, start, stop, getIsUsingCamera]
  )

  useEffect(() => {
    handleCodeRef.current = handleCode
  }, [handleCode])

  useEffect(() => {
    if (autoStart) {
      start()
    }
  }, [autoStart, start])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  if (showSourceSettings === true) {
    const deviceData: ComboboxItem[] = []
    for (const device of devices) {
      deviceData.push({ label: device.label, value: device.deviceId })
    }
    interface CustomComboboxItem extends ComboboxItem {
      thumbnailDataUrl: string
    }
    const sourceData: CustomComboboxItem[] = []
    for (const sourceItem of sources) {
      sourceData.push({
        label: sourceItem.label,
        thumbnailDataUrl: sourceItem.thumbnailDataUrl,
        value: sourceItem.id,
      })
    }
    return (
      <Fragment>
        <Container>
          <Select
            comboboxProps={{ keepMounted: false }}
            data={deviceData}
            dropdownOpened={deviceDropdownOpened}
            leftSection={<IconVideo size={16} />}
            label={t("components.scanner.device")}
            maxDropdownHeight={240}
            placeholder={`${t("components.scanner.selectDevice")}…`}
            value={source?.type === "device" ? source.id : null}
            onChange={(value) => {
              if (value) {
                setSource({
                  id: value,
                  type: "device",
                })
                window.api.invokeSync.setConfig("scannerDevice", value)
                window.api.invokeSync.unsetConfig("scannerSource")
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
            dropdownOpened={sourceDropdownOpened}
            leftSection={<IconDeviceDesktop size={16} />}
            label={t("components.scanner.source")}
            maxDropdownHeight={240}
            placeholder={`${t("components.scanner.selectSource")}…`}
            renderOption={({ option }) => (
              <Group wrap="nowrap">
                <Avatar src={(option as CustomComboboxItem).thumbnailDataUrl} />
                <Text>{option.label}</Text>
              </Group>
            )}
            value={source?.type === "source" ? source.id : null}
            onChange={(value) => {
              if (value) {
                setSource({
                  id: value,
                  type: "source",
                })
                window.api.invokeSync.unsetConfig("scannerDevice")
                window.api.invokeSync.setConfig("scannerSource", value)
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
            <IconX size={16} />
          </ActionIcon>
        </TopRightContainer>
        <ErrorModal
          error={error}
          onClose={() => {
            setError(null)
            setShowSourceSettings(true)
          }}
        />
      </Fragment>
    )
  } else {
    return (
      <Fragment>
        <Dropzone
          accept={["application/pdf", "image/jpeg"]}
          active={dropzone}
          maxFiles={1}
          maxSize={1 * 1024 ** 2} // 1 MB
          onDrop={async (files) => {
            const file = files[0]
            if (file === undefined) {
              return
            }
            try {
              setIsUsingCamera(false)
              const imageData = await fileToImageData(file)
              await compute(imageData, true)
            } catch {
              setError({ message: "components.scanner.couldNotHandleFile" })
            }
          }}
        />
        <Video ref={videoRef} />
        {isLoading === true ? (
          <Loading visible={isLoading} dialog="components.scanner.loading" />
        ) : null}
        {autoStart === false &&
        isLoading === false &&
        isStreaming === false &&
        isUsingCamera === false &&
        imageDataUrl === null ? (
          <Fragment>
            <CenterContainer>
              <Button size="sm" onClick={start} variant="signatureTextGradient">
                {t("components.scanner.useCameraOrScreenCapture")}
              </Button>
            </CenterContainer>
          </Fragment>
        ) : null}
        {isLoading === false && isStreaming === true ? (
          <Fragment>
            <GuideContainer>
              <Guide />
            </GuideContainer>
          </Fragment>
        ) : null}
        {isLoading === false &&
        isStreaming === false &&
        imageDataUrl !== null ? (
          <Image src={imageDataUrl} />
        ) : null}
        {props.badge && error === null ? (
          <ActionBadge color="dark">{props.badge}</ActionBadge>
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
            <IconSettings size={16} />
          </ActionIcon>
        </TopRightContainer>
        <ErrorModal
          error={error}
          onClose={() => {
            setError(null)
            setShowSourceSettings(true)
          }}
        />
      </Fragment>
    )
  }
})

Scanner.displayName = "Scanner"

export default Scanner
