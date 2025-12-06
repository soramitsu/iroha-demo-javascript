<template>
  <section class="card receive">
    <header class="card-header">
      <h2>Share Payment QR</h2>
      <button class="icon-cta" @click="toggleQr">
        <img :src="receiveIcon" alt="" />
        <span>{{ showQr ? 'Hide QR Code' : 'Show QR Code' }}</span>
      </button>
    </header>
    <div v-if="showQr" class="qr-panel">
      <div v-if="qrMarkup" class="qr" v-html="qrMarkup"></div>
      <p v-else class="helper">{{ qrMessage }}</p>
      <label v-if="activeAccountId">
        Amount
        <input type="number" min="0" step="0.01" v-model="amount" @input="handleAmountChange" />
      </label>
    </div>
    <div class="kv" style="margin-top: 16px;">
      <span class="kv-label">IH58</span>
      <span class="kv-value">{{ activeIh58 || 'Configure account first' }}</span>
    </div>
    <p class="helper">
      {{
        showQr
          ? 'QR encodes account + amount + asset definition for compatible wallets.'
          : 'Use the button above to render a QR that wallets can scan.'
      }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useSessionStore } from '@/stores/session'
import ReceiveIcon from '@/assets/receive.svg'

const session = useSessionStore()
const activeAccount = computed(() => session.activeAccount)
const activeAccountId = computed(() => activeAccount.value?.accountId ?? '')
const activeIh58 = computed(() => activeAccount.value?.ih58 ?? '')
const qrMarkup = ref('')
const qrMessage = ref('Tap the button to generate a QR.')
const amount = ref('0')
const showQr = ref(false)
const receiveIcon = ReceiveIcon

const generateQr = async () => {
  if (!activeAccountId.value) {
    qrMarkup.value = ''
    qrMessage.value = 'Configure an account before generating QR codes.'
    return
  }
  qrMessage.value = 'Generating QR...'
  const payload = {
    accountId: activeAccountId.value,
    assetDefinitionId: session.connection.assetDefinitionId,
    amount: amount.value
  }
  try {
    qrMarkup.value = await QRCode.toString(JSON.stringify(payload), {
      type: 'svg',
      width: 240,
      color: {
        dark: '#ffffff',
        light: '#00000000'
      }
    })
    qrMessage.value = 'QR ready.'
  } catch (error) {
    qrMessage.value = 'Failed to render QR.'
    console.warn('Failed to render QR', error)
  }
}

const toggleQr = () => {
  showQr.value = !showQr.value
  if (showQr.value) {
    generateQr()
  } else {
    qrMarkup.value = ''
    qrMessage.value = 'Tap the button to generate a QR.'
  }
}

const handleAmountChange = () => {
  if (showQr.value) {
    generateQr()
  }
}

watch(
  () => [activeAccountId.value, session.connection.assetDefinitionId],
  () => {
    if (showQr.value) {
      generateQr()
    }
  }
)
</script>

<style scoped>
.receive {
  max-width: 420px;
}

.qr-panel {
  margin-bottom: 18px;
}

.qr svg {
  width: 240px;
  height: auto;
  display: block;
  margin: 0 auto 20px;
}
</style>
