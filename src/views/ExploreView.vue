<template>
  <div class="card-grid">
    <section class="card">
      <header class="card-header">
        <h2>Explorer Metrics</h2>
        <button class="secondary" :disabled="loading" @click="refresh">
          Refresh
        </button>
      </header>
      <div v-if="metrics" class="grid-2">
        <div class="kv">
          <span class="kv-label">Block Height</span>
          <span class="kv-value">{{ metrics.blockHeight ?? "—" }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Finalized Height</span>
          <span class="kv-value">{{
            metrics.finalizedBlockHeight ?? "—"
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Tx Accepted</span>
          <span class="kv-value">{{
            metrics.transactionsAccepted ?? "—"
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Tx Rejected</span>
          <span class="kv-value">{{
            metrics.transactionsRejected ?? "—"
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Peers</span>
          <span class="kv-value">{{ metrics.peers ?? "—" }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Assets</span>
          <span class="kv-value">{{ metrics.assets ?? "—" }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Avg Commit Time</span>
          <span class="kv-value">{{
            formatMs(metrics.averageCommitTimeMs)
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Avg Block Time</span>
          <span class="kv-value">{{
            formatMs(metrics.averageBlockTimeMs)
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Last Block At</span>
          <span class="kv-value">{{
            formatDate(metrics.blockCreatedAt) || "—"
          }}</span>
        </div>
      </div>
      <p v-else class="helper">Metrics unavailable. Check Torii status.</p>
    </section>

    <section class="card">
      <header class="card-header">
        <div>
          <h2>Shareable Explorer QR</h2>
          <p class="helper">
            Rendered straight from Torii so wallets can scan the exact payload.
          </p>
        </div>
        <button class="secondary" :disabled="!accountQr" @click="copyQr">
          Copy JSON
        </button>
      </header>
      <div v-if="accountQr" class="qr-layout">
        <div class="qr-preview">
          <img
            v-if="accountQr.svg"
            class="qr-image"
            :src="`data:image/svg+xml;utf8,${encodeURIComponent(accountQr.svg)}`"
            alt="Explorer account QR"
          />
          <div class="qr-meta">
            <div class="kv">
              <span class="kv-label">Format</span>
              <span class="kv-value">{{
                accountQr.addressFormat.toUpperCase()
              }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">Network Prefix</span>
              <span class="kv-value">{{ accountQr.networkPrefix }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">QR Version</span>
              <span class="kv-value">v{{ accountQr.qrVersion }}</span>
            </div>
          </div>
        </div>
        <pre class="qr-payload">{{ formattedQr }}</pre>
      </div>
      <p v-else class="helper">
        No QR payload yet. Connect to Torii and pick an account.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getExplorerAccountQr, getExplorerMetrics } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import type {
  ExplorerAccountQrResponse,
  ExplorerMetricsResponse,
} from "@/types/iroha";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const metrics = ref<ExplorerMetricsResponse | null>(null);
const accountQr = ref<ExplorerAccountQrResponse | null>(null);
const loading = ref(false);

const formatDate = (value?: string | null) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatMs = (value?: number | null) => {
  if (!value || value <= 0) return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
};

const refresh = async () => {
  if (
    !session.connection.toriiUrl ||
    !session.hasAccount ||
    !activeAccount.value
  ) {
    return;
  }
  loading.value = true;
  try {
    const [metricsPayload, qrPayload] = await Promise.all([
      getExplorerMetrics(session.connection.toriiUrl),
      getExplorerAccountQr({
        toriiUrl: session.connection.toriiUrl,
        accountId: activeAccount.value.accountId,
      }),
    ]);
    metrics.value = metricsPayload;
    accountQr.value = qrPayload;
  } finally {
    loading.value = false;
  }
};

const formattedQr = computed(() =>
  accountQr.value
    ? JSON.stringify(accountQr.value, null, 2)
    : "No QR payload yet. Connect to Torii and choose an account.",
);

const copyQr = async () => {
  if (!accountQr.value) return;
  await navigator.clipboard.writeText(JSON.stringify(accountQr.value));
};

onMounted(refresh);
</script>

<style scoped>
.qr-layout {
  display: grid;
  grid-template-columns: minmax(200px, 240px) 1fr;
  gap: 16px;
  align-items: start;
}

.qr-preview {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.qr-image {
  width: 100%;
  max-width: 220px;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.qr-meta {
  display: grid;
  gap: 6px;
}

.qr-payload {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  padding: 16px;
  max-height: 240px;
  overflow: auto;
}

@media (max-width: 720px) {
  .qr-layout {
    grid-template-columns: 1fr;
  }

  .qr-image {
    justify-self: center;
  }
}
</style>
