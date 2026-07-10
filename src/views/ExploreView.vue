<template>
  <RouteHeaderAction>
    <AppButton
      variant="secondary"
      :loading="loading"
      data-testid="explore-refresh"
      @click="refresh"
    >
      {{ t("Refresh") }}
    </AppButton>
  </RouteHeaderAction>

  <div class="explore-layout">
    <section
      class="card explore-metrics-card"
      :aria-busy="loading || undefined"
    >
      <header class="card-header">
        <div>
          <p class="eyebrow">{{ t("Live network status") }}</p>
          <h2>{{ t("Network health") }}</h2>
        </div>
      </header>

      <InlineAlert
        v-if="loading && !metrics && !metricsError"
        :title="t('Network health')"
      >
        {{ t("Querying explorer and status surfaces.") }}
      </InlineAlert>

      <InlineAlert
        v-else-if="metricsError"
        tone="danger"
        :title="t('Metrics unavailable. Check Torii status.')"
      >
        {{ t("Unable to load network stats.") }}
      </InlineAlert>

      <MetricList v-else-if="metrics" :items="metricItems" />
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
        <div class="explorer-actions" :aria-label="t('Explorer QR')">
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
        <div class="qr-preview" data-testid="explorer-qr">
          <img
            v-if="accountQr.svg"
            class="qr-image"
            :src="`data:image/svg+xml;utf8,${encodeURIComponent(accountQr.svg)}`"
            :alt="t('Explorer account QR')"
          />
        </div>

        <TechnicalDisclosure :summary="t('QR details')">
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
          <pre class="qr-payload">{{ formattedQr }}</pre>
        </TechnicalDisclosure>
      </div>

      <InlineAlert v-else-if="qrError" tone="warning" :title="t('Explorer QR')">
        {{ t("No QR payload yet. Connect to Torii and pick an account.") }}
      </InlineAlert>

      <EmptyState
        v-else
        :title="t('Explorer QR')"
        :description="
          t('No QR payload yet. Connect to Torii and pick an account.')
        "
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  AppButton,
  EmptyState,
  InlineAlert,
  MetricList,
  RouteHeaderAction,
  TechnicalDisclosure,
} from "@/components/ui";
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
const metricsError = ref(false);
const qrError = ref(false);
const requestGeneration = ref(0);

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(localeStore.current, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "";
  }
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

const metricItems = computed(() => {
  if (!metrics.value) return [];
  return [
    { label: t("Block Height"), value: metrics.value.blockHeight ?? t("—") },
    {
      label: t("Finalized Height"),
      value: metrics.value.finalizedBlockHeight ?? t("—"),
    },
    {
      label: t("Tx Accepted"),
      value: metrics.value.transactionsAccepted ?? t("—"),
    },
    {
      label: t("Tx Rejected"),
      value: metrics.value.transactionsRejected ?? t("—"),
    },
    { label: t("Peers"), value: metrics.value.peers ?? t("—") },
    { label: t("Assets"), value: metrics.value.assets ?? t("—") },
    {
      label: t("Avg Commit Time"),
      value: formatMs(metrics.value.averageCommitTimeMs),
    },
    {
      label: t("Avg Block Time"),
      value: formatMs(metrics.value.averageBlockTimeMs),
    },
    {
      label: t("Last Block At"),
      value: formatDate(metrics.value.blockCreatedAt) || t("—"),
    },
  ];
});

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = requestAccountId.value;
  if (!toriiUrl) {
    requestGeneration.value += 1;
    loading.value = false;
    resetExplorerState();
    metricsError.value = true;
    qrError.value = false;
    return;
  }
  const currentGeneration = requestGeneration.value + 1;
  requestGeneration.value = currentGeneration;
  loading.value = true;
  metricsError.value = false;
  qrError.value = false;
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
    metricsError.value = metricsResult.status === "rejected" || !metrics.value;
    const qrPayload = qrResult.status === "fulfilled" ? qrResult.value : null;
    qrError.value = qrResult.status === "rejected";
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
  grid-template-columns: minmax(340px, 0.9fr) minmax(420px, 1.1fr);
  gap: var(--space-5);
  align-items: start;
}

.explore-metrics-card,
.explore-qr-card {
  min-height: 100%;
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.explore-metrics-card {
  display: grid;
  align-content: start;
  gap: var(--space-4);
}

.explorer-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.explorer-link {
  text-decoration: none;
}

.qr-layout {
  display: grid;
  gap: var(--space-4);
}

.qr-preview {
  width: min(100%, 340px);
  justify-self: center;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel-soft);
  box-shadow: var(--shadow-inset);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.qr-image {
  width: 100%;
  max-width: 308px;
  aspect-ratio: 1 / 1;
  display: block;
  padding: var(--space-3);
  border-radius: var(--radius-control);
  background: var(--color-qr-surface);
}

.qr-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  margin-block-end: var(--space-4);
}

.qr-payload {
  max-height: 280px;
  margin: 0;
  padding: var(--space-4);
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
  white-space: pre-wrap;
  word-break: break-word;
  unicode-bidi: plaintext;
}

@media (max-width: 1080px) {
  .explore-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .explore-layout {
    gap: var(--space-4);
  }

  .explorer-actions,
  .explorer-actions > * {
    width: 100%;
  }

  .qr-meta {
    grid-template-columns: 1fr;
  }
}
</style>
