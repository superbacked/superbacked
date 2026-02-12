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
  start: () => void
  stop: () => void
}

interface ScannerProps {
  handleCode: (code: string, imageDataUrl?: string) => void
  autoBeep?: boolean
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
 * Scanner component for detecting QR codes using camera or screen capture
 *
 * @param handleCode callback function that handles detected codes
 * @param autoBeep automatically play confirmation sound when code is detected, defaults to `true`
 * @param autoStop automatically stop scanning once code is detected, defaults to `true`
 * @param dropzone enable dropzone, defaults to `false`
 * @param badge displayed badge (optional)
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
  const imageDataUrlRef = useRef<null | string>(null)
  const sourceRef = useRef<null | Source>(null)
  const computingRef = useRef(false)
  const handleCodeRef = useRef(props.handleCode)
  const [showSourceSettings, setShowSourceSettings] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [sources, setSources] = useState<CustomDesktopCapturerSource[]>([])
  const [deviceValue, setDeviceValue] = useState<null | string>(
    window.api.invokeSync.getConfig("scannerDevice") ?? null
  )
  const [sourceValue, setSourceValue] = useState<null | string>(
    window.api.invokeSync.getConfig("scannerSource") ?? null
  )
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
  const [streaming, setStreaming] = useState(false)
  const [userStarted, setUserStarted] = useState(false)
  const {
    handleCode,
    autoBeep = true,
    autoStop = true,
    dropzone = false,
  } = props

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
        if (!canvas2d) {
          throw new Error("Could not get canvas context")
        }
        canvas2d.putImageData(imageData, 0, 0)
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
        imageDataUrlRef.current = canvas.toDataURL("image/jpeg", 100)
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
      if (!sourceRef.current) {
        if (deviceValue) {
          const deviceExists = updatedDevices.some(
            (device) => device.deviceId === deviceValue
          )
          if (deviceExists) {
            sourceRef.current = {
              id: deviceValue,
              type: "device",
            }
          } else {
            window.api.invokeSync.unsetConfig("scannerDevice")
            setDeviceValue(null)
          }
        }
        if (!sourceRef.current && sourceValue) {
          sourceRef.current = {
            id: sourceValue,
            type: "source",
          }
        }
        if (!sourceRef.current && updatedDevices[0]) {
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
      setIsLoading(false)
      if (videoRef.current) {
        const metadataTimeout = setTimeout(() => {
          if (sourceRef.current?.type === "device") {
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
        sourceRef.current?.type === "device" &&
        captureError instanceof Error &&
        captureError.name === "NotAllowedError"
      ) {
        setError({ message: "components.scanner.pleaseAllowCameraAccess" })
      } else if (
        sourceRef.current?.type === "device" &&
        captureError instanceof Error &&
        captureError.name === "NotReadableError"
      ) {
        setError({ message: "components.scanner.pleaseConnectCamera" })
      } else if (
        sourceRef.current?.type === "device" &&
        captureError instanceof Error &&
        captureError.name === "OverconstrainedError"
      ) {
        setError({
          message:
            "components.scanner.cameraDoesNotMeetMinimumRequirementOf720p",
        })
      } else if (
        sourceRef.current?.type === "source" &&
        captureError instanceof Error &&
        captureError.name === "NotReadableError"
      ) {
        setError({ message: "components.scanner.pleaseAllowScreenRecording" })
      } else {
        setError({ message: "components.scanner.couldNotRunScanner" })
      }
    }
  }, [updateDevices, deviceValue, sourceValue, stop, debouncedCompute])

  const start = useCallback(() => {
    if (!mediaStreamRef.current || mediaStreamRef.current.active === false) {
      setStreaming(true)
      setUserStarted(true)
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
      sourceRef.current = {
        id: sourceId,
        type: "source",
      }
      setSourceValue(sourceId)
      setShowSourceSettings(false)
      start()
    }
    return sortedSources
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
            leftSection={<IconVideo size={16} />}
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
            defaultValue={
              sourceRef.current?.type === "source" ? sourceRef.current.id : null
            }
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
            if (!file) {
              return
            }
            try {
              const imageData = await fileToImageData(file)
              await compute(imageData)
            } catch {
              setError({ message: "components.scanner.couldNotHandleFile" })
            }
          }}
        />
        <Video ref={videoRef} />
        {isLoading === true ? (
          <Loading visible={isLoading} dialog="components.scanner.loading" />
        ) : null}
        {isLoading === false && streaming === false && !userStarted ? (
          <Fragment>
            <CenterContainer>
              <Button size="sm" onClick={start} variant="signatureTextGradient">
                {t("components.scanner.scanBlockUsingCamera")}
              </Button>
            </CenterContainer>
          </Fragment>
        ) : null}
        {isLoading === false && streaming === true ? (
          <Fragment>
            <GuideContainer>
              <Guide />
            </GuideContainer>
          </Fragment>
        ) : null}
        {isLoading === false &&
        streaming === false &&
        imageDataUrlRef.current ? (
          <Image src={imageDataUrlRef.current} />
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
