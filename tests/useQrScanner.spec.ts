import { beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { useQrScanner } from '@/composables/useQrScanner'

const mockControls = { stop: vi.fn() }
const decodeFromImageUrl = vi.fn(async () => ({
  getText: () => 'img-payload'
}))
const decodeFromVideoDevice = vi.fn(async (_device: unknown, _video: unknown, cb: any) => {
  cb({ getText: () => 'cam-payload' }, undefined)
  return mockControls
})

vi.mock('@zxing/browser', () => {
  class MockReader {
    decodeFromImageUrl = decodeFromImageUrl
    decodeFromVideoDevice = decodeFromVideoDevice
  }
  return { BrowserMultiFormatReader: MockReader }
})

describe('useQrScanner', () => {
  beforeEach(() => {
    decodeFromImageUrl.mockClear()
    decodeFromVideoDevice.mockClear()
    mockControls.stop.mockClear()
    // @ts-expect-error allow overwrite for tests
    global.URL.createObjectURL = vi.fn(() => 'blob:qr')
    // @ts-expect-error allow overwrite for tests
    global.URL.revokeObjectURL = vi.fn()
    // @ts-expect-error allow overwrite for tests
    navigator.mediaDevices = {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }]
      }))
    }
  })

  it('decodes QR from image files', async () => {
    const onDecoded = vi.fn()
    let scanner: ReturnType<typeof useQrScanner> | null = null
    mount({
      setup() {
        scanner = useQrScanner(onDecoded)
        return () => h('div')
      }
    })
    if (!scanner) throw new Error('scanner not initialised')
    const file = new File(['data'], 'qr.png', { type: 'image/png' })
    const event = {
      target: { files: [file], value: '' }
    } as unknown as Event

    await scanner.decodeFile(event)

    expect(onDecoded).toHaveBeenCalledWith('img-payload')
    expect(scanner.message.value).toBe('QR decoded successfully.')
  })

  it('starts camera scan and stops after decode', async () => {
    const onDecoded = vi.fn()
    let scanner: ReturnType<typeof useQrScanner> | null = null
    mount({
      setup() {
        scanner = useQrScanner(onDecoded)
        scanner.videoRef.value = document.createElement('video')
        return () => h('div')
      }
    })
    if (!scanner) throw new Error('scanner not initialised')

    await scanner.start()

    expect(onDecoded).toHaveBeenCalledWith('cam-payload')
    expect(scanner.scanning.value).toBe(false)
    expect(scanner.message.value).toBe('QR decoded successfully.')
    expect(mockControls.stop).toHaveBeenCalled()
  })
})
