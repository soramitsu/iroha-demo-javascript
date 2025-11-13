<template>
  <section class="card">
    <header class="card-header">
      <h2>Transfer Asset</h2>
      <div class="actions-row">
        <button class="icon-cta" @click="toggleScanner">
          <img :src="sendIcon" alt="" />
          <span>{{ scanning ? 'Stop Scanner' : 'Scan QR Code' }}</span>
        </button>
        <button class="icon-cta secondary" @click="openFilePicker">
          <img :src="sendIcon" alt="" />
          <span>Upload QR Image</span>
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="sr-only"
          @change="handleFileChosen"
        />
      </div>
    </header>
    <div v-if="scanning" class="scanner">
      <video ref="videoEl" autoplay muted playsinline></video>
    </div>
    <div class="form-grid">
      <label>
        Destination Account ID
        <input v-model="form.destination" placeholder="ed0120...@wonderland" />
      </label>
      <label>
        Amount
        <input type="number" min="0" step="0.01" v-model="form.quantity" />
      </label>
      <label>
        Memo (optional)
        <input v-model="form.memo" placeholder="Thanks for lunch" />
      </label>
    </div>
    <div class="actions">
      <button @click="handleSend" :disabled="sending || !isValid">
        {{ sending ? 'Submitting…' : 'Send' }}
      </button>
    </div>
    <p v-if="scanMessage" class="helper">{{ scanMessage }}</p>
    <p v-if="statusMessage" class="helper">{{ statusMessage }}</p>
  </section>
</template>

<script setup lang="ts">
import { BrowserMultiFormatReader } from '@zxing/browser'
import { nextTick, onBeforeUnmount, reactive, ref, computed } from 'vue'
import { transferAsset } from '@/services/iroha'
import { useSessionStore } from '@/stores/session'
import SendIcon from '@/assets/send.svg'

const session = useSessionStore()
const form = reactive({
  destination: '',
  quantity: '0',
  memo: ''
})
const sending = ref(false)
const statusMessage = ref('')
const scanMessage = ref('')
const scanning = ref(false)
const videoEl = ref<HTMLVideoElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const reader = new BrowserMultiFormatReader()
let controls: ReturnType<BrowserMultiFormatReader['decodeFromVideoDevice']> | null = null
const sendIcon = SendIcon

const isValid = computed(
  () =>
    Boolean(
      session.hasAccount &&
        session.connection.assetDefinitionId &&
        Number(form.quantity) > 0 &&
        form.destination
    )
)

const handleSend = async () => {
  if (!isValid.value || !session.connection.toriiUrl) {
    statusMessage.value = 'Configure Torii + account first.'
    return
  }
  sending.value = true
  statusMessage.value = ''
  try {
    const result = await transferAsset({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      assetDefinitionId: session.connection.assetDefinitionId,
      accountId: session.user.accountId,
      destinationAccountId: form.destination,
      quantity: form.quantity,
      privateKeyHex: session.user.privateKeyHex,
      metadata: form.memo ? { memo: form.memo } : undefined
    })
    statusMessage.value = `Transaction submitted: ${result.hash}`
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    sending.value = false
  }
}

const toggleScanner = async () => {
  if (scanning.value) {
    stopScanner()
    return
  }
  scanning.value = true
  scanMessage.value = ''
  await nextTick()
  if (!videoEl.value) {
    scanMessage.value = 'Camera preview is not ready yet.'
    scanning.value = false
    return
  }
  try {
    await ensureCameraPermission()
    controls = await reader.decodeFromVideoDevice(undefined, videoEl.value, (result, error) => {
      if (result) {
        try {
          const parsed = JSON.parse(result.getText())
          if (parsed.accountId) {
            form.destination = parsed.accountId
          }
          if (parsed.amount) {
            form.quantity = String(parsed.amount)
          }
          scanMessage.value = 'QR decoded successfully.'
          stopScanner()
        } catch (err) {
          scanMessage.value = 'QR payload is invalid.'
          console.warn('Invalid QR payload', err)
        }
      } else if (error && error.name !== 'NotFoundException') {
        scanMessage.value = error.message ?? 'Camera error.'
      }
    })
  } catch (error) {
    scanning.value = false
    scanMessage.value = error instanceof Error ? error.message : String(error)
  }
}

const stopScanner = () => {
  scanning.value = false
  controls?.stop()
  controls = null
  if (videoEl.value) {
    videoEl.value.srcObject = null
  }
  scanMessage.value = ''
}

const openFilePicker = () => {
  fileInput.value?.click()
}

const handleFileChosen = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  scanMessage.value = 'Processing image...'
  const url = URL.createObjectURL(file)
  try {
    const result = await reader.decodeFromImageUrl(url)
    if (result) {
      const parsed = JSON.parse(result.getText())
      if (parsed.accountId) {
        form.destination = parsed.accountId
      }
      if (parsed.amount) {
        form.quantity = String(parsed.amount)
      }
      scanMessage.value = 'QR decoded successfully.'
    } else {
      scanMessage.value = 'Unable to read QR from image.'
    }
  } catch (error) {
    scanMessage.value =
      error instanceof Error ? error.message : 'Unable to decode the selected image.'
  } finally {
    URL.revokeObjectURL(url)
    target.value = ''
  }
}

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

onBeforeUnmount(() => {
  stopScanner()
})
</script>

<style scoped>
.scanner {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 16px;
}

video {
  width: 100%;
  background: black;
}
</style>
