<template>
  <section class="card receive">
    <header class="card-header">
      <h2>Share Payment QR</h2>
    </header>
    <div class="qr" v-html="qrMarkup"></div>
    <label>
      Amount
      <input type="number" min="0" step="0.01" v-model="amount" @input="generateQr" />
    </label>
    <div class="kv" style="margin-top: 16px;">
      <span class="kv-label">IH58</span>
      <span class="kv-value">{{ session.user.ih58 || 'Configure account first' }}</span>
    </div>
    <p class="helper">QR encodes account + amount + asset definition for compatible wallets.</p>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const qrMarkup = ref('')
const amount = ref('0')

const generateQr = async () => {
  if (!session.user.accountId) {
    qrMarkup.value = ''
    return
  }
  const payload = {
    accountId: session.user.accountId,
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
  } catch (error) {
    console.warn('Failed to render QR', error)
  }
}

watch(
  () => [session.user.accountId, session.connection.assetDefinitionId],
  () => generateQr(),
  { immediate: true }
)
</script>

<style scoped>
.receive {
  max-width: 420px;
}

.qr svg {
  width: 240px;
  height: auto;
  display: block;
  margin: 0 auto 20px;
}
</style>
