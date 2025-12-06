import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { onBeforeUnmount, ref } from 'vue'

type Decoder = (payload: string) => void

export const useQrScanner = (onDecoded: Decoder) => {
  const reader = new BrowserMultiFormatReader()
  const scanning = ref(false)
  const message = ref('')
  const videoRef = ref<HTMLVideoElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)
  let controls: IScannerControls | null = null

  const ensureCameraPermission = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is not supported on this device.')
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    })
    stream.getTracks().forEach((track) => track.stop())
  }

  const stop = () => {
    scanning.value = false
    controls?.stop()
    controls = null
    if (videoRef.value) {
      videoRef.value.srcObject = null
    }
  }

  const start = async () => {
    if (scanning.value) {
      stop()
      return
    }
    const videoEl = videoRef.value
    if (!videoEl) {
      message.value = 'Camera preview is not ready.'
      return
    }
    scanning.value = true
    message.value = ''
    try {
      let shouldStop = false
      await ensureCameraPermission()
      const scannerControls = await reader.decodeFromVideoDevice(
        undefined,
        videoEl,
        (result, error) => {
          if (result) {
            onDecoded(result.getText())
            message.value = 'QR decoded successfully.'
            shouldStop = true
          } else if (error && error.name !== 'NotFoundException') {
            message.value = error.message ?? 'Camera error.'
            shouldStop = true
          }
        }
      )
      controls = scannerControls
      if (shouldStop) {
        stop()
      }
    } catch (error) {
      scanning.value = false
      message.value = error instanceof Error ? error.message : 'Unable to start scanner.'
    }
  }

  const openFilePicker = () => fileInputRef.value?.click()

  const decodeFile = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    message.value = 'Processing image...'
    try {
      const result = await reader.decodeFromImageUrl(url)
      if (result) {
        onDecoded(result.getText())
        message.value = 'QR decoded successfully.'
      } else {
        message.value = 'Unable to read QR from image.'
      }
    } catch (error) {
      message.value = error instanceof Error ? error.message : 'Unable to decode the selected image.'
    } finally {
      URL.revokeObjectURL(url)
      target.value = ''
    }
  }

  onBeforeUnmount(() => {
    stop()
  })

  return {
    scanning,
    message,
    videoRef,
    fileInputRef,
    start,
    stop,
    openFilePicker,
    decodeFile
  }
}
