import {
  ActionIcon,
  Avatar,
  Dialog,
  Group,
  Loader,
  Select,
  SelectItem,
  Space,
  Text,
  useMantineTheme,
} from "@mantine/core"
import jsQr from "jsqr"
import {
  forwardRef,
  Fragment,
  FunctionComponent,
  useEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { styled } from "styled-components"
import {
  DeviceDesktop as DeviceDesktopIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Video as VideoIcon,
  X as XIcon,
} from "tabler-icons-react"
import { CustomDesktopCapturerSource } from "../index"
import ErrorModal from "./components/ErrorModal"
import confirmationSound from "./confirmation.wav"

const audio = new Audio(confirmationSound)

export const play = () => {
  audio.play()
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
  ${(props) => {
    if (props.radius) {
      return `
        border-radius: ${props.radius}px;
      `
    }
  }};
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
  ${(props) => {
    if (props.radius) {
      return `
        border-radius: ${props.radius}px;
      `
    }
  }};
`

interface Source {
  id: string
  type: "device" | "source"
}

export interface Code {
  value: string
}

export type Start = () => void

export type Stop = () => void

export type HandleCode = (
  code: string,
  imageDataUrl: string,
  start: Start,
  stop: Stop
) => void

interface ScannerProps {
  handleCode?: HandleCode
  radius?: number
}

const Scanner: FunctionComponent<ScannerProps> = (props) => {
  const { t } = useTranslation()
  const theme = useMantineTheme()
  const startRef = useRef<() => void>(null)
  const stopRef = useRef<() => void>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream>(null)
  const imageDataRef = useRef<ImageData>(null)
  const imageDataUrlRef = useRef<string>(null)
  const sourceRef = useRef<Source>(null)
  const computingRef = useRef(false)
  const [showSourceSettings, setShowSourceSettings] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [sources, setSources] = useState<CustomDesktopCapturerSource[]>([])
  const [deviceValue, setDeviceValue] = useState<string>(null)
  const [sourceValue, setSourceValue] = useState<string>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<
    | "pleaseConnectCameraAndAllowCameraAccess"
    | "cameraDoesNotMeetMinimumRequirementOf720p"
    | "pleaseAllowScreenRecording"
    | "couldNotRunScanner"
  >(null)
  const [showError, setShowError] = useState(false)
  const [streaming, setStreaming] = useState(false)
  startRef.current = () => {
    if (!mediaStreamRef.current || mediaStreamRef.current.active === false) {
      setStreaming(true)
      capture()
    }
  }
  stopRef.current = () => {
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
  }
  useEffect(() => {
    startRef.current()
    return () => {
      stopRef.current()
    }
  }, [])
  const compute = async (imageData?: ImageData) => {
    computingRef.current = true
    let canvas: HTMLCanvasElement
    if (typeof imageData === "undefined" && videoRef.current) {
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
    let code: string
    const zbarInstalled = await window.api.zbarInstalled()
    if (typeof BarcodeDetector !== "undefined") {
      // Use BarcodeDetector when available (currently macOS-only, see https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)
      const barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] })
      const detectedBarcodes = await barcodeDetector.detect(imageData)
      if (detectedBarcodes.length > 0) {
        code = detectedBarcodes[0].rawValue
        console.log("here yo", code)
      }
    } else if (zbarInstalled) {
      // Use zbar when available (currently Linux-only, see https://github.com/mchehab/zbar)
      code = await window.api.zbarDecode(canvas.toDataURL("image/jpeg", 100))
    } else {
      const qrCode = jsQr(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      })
      code = qrCode ? qrCode.data : null
    }
    if (code) {
      if (canvas) {
        imageDataRef.current = imageData
        imageDataUrlRef.current = canvas.toDataURL("image/png", 100)
      }
      props.handleCode(
        code,
        imageDataUrlRef.current,
        startRef.current,
        stopRef.current
      )
    }
    computingRef.current = false
  }
  const updateDevices = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoInputDevices: MediaDeviceInfo[] = []
    for (const device of devices) {
      if (device.kind === "videoinput") {
        videoInputDevices.push(device)
      }
    }
    setDevices(videoInputDevices)
    return videoInputDevices
  }
  const updateSources = async () => {
    const sources = await window.api.getSources()
    setSources(sources)
    return sources
  }
  const capture = async () => {
    try {
      setError(null)
      setShowError(false)
      setLoading(true)
      const updatedDevices = await updateDevices()
      if (!sourceRef.current) {
        if (updatedDevices.length !== 0) {
          sourceRef.current = {
            id: updatedDevices[0].deviceId,
            type: "device",
          }
        } else {
          throw new Error("No device available")
        }
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
        videoRef.current.srcObject = mediaStreamRef.current
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
        }
        videoRef.current.ontimeupdate = () => {
          if (computingRef.current === false) {
            compute()
          }
        }
      }
    } catch (error) {
      setLoading(false)
      if (
        error.message.match(/no device available/i) ||
        (sourceRef.current &&
          sourceRef.current.type === "device" &&
          error.name === "NotReadableError")
      ) {
        setError("pleaseConnectCameraAndAllowCameraAccess")
      } else if (
        sourceRef.current &&
        sourceRef.current.type === "device" &&
        error.name === "OverconstrainedError"
      ) {
        setError("cameraDoesNotMeetMinimumRequirementOf720p")
      } else if (
        sourceRef.current &&
        sourceRef.current.type === "source" &&
        error.name === "NotReadableError"
      ) {
        setError("pleaseAllowScreenRecording")
      } else {
        setError("couldNotRunScanner")
      }
      setShowError(true)
    }
  }
  if (showSourceSettings === true) {
    const deviceData: SelectItem[] = []
    for (const device of devices) {
      deviceData.push({ label: device.label, value: device.deviceId })
    }
    const sourceData: SelectItem[] = []
    for (const source of sources) {
      sourceData.push({
        label: source.label,
        thumbnailDataUrl: source.thumbnailDataUrl,
        value: source.id,
      })
    }
    interface SelectItemProps {
      label: string
      thumbnailDataUrl: string
    }
    const Source = forwardRef<HTMLDivElement, SelectItemProps>(
      ({ label, thumbnailDataUrl, ...otherProps }: SelectItemProps, ref) => (
        <Text ref={ref} {...otherProps}>
          <Group noWrap>
            <Avatar src={thumbnailDataUrl} />
            <Text>{label}</Text>
          </Group>
        </Text>
      )
    )
    return (
      <Fragment>
        <Container>
          <Select
            allowDeselect
            data={deviceData}
            defaultValue={
              sourceRef.current && sourceRef.current.type === "device"
                ? sourceRef.current.id
                : null
            }
            disabled={deviceData.length === 0}
            icon={<VideoIcon size={16} />}
            label={t("device")}
            maxDropdownHeight={240}
            placeholder={`${t("selectDevice")}…`}
            rightSection={
              <ActionIcon
                onClick={async () => {
                  await updateDevices()
                }}
              >
                <RefreshIcon size={16} />
              </ActionIcon>
            }
            value={
              (deviceValue ??
              (sourceRef.current && sourceRef.current.type === "device"))
                ? sourceRef.current.id
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
              startRef.current()
            }}
          />
          <Space h="lg" />
          <Select
            allowDeselect
            data={sourceData}
            defaultValue={
              sourceRef.current && sourceRef.current.type === "source"
                ? sourceRef.current.id
                : null
            }
            disabled={sourceData.length === 0}
            icon={<DeviceDesktopIcon size={16} />}
            itemComponent={Source}
            label={t("source")}
            maxDropdownHeight={240}
            placeholder={`${t("selectSource")}…`}
            rightSection={
              <ActionIcon
                onClick={async () => {
                  await updateSources()
                }}
              >
                <RefreshIcon size={16} />
              </ActionIcon>
            }
            value={
              (sourceValue ??
              (sourceRef.current && sourceRef.current.type === "source"))
                ? sourceRef.current.id
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
              startRef.current()
            }}
          />
        </Container>
        <TopRightContainer>
          <ActionIcon
            color="dark"
            radius="xl"
            variant="filled"
            onClick={() => {
              setShowSourceSettings(false)
              startRef.current()
            }}
          >
            <XIcon size={16} />
          </ActionIcon>
        </TopRightContainer>
      </Fragment>
    )
  } else {
    return (
      <Fragment>
        <Video ref={videoRef} radius={props.radius} />
        {loading === true ? (
          <Fragment>
            <Container>
              <Loader
                color={theme.colorScheme === "dark" ? "white" : "dark"}
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
              {t("loading")}…
            </Dialog>
          </Fragment>
        ) : null}
        {loading === false && streaming === true ? (
          <OverlayContainer>
            <Overlay />
          </OverlayContainer>
        ) : null}
        {loading === false && streaming === false && imageDataUrlRef.current ? (
          <Image radius={props.radius} src={imageDataUrlRef.current} />
        ) : null}
        <TopRightContainer>
          <ActionIcon
            color="dark"
            radius="xl"
            variant="filled"
            onClick={async () => {
              setShowSourceSettings(true)
              stopRef.current()
            }}
          >
            <SettingsIcon size={16} />
          </ActionIcon>
        </TopRightContainer>
        <ErrorModal
          error={t(error)}
          opened={showError}
          onClose={() => {
            setShowError(false)
            setShowSourceSettings(true)
          }}
        />
      </Fragment>
    )
  }
}

export default Scanner
