<template>
  <section class="card">
    <header class="card-header">
      <h2>Transfer Asset</h2>
      <button class="secondary" @click="toggleScanner">
        {{ scanning ? 'Stop scanner' : 'Scan QR' }}
      </button>
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
    <p v-if="statusMessage" class="helper">{{ statusMessage }}</p>
  </section>
</template>

<script setup lang="ts">
import { BrowserMultiFormatReader } from '@zxing/browser'
import { onBeforeUnmount, reactive, ref, computed } from 'vue'
import { transferAsset } from '@/services/iroha'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const form = reactive({
  destination: '',
  quantity: '0',
  memo: ''
})
const sending = ref(false)
const statusMessage = ref('')
const scanning = ref(false)
const videoEl = ref<HTMLVideoElement | null>(null)
const reader = new BrowserMultiFormatReader()
let controls: ReturnType<BrowserMultiFormatReader['decodeFromVideoDevice']> | null = null

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
  if (!videoEl.value) {
    return
  }
  scanning.value = true
  try {
    controls = await reader.decodeFromVideoDevice(undefined, videoEl.value, (result) => {
      if (result) {
        try {
          const parsed = JSON.parse(result.getText())
          if (parsed.accountId) {
            form.destination = parsed.accountId
          }
          if (parsed.amount) {
            form.quantity = String(parsed.amount)
          }
          stopScanner()
        } catch (err) {
          console.warn('Invalid QR payload', err)
        }
      }
    })
  } catch (error) {
    scanning.value = false
    statusMessage.value = error instanceof Error ? error.message : String(error)
  }
}

const stopScanner = () => {
  scanning.value = false
  controls?.stop()
  controls = null
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
