<template>
  <div class="card-grid">
    <section class="card">
      <header class="card-header">
        <h2>Balances</h2>
        <button class="secondary" @click="refresh" :disabled="loading">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </header>
      <div class="grid-2">
        <div class="kv">
          <span class="kv-label">Primary Asset</span>
          <span class="kv-value">{{ primaryAssetLabel }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Quantity</span>
          <span class="kv-value">{{ primaryAssetQuantity }}</span>
        </div>
      </div>
      <table class="table" v-if="assets.length">
        <thead>
          <tr>
            <th>Asset ID</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="asset in assets" :key="asset.asset_id">
            <td>{{ asset.asset_id }}</td>
            <td>{{ asset.quantity }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="helper">No assets found for this account.</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Latest Transactions</h2>
      </header>
      <table class="table" v-if="transactions.length">
        <thead>
          <tr>
            <th>Time</th>
            <th>Direction</th>
            <th>Amount</th>
            <th>Counterparty</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in transactions" :key="tx.entrypoint_hash">
            <td>{{ formatDate(tx.timestamp_ms) }}</td>
            <td>{{ tx.direction }}</td>
            <td>{{ tx.amount ?? '—' }}</td>
            <td>{{ tx.counterparty ?? '—' }}</td>
            <td :class="tx.result_ok ? 'status-pill ok' : 'status-pill error'">
              {{ tx.result_ok ? 'Committed' : 'Rejected' }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="helper">No transfers recorded yet.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchAccountAssets, fetchAccountTransactions } from '@/services/iroha'
import { useSessionStore } from '@/stores/session'
import type { AccountAssetsResponse, AccountTransactionsResponse } from '@/types/iroha'
import { extractTransferInsight } from '@/utils/transactions'

const session = useSessionStore()

const assets = ref<AccountAssetsResponse['items']>([])
const transactionsRaw = ref<AccountTransactionsResponse['items']>([])
const loading = ref(false)

const formatDate = (timestamp?: number) => {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(new Date(timestamp))
}

const refresh = async () => {
  if (!session.hasAccount || !session.connection.toriiUrl) {
    return
  }
  loading.value = true
  try {
    const [{ items: assetItems }, { items: txItems }] = await Promise.all([
      fetchAccountAssets({
        toriiUrl: session.connection.toriiUrl,
        accountId: session.user.accountId,
        limit: 50
      }),
      fetchAccountTransactions({
        toriiUrl: session.connection.toriiUrl,
        accountId: session.user.accountId,
        limit: 25
      })
    ])
    assets.value = assetItems
    transactionsRaw.value = txItems
  } finally {
    loading.value = false
  }
}

const primaryAsset = computed(() => {
  const target = session.connection.assetDefinitionId
  if (!target) {
    return null
  }
  return assets.value.find((asset) => asset.asset_id.startsWith(target)) ?? null
})

const primaryAssetLabel = computed(() => primaryAsset.value?.asset_id ?? session.connection.assetDefinitionId || '—')
const primaryAssetQuantity = computed(() => primaryAsset.value?.quantity ?? '0')

const transactions = computed(() =>
  transactionsRaw.value.map((tx) => {
    const insight = extractTransferInsight(tx, session.user.accountId)
    return {
      ...tx,
      direction: insight?.direction ?? '—',
      amount: insight?.amount ?? null,
      counterparty: insight?.counterparty ?? null
    }
  })
)

onMounted(refresh)
</script>
