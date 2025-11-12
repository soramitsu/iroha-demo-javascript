<template>
  <div class="card-grid">
    <section class="card">
      <header class="card-header">
        <h2>Explorer Metrics</h2>
        <button class="secondary" @click="refresh" :disabled="loading">Refresh</button>
      </header>
      <div v-if="metrics" class="grid-2">
        <div class="kv">
          <span class="kv-label">Blocks Pending</span>
          <span class="kv-value">{{ metrics.pendingBlocks ?? '—' }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Tx Accepted</span>
          <span class="kv-value">{{ metrics.transactionsAccepted ?? '—' }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Tx Rejected</span>
          <span class="kv-value">{{ metrics.transactionsRejected ?? '—' }}</span>
        </div>
      </div>
      <p v-else class="helper">Metrics unavailable. Check Torii status.</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Shareable Explorer QR payload</h2>
        <button class="secondary" @click="copyQr" :disabled="!accountQr">Copy JSON</button>
      </header>
      <pre class="qr-payload">{{ formattedQr }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getExplorerAccountQr, getExplorerMetrics } from '@/services/iroha'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const metrics = ref<any | null>(null)
const accountQr = ref<any | null>(null)
const loading = ref(false)

const refresh = async () => {
  if (!session.connection.toriiUrl || !session.hasAccount) {
    return
  }
  loading.value = true
  try {
    const [metricsPayload, qrPayload] = await Promise.all([
      getExplorerMetrics(session.connection.toriiUrl),
      getExplorerAccountQr({
        toriiUrl: session.connection.toriiUrl,
        accountId: session.user.accountId
      })
    ])
    metrics.value = metricsPayload
    accountQr.value = qrPayload
  } finally {
    loading.value = false
  }
}

const formattedQr = computed(() =>
  accountQr.value ? JSON.stringify(accountQr.value, null, 2) : 'No QR payload. Configure Torii.'
)

const copyQr = async () => {
  if (!accountQr.value) return
  await navigator.clipboard.writeText(JSON.stringify(accountQr.value))
}

onMounted(refresh)
</script>

<style scoped>
.qr-payload {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  padding: 16px;
  max-height: 240px;
  overflow: auto;
}
</style>
