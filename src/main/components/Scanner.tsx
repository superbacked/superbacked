import styled from "@emotion/styled"
import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  ComboboxItem,
  Group,
  Select,
  Space,
  Text,
} from "@mantine/core"
import { IconDeviceDesktop, IconSettings, IconVideo } from "@tabler/icons-react"
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
  height: ${(2 / 3) * 100}%;
  aspect-ratio: 1;
  border-radius: 4px;
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
  stopOnEscape?: boolean
  streamingBadge?: string
}

class NoDeviceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NoDeviceError"
  }
}

/**
 * Scanner component for detecting QR codes using camera or screen recording or optional dropzone
 *
 * @param handleCode callback function that handles detected codes
 * @param autoBeep automatically play confirmation sound when code is detected, defaults to `true`
 * @param autoStart automatically start camera on mount, defaults to `false`
 * @param autoStop automatically stop scanning once code is detected, defaults to `true`
 * @param dropzone enable dropzone, defaults to `false`
 * @param badge display badge (optional)
 * @param stopOnEscape stop streaming on Escape and return to the idle state, defaults to `false` — for full-view embeddings only, as in a modal Escape already closes the modal
 * @param streamingBadge badge displayed while streaming instead of `badge` (optional)
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
  const getInitialSource = (): null | Source => {
    const deviceId = window.api.invokeSync.getConfig("scannerDevice")
    if (deviceId) {
      return { id: deviceId, type: "device" }
    }
    const sourceId = window.api.invokeSync.getConfig("scannerSource")
    if (sourceId) {
      return { id: sourceId, type: "source" }
    }
    return null
  }
  const sourceRef = useRef<null | Source>(getInitialSource())
  // Counts captures and stops, so a capture can tell it was stopped
  // while it awaited the device list or the stream (see capture())
  const captureIdRef = useRef(0)
  // Settings open from the idle state only (the cog beside the button
  // that starts a stream, or the error modal once a failed capture has
  // returned to idle), so closing them has nothing to resume
  const [showSourceSettings, setShowSourceSettings] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [sources, setSources] = useState<CustomDesktopCapturerSource[]>([])
  const [source, setSource] = useState<null | Source>(sourceRef.current)
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
    stopOnEscape = false,
  } = props

  const updateSource = useCallback((newSource: null | Source) => {
    sourceRef.current = newSource
    setSource(newSource)
  }, [])

  const stop = useCallback(() => {
    setIsStreaming(false)
    // A capture still awaiting its stream (the permission prompt can hold
    // it for seconds) must not attach it once stopped — see capture()
    captureIdRef.current++
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
    // Stopped while awaiting a device list or a stream (Escape, the
    // cancel of the modal around the scanner, an unmount) — nothing
    // awaited after that may reach the state or the video element
    const captureId = ++captureIdRef.current
    const cancelled = () => captureId !== captureIdRef.current
    try {
      setError(null)
      setIsLoading(true)
      const updatedDevices = await updateDevices()
      if (cancelled() === true) {
        setIsLoading(false)
        return
      }
      let currentSource = sourceRef.current
      if (currentSource === null) {
        if (updatedDevices[0]) {
          currentSource = {
            id: updatedDevices[0].deviceId,
            type: "device",
          }
          updateSource(currentSource)
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
            updateSource(currentSource)
          } else {
            currentSource = null
            updateSource(null)
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
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      if (cancelled() === true) {
        // The stream arrived for a capture nobody wants — release the
        // device rather than leave its light on behind the idle button
        for (const track of stream.getTracks()) {
          track.stop()
        }
        setIsLoading(false)
        return
      }
      mediaStreamRef.current = stream
      setIsLoading(false)
      if (videoRef.current) {
        const metadataTimeout = setTimeout(() => {
          if (currentSource?.type === "device") {
            setError({
              message: "components.scanner.pleaseAllowCameraAccess",
            })
            // Back to idle, so closing the error (which opens the source
            // settings) and cancelling those lands on the start button
            stop()
            setIsUsingCamera(false)
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
      if (cancelled() === true) {
        // A denied prompt after the user already gave up is not an error
        // worth a modal
        return
      }
      // A failed capture returns to idle (see the metadata timeout above)
      stop()
      setIsUsingCamera(false)
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
  }, [updateDevices, updateSource, stop, debouncedCompute])

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

  // Selecting a device or source is an explicit intent to scan (unlike
  // merely closing settings) — persist it, close settings and start streaming
  const submitDevice = useCallback(
    (deviceId: string) => {
      updateSource({ id: deviceId, type: "device" })
      window.api.invokeSync.setConfig("scannerDevice", deviceId)
      window.api.invokeSync.unsetConfig("scannerSource")
      setShowSourceSettings(false)
      start()
    },
    [updateSource, start]
  )

  const submitSource = useCallback(
    (sourceId: string) => {
      updateSource({ id: sourceId, type: "source" })
      window.api.invokeSync.unsetConfig("scannerDevice")
      window.api.invokeSync.setConfig("scannerSource", sourceId)
      setShowSourceSettings(false)
      start()
    },
    [updateSource, start]
  )

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
      submitSource(sourceId)
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

  // Escape cancels the scan — the stream stops and the idle state (the
  // button that starts it) returns. Listening only while streaming keeps
  // Escape free for the source settings, whose select closes its dropdown
  // on Escape, and for the modals that open after a capture
  useEffect(() => {
    if (stopOnEscape === false || isStreaming === false) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stop()
        setIsUsingCamera(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isStreaming, stop, stopOnEscape])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  // The state before a stream starts — the button that starts it, with
  // the source settings cog beside it. A source is chosen before
  // streaming: changing it mid-stream is Escape (back to idle), then the
  // cog
  const isIdle =
    autoStart === false &&
    isLoading === false &&
    isStreaming === false &&
    isUsingCamera === false &&
    imageDataUrl === null

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
          {/* Laid out like every other form — the frame’s width minus
              the xl side padding (see the create route’s setup step in
              src/main/routes/Create.tsx), as the frame centers its
              children and would otherwise shrink the selects to their
              intrinsic width */}
          <Box px="xl" w="100%">
            <Select
              comboboxProps={{ keepMounted: false }}
              data={deviceData}
              dropdownOpened={deviceDropdownOpened}
              leftSection={<IconVideo size={16} />}
              label={t("components.scanner.device")}
              maxDropdownHeight={240}
              placeholder={`${t("components.scanner.selectDevice")}…`}
              value={source?.type === "device" ? source.id : null}
              onDropdownClose={() => setDeviceDropdownOpened(false)}
              onDropdownOpen={async () => {
                await updateDevices()
                setDeviceDropdownOpened(true)
              }}
              // onOptionSubmit rather than onChange — onChange does not
              // fire when the clicked option is already selected, and
              // clicking the current device must still close settings and
              // start streaming
              onOptionSubmit={submitDevice}
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
                  <Avatar
                    src={(option as CustomComboboxItem).thumbnailDataUrl}
                  />
                  <Text>{option.label}</Text>
                </Group>
              )}
              value={source?.type === "source" ? source.id : null}
              onDropdownClose={() => setSourceDropdownOpened(false)}
              onDropdownOpen={async () => {
                await updateSources()
                // On Linux, source is selected automatically
                if (window.api.platform !== "linux") {
                  setSourceDropdownOpened(true)
                }
              }}
              // onOptionSubmit rather than onChange — onChange does not
              // fire when the clicked option is already selected, and
              // clicking the current source must still close settings and
              // start streaming
              onOptionSubmit={submitSource}
            />
            <Space h="xl" />
            <Button
              fullWidth
              onClick={() => {
                setShowSourceSettings(false)
              }}
              size="sm"
              variant="default"
            >
              {t("common.cancel")}
            </Button>
          </Box>
        </Container>
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
        {isIdle === true ? (
          <Fragment>
            <CenterContainer>
              {/* The source settings cog beside the action it configures
                  — the pairing the create button and its secret actions
                  menu use (see src/main/routes/Create.tsx), the cog
                  opening the settings view at once rather than a menu */}
              <Group gap="xs" wrap="nowrap">
                <Button onClick={start} size="sm" variant="default">
                  {t("components.scanner.useCameraOrScreenRecording")}
                </Button>
                <ActionIcon
                  aria-label={t("components.scanner.sourceSettings")}
                  onClick={() => {
                    setShowSourceSettings(true)
                  }}
                  size="input-sm"
                  variant="default"
                >
                  <IconSettings size={18} />
                </ActionIcon>
              </Group>
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
        {/* The badge retires once a code is captured, like the other
          discovery hints — a capture always sets imageDataUrl (camera and
          dropzone alike) and clear() resets it, so the next-block badge
          reappears when a blockset restart clears the scanner. While
          streaming, the streaming badge (which can mention Escape) takes
          over when given */}
        {props.badge && error === null && imageDataUrl === null ? (
          <ActionBadge color="dark">
            {isStreaming === true && props.streamingBadge !== undefined
              ? props.streamingBadge
              : props.badge}
          </ActionBadge>
        ) : null}
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
