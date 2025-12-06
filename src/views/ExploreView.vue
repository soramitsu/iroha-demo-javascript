<template>
  <div class="card-grid">
    <section class="card">
      <header class="card-header">
        <h2>Explorer Metrics</h2>
        <button class="secondary" @click="refresh" :disabled="loading">Refresh</button>
      </header>
      <div v-if="metrics" class="grid-2">
        <div class="kv">
          <span class="kv-label">Block Height</span>
          <span class="kv-value">{{ metrics.blockHeight ?? '—' }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Finalized Height</span>
          <span class="kv-value">{{ metrics.finalizedBlockHeight ?? '—' }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Tx Accepted</span>
          <span class="kv-value">{{ metrics.transactionsAccepted ?? '—' }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Tx Rejected</span>
          <span class="kv-value">{{ metrics.transactionsRejected ?? '—' }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Peers</span>
          <span class="kv-value">{{ metrics.peers ?? '—' }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Assets</span>
          <span class="kv-value">{{ metrics.assets ?? '—' }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Avg Commit Time</span>
          <span class="kv-value">{{ formatMs(metrics.averageCommitTimeMs) }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Avg Block Time</span>
          <span class="kv-value">{{ formatMs(metrics.averageBlockTimeMs) }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Last Block At</span>
          <span class="kv-value">{{ formatDate(metrics.blockCreatedAt) || '—' }}</span>
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
import type { ExplorerAccountQrResponse, ExplorerMetricsResponse } from '@/types/iroha'

const session = useSessionStore()
const activeAccount = computed(() => session.activeAccount)
const metrics = ref<ExplorerMetricsResponse | null>(null)
const accountQr = ref<ExplorerAccountQrResponse | null>(null)
const loading = ref(false)

const formatDate = (value?: string | null) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('en', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value)
  )
}

const formatMs = (value?: number | null) => {
  if (!value || value <= 0) return '—'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(2)} s`
}

const refresh = async () => {
  if (!session.connection.toriiUrl || !session.hasAccount || !activeAccount.value) {
    return
  }
  loading.value = true
  try {
    const [metricsPayload, qrPayload] = await Promise.all([
      getExplorerMetrics(session.connection.toriiUrl),
      getExplorerAccountQr({
        toriiUrl: session.connection.toriiUrl,
        accountId: activeAccount.value.accountId
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
