<template>
  <div class="explore-layout">
    <section class="card explore-metrics-card">
      <header class="card-header">
        <h2>{{ t("Network health") }}</h2>
        <button class="secondary" :disabled="loading" @click="refresh">
          {{ t("Refresh") }}
        </button>
      </header>
      <div v-if="metrics" class="grid-2 explore-metrics-grid">
        <div class="kv">
          <span class="kv-label">{{ t("Block Height") }}</span>
          <span class="kv-value">{{ metrics.blockHeight ?? t("—") }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Finalized Height") }}</span>
          <span class="kv-value">{{
            metrics.finalizedBlockHeight ?? t("—")
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Tx Accepted") }}</span>
          <span class="kv-value">{{
            metrics.transactionsAccepted ?? t("—")
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Tx Rejected") }}</span>
          <span class="kv-value">{{
            metrics.transactionsRejected ?? t("—")
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Peers") }}</span>
          <span class="kv-value">{{ metrics.peers ?? t("—") }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Assets") }}</span>
          <span class="kv-value">{{ metrics.assets ?? t("—") }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Avg Commit Time") }}</span>
          <span class="kv-value">{{
            formatMs(metrics.averageCommitTimeMs)
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Avg Block Time") }}</span>
          <span class="kv-value">{{
            formatMs(metrics.averageBlockTimeMs)
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Last Block At") }}</span>
          <span class="kv-value">{{
            formatDate(metrics.blockCreatedAt) || t("—")
          }}</span>
        </div>
      </div>
      <p v-else class="helper explore-empty">
        {{ t("Metrics unavailable. Check Torii status.") }}
      </p>
    </section>

    <section class="card explore-qr-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Explorer QR") }}</h2>
          <p class="helper">
            {{
              t(
                "Use this QR when another wallet or explorer needs this account.",
              )
            }}
          </p>
        </div>
        <div class="explorer-actions">
          <a
            class="secondary explorer-link"
            :href="DEFAULT_EXPLORER_URL"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ t("Open explorer") }}
          </a>
          <button class="secondary" :disabled="!accountQr" @click="copyQr">
            {{ t("Copy JSON") }}
          </button>
        </div>
      </header>
      <div v-if="accountQr" class="qr-layout">
        <div class="qr-preview">
          <img
            v-if="accountQr.svg"
            class="qr-image"
            :src="`data:image/svg+xml;utf8,${encodeURIComponent(accountQr.svg)}`"
            :alt="t('Explorer account QR')"
          />
          <div class="qr-meta">
            <div class="kv">
              <span class="kv-label">{{ t("I105 Account ID") }}</span>
              <span class="kv-value">{{ accountQr.literal }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("Network Prefix") }}</span>
              <span class="kv-value">{{ accountQr.networkPrefix }}</span>
            </div>
            <div class="kv">
              <span class="kv-label">{{ t("QR Version") }}</span>
              <span class="kv-value">v{{ accountQr.qrVersion }}</span>
            </div>
          </div>
        </div>
        <details class="technical-details compact">
          <summary>{{ t("QR details") }}</summary>
          <pre class="qr-payload">{{ formattedQr }}</pre>
        </details>
      </div>
      <p v-else class="helper explore-empty">
        {{ t("No QR payload yet. Connect to Torii and pick an account.") }}
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { getExplorerAccountQr, getExplorerMetrics } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { DEFAULT_EXPLORER_URL } from "@/constants/chains";
import { getPublicAccountId } from "@/utils/accountId";
import type {
  ExplorerAccountQrResponse,
  ExplorerMetricsResponse,
} from "@/types/iroha";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const requestAccountId = computed(
  () =>
    getPublicAccountId(activeAccount.value, session.connection.networkPrefix) ||
    activeAccount.value?.accountId ||
    "",
);
const { localeStore, t } = useAppI18n();
const metrics = ref<ExplorerMetricsResponse | null>(null);
const accountQr = ref<ExplorerAccountQrResponse | null>(null);
const loading = ref(false);
const requestGeneration = ref(0);

const formatDate = (value?: string | null) => {
  if (!value) return "";
  return new Intl.DateTimeFormat(localeStore.current, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatMs = (value?: number | null) => {
  if (!value || value <= 0) return t("—");
  if (value < 1000) return t("{value} ms", { value });
  return t("{value} s", { value: (value / 1000).toFixed(2) });
};

const resetExplorerState = () => {
  metrics.value = null;
  accountQr.value = null;
};

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = requestAccountId.value;
  if (!toriiUrl) {
    requestGeneration.value += 1;
    loading.value = false;
    resetExplorerState();
    return;
  }
  const currentGeneration = requestGeneration.value + 1;
  requestGeneration.value = currentGeneration;
  loading.value = true;
  try {
    const [metricsResult, qrResult] = await Promise.allSettled([
      Promise.resolve().then(() => getExplorerMetrics(toriiUrl)),
      accountId
        ? Promise.resolve().then(() =>
            getExplorerAccountQr({
              toriiUrl,
              accountId,
            }),
          )
        : Promise.resolve(null),
    ]);
    if (
      currentGeneration !== requestGeneration.value ||
      session.connection.toriiUrl !== toriiUrl ||
      requestAccountId.value !== accountId
    ) {
      return;
    }
    metrics.value =
      metricsResult.status === "fulfilled" ? metricsResult.value : null;
    const qrPayload = qrResult.status === "fulfilled" ? qrResult.value : null;
    if (!qrPayload) {
      accountQr.value = null;
      return;
    }
    const adoptedChainPrefix = session.syncChainNetworkPrefix(
      qrPayload.networkPrefix,
    );
    if (adoptedChainPrefix) {
      session.persistState();
    }
    accountQr.value = qrPayload;
  } finally {
    if (currentGeneration === requestGeneration.value) {
      loading.value = false;
    }
  }
};

const formattedQr = computed(() =>
  accountQr.value
    ? JSON.stringify(accountQr.value, null, 2)
    : t("No QR payload yet. Connect to Torii and choose an account."),
);

const copyQr = async () => {
  if (!accountQr.value) return;
  await navigator.clipboard.writeText(JSON.stringify(accountQr.value));
};

watch(
  () => [session.connection.toriiUrl, requestAccountId.value],
  () => {
    refresh();
  },
  { immediate: true },
);
</script>

<style scoped>
.explore-layout {
  display: grid;
  grid-template-columns: minmax(360px, 0.95fr) minmax(420px, 1.05fr);
  gap: 20px;
  align-items: start;
}

.explore-metrics-card,
.explore-qr-card {
  min-height: 100%;
}

.explore-metrics-grid {
  align-items: stretch;
}

.explorer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.explorer-link {
  text-decoration: none;
}

.qr-layout {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.qr-preview {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 72%),
    rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 16px;
  display: grid;
  gap: 12px;
}

.qr-image {
  width: 100%;
  max-width: 240px;
  aspect-ratio: 1 / 1;
  border-radius: 16px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  justify-self: center;
}

.qr-meta {
  display: grid;
  gap: 8px;
}

.qr-payload {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 18px;
  padding: 16px;
  max-height: 360px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.explore-empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  text-align: center;
}

@media (max-width: 1080px) {
  .explore-layout {
    grid-template-columns: 1fr;
  }
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
