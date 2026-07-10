<template>
  <div class="stats-shell" :aria-busy="loading || undefined">
    <RouteHeaderAction>
      <AppButton variant="secondary" :loading="loading" @click="refresh">
        {{ t("Refresh") }}
      </AppButton>
    </RouteHeaderAction>

    <section class="stats-summary" aria-labelledby="stats-supply-heading">
      <div class="stats-supply">
        <p class="section-label">{{ definitionLabel }}</p>
        <h2 id="stats-supply-heading">{{ t("XOR supply") }}</h2>
        <div class="stats-supply-line">
          <strong>{{ totalSupplyLabel }}</strong>
          <span>{{ assetSymbol }}</span>
        </div>
        <p class="helper">
          {{ t("As of {time}", { time: collectedAtLabel }) }}
        </p>
      </div>

      <div class="stats-overview">
        <p class="section-label">{{ t("At a glance") }}</p>
        <MetricList :items="overviewMetrics" compact />
      </div>
    </section>

    <InlineAlert
      data-testid="stats-readiness-alert"
      :tone="readinessTone"
      :title="readinessTitle"
    >
      <p>{{ readinessMessage }}</p>
    </InlineAlert>

    <div class="stats-disclosures">
      <TechnicalDisclosure
        data-testid="stats-disclosure-health"
        :summary="t('Network load')"
      >
        <section
          class="stats-detail-section"
          aria-labelledby="stats-health-heading"
        >
          <header class="stats-detail-heading">
            <div>
              <p class="section-label">{{ t("Consensus") }}</p>
              <h2 id="stats-health-heading">{{ t("Network load") }}</h2>
            </div>
            <StatusBadge :tone="readinessTone" dot>
              {{ telemetryLabel }}
            </StatusBadge>
          </header>

          <MetricList :items="runtimeMetrics" compact />

          <div class="stats-context-grid">
            <section aria-labelledby="stats-activity-heading">
              <h3 id="stats-activity-heading">{{ t("Activity totals") }}</h3>
              <MetricList :items="networkActivityMetrics" compact />
            </section>
            <section aria-labelledby="stats-shape-heading">
              <h3 id="stats-shape-heading">{{ t("Network shape") }}</h3>
              <MetricList :items="networkShapeMetrics" compact />
            </section>
            <section aria-labelledby="stats-validator-heading">
              <h3 id="stats-validator-heading">{{ t("Validator posture") }}</h3>
              <MetricList :items="validatorPostureMetrics" compact />
            </section>
          </div>
        </section>
      </TechnicalDisclosure>

      <TechnicalDisclosure
        data-testid="stats-disclosure-flow"
        :summary="t('Velocity and issuance')"
      >
        <section
          class="stats-detail-section"
          aria-labelledby="stats-flow-heading"
        >
          <header class="stats-detail-heading">
            <div>
              <p class="section-label">{{ t("Flow") }}</p>
              <h2 id="stats-flow-heading">{{ t("Velocity and issuance") }}</h2>
            </div>
            <StatusBadge>{{ t("1h / 24h / 7d windows") }}</StatusBadge>
          </header>

          <div class="stats-flow-grid">
            <section aria-labelledby="stats-velocity-heading">
              <h3 id="stats-velocity-heading">{{ t("Velocity") }}</h3>
              <MetricList
                v-if="velocityMetrics.length"
                :items="velocityMetrics"
                compact
              />
              <EmptyState v-else :description="t('Unavailable')" />
            </section>

            <section aria-labelledby="stats-issuance-heading">
              <h3 id="stats-issuance-heading">{{ t("Issuance") }}</h3>
              <MetricList
                v-if="issuanceMetrics.length"
                :items="issuanceMetrics"
                compact
              />
              <EmptyState v-else :description="t('Unavailable')" />
            </section>
          </div>

          <section
            v-if="issuanceSeriesBars.length"
            class="stats-series"
            aria-labelledby="stats-series-heading"
          >
            <div class="stats-subsection-heading">
              <h3 id="stats-series-heading">
                {{ t("30 day issuance pulse") }}
              </h3>
            </div>
            <div
              class="stats-series-chart"
              role="img"
              :aria-label="issuanceSeriesLabel"
            >
              <span class="stats-series-zero" aria-hidden="true"></span>
              <span
                v-for="bar in issuanceSeriesBars"
                :key="bar.key"
                class="stats-series-day"
                :class="bar.tone"
                :title="bar.title"
              >
                <span
                  class="stats-series-bar mint"
                  :style="{ height: `${bar.positiveHeight}%` }"
                ></span>
                <span
                  class="stats-series-bar burn"
                  :style="{ height: `${bar.negativeHeight}%` }"
                ></span>
              </span>
            </div>
          </section>
        </section>
      </TechnicalDisclosure>

      <TechnicalDisclosure
        data-testid="stats-disclosure-distribution"
        :summary="t('Holder concentration')"
      >
        <section
          class="stats-detail-section"
          aria-labelledby="stats-distribution-heading"
        >
          <header class="stats-detail-heading">
            <div>
              <p class="section-label">{{ t("Distribution") }}</p>
              <h2 id="stats-distribution-heading">
                {{ t("Holder concentration") }}
              </h2>
            </div>
            <StatusBadge>{{ top10ShareLabel }}</StatusBadge>
          </header>

          <div class="stats-distribution-grid">
            <section aria-labelledby="stats-concentration-heading">
              <h3 id="stats-concentration-heading">{{ t("Concentration") }}</h3>
              <MetricList :items="distributionMetrics" compact />

              <div v-if="lorenzCurve.hasData" class="stats-lorenz">
                <div class="stats-subsection-heading">
                  <h3>{{ t("Lorenz curve") }}</h3>
                  <span>{{ top10ShareLabel }}</span>
                </div>
                <svg
                  class="stats-lorenz-chart"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  role="img"
                  :aria-label="lorenzCurveLabel"
                >
                  <polyline
                    class="stats-lorenz-equality"
                    points="0,100 100,0"
                  />
                  <polyline
                    class="stats-lorenz-line"
                    :points="lorenzCurve.points"
                  />
                </svg>
                <div class="stats-lorenz-legend">
                  <span>{{ t("Even distribution") }}</span>
                  <span>{{ t("Observed supply") }}</span>
                </div>
              </div>
            </section>

            <section aria-labelledby="stats-holders-heading">
              <h3 id="stats-holders-heading">{{ t("Top holders") }}</h3>
              <ol v-if="topHolderRows.length" class="stats-holder-list">
                <li v-for="holder in topHolderRows" :key="holder.accountId">
                  <span class="stats-holder-rank" aria-hidden="true">
                    {{ holder.rank }}
                  </span>
                  <div>
                    <p class="stats-holder-account mono">
                      {{ holder.accountLabel }}
                    </p>
                    <p class="helper">{{ holder.balance }} {{ assetSymbol }}</p>
                  </div>
                  <strong>{{ holder.share }}</strong>
                </li>
              </ol>
              <EmptyState v-else :description="t('Unavailable')" />
            </section>
          </div>
        </section>
      </TechnicalDisclosure>
    </div>
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
  StatusBadge,
  TechnicalDisclosure,
} from "@/components/ui";
import { SORA_XOR_ASSET_DEFINITION_ID } from "@/constants/chains";
import { getGovernanceCitizenCount, getNetworkStats } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import type { UiTone } from "@/types/ui";
import { deriveAssetSymbol, formatAssetDefinitionLabel } from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import {
  buildDivergingSeriesBars,
  buildLorenzCurve,
  ratioPercent,
} from "@/utils/networkStatsVisuals";
import { resolveGovernanceCitizenCount } from "@/utils/parliament";

const session = useSessionStore();
const { d, n, t } = useAppI18n();

const stats = ref<Awaited<ReturnType<typeof getNetworkStats>> | null>(null);
const governanceCitizenCount = ref<Awaited<
  ReturnType<typeof getGovernanceCitizenCount>
> | null>(null);
const loading = ref(false);
const loadError = ref("");
const requestGeneration = ref(0);

const assetDefinitionId = computed(() => SORA_XOR_ASSET_DEFINITION_ID);
const definitionLabel = computed(() =>
  formatAssetDefinitionLabel(assetDefinitionId.value, "XOR"),
);
const assetSymbol = computed(() =>
  deriveAssetSymbol(assetDefinitionId.value, "XOR"),
);

const numberOrDash = (value: number | null | undefined, digits = 0) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return t("—");
  }
  return n(value, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

const formatCompactAmount = (value: string | null | undefined) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value?.trim() || t("—");
  }
  return n(numericValue, {
    notation: "compact",
    maximumFractionDigits: numericValue >= 100 ? 1 : 2,
  });
};

const formatPercent = (value: number | null | undefined, digits = 1) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return t("—");
  }
  const normalized = value > 1 ? value / 100 : value;
  return n(normalized, {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

const formatMs = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return t("—");
  }
  if (value < 1000) {
    return t("{value} ms", { value: Math.round(value) });
  }
  return t("{value} s", { value: (value / 1000).toFixed(2) });
};

const shortenAccountId = (value: string) => {
  const literal = value.trim();
  if (!literal) {
    return t("—");
  }
  if (literal.length <= 24) {
    return literal;
  }
  return `${literal.slice(0, 10)}…${literal.slice(-8)}`;
};

const queueFillPercent = computed(() => {
  const queueSize = stats.value?.runtime.queueSize;
  const queueCapacity = stats.value?.runtime.queueCapacity;
  return ratioPercent(queueSize, queueCapacity);
});

const totalSupplyLabel = computed(() =>
  formatCompactAmount(stats.value?.supply?.totalSupply),
);
const holdersCountLabel = computed(() =>
  numberOrDash(stats.value?.supply?.holdersTotal ?? null),
);
const citizenCount = computed(() =>
  resolveGovernanceCitizenCount(governanceCitizenCount.value),
);
const citizenCountLabel = computed(() =>
  citizenCount.value === null ? t("—") : numberOrDash(citizenCount.value),
);
const top10ShareLabel = computed(() =>
  formatPercent(stats.value?.supply?.distribution.top10 ?? null),
);
const queueFillLabel = computed(() =>
  queueFillPercent.value === null
    ? t("—")
    : formatPercent(queueFillPercent.value / 100),
);
const collectedAtLabel = computed(() =>
  stats.value?.collectedAtMs
    ? d(stats.value.collectedAtMs, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : t("—"),
);

const telemetryLabel = computed(() => {
  if (loading.value && !stats.value) {
    return t("Booting telemetry");
  }
  if (stats.value?.partial) {
    return t("Partial telemetry");
  }
  if (stats.value) {
    return t("Live telemetry");
  }
  return t("Waiting for signal");
});

const readinessTone = computed<UiTone>(() => {
  if (loadError.value) return "danger";
  if (stats.value?.partial || stats.value?.warnings.length) return "warning";
  if (stats.value) return "success";
  return "neutral";
});

const readinessTitle = computed(() =>
  loadError.value ? t("Unable to load network stats.") : telemetryLabel.value,
);

const readinessMessage = computed(() => {
  if (loadError.value) return loadError.value;
  if (stats.value?.warnings.length) return stats.value.warnings.join(" ");
  if (stats.value) {
    return t(
      "The active network is publishing live explorer, supply, and consensus data for the XOR lane.",
    );
  }
  if (loading.value) return t("Querying explorer and status surfaces.");
  return t("Waiting for signal");
});

const overviewMetrics = computed(() => {
  const runtime = stats.value?.runtime;
  return [
    { label: t("Holders"), value: holdersCountLabel.value },
    { label: t("Citizens"), value: citizenCountLabel.value },
    { label: t("Queue fill"), value: queueFillLabel.value },
    {
      label: t("Finality lag"),
      value: numberOrDash(runtime?.finalizationLag ?? null),
    },
  ];
});

const runtimeMetrics = computed(() => {
  const runtime = stats.value?.runtime;
  const queueFill = queueFillPercent.value;
  return [
    {
      label: t("Queue fill"),
      value: queueFill === null ? t("—") : formatPercent(queueFill / 100),
      detail:
        runtime?.txQueueSaturated == null
          ? t("Queue saturation signal unavailable.")
          : runtime.txQueueSaturated
            ? t("Ingress is at the saturation threshold.")
            : t("Ingress is below saturation."),
    },
    {
      label: t("Finality lag"),
      value: numberOrDash(runtime?.finalizationLag ?? null),
      detail: t("Current block height minus finalized height."),
    },
    {
      label: t("Commit time"),
      value: formatMs(runtime?.commitTimeMs ?? null),
      detail: t("Observed transaction commit latency."),
    },
    {
      label: t("Block cadence"),
      value: formatMs(runtime?.effectiveBlockTimeMs ?? null),
      detail: t("Effective block time after current pacing."),
    },
  ];
});

const networkActivityMetrics = computed(() => {
  const explorer = stats.value?.explorer;
  const runtime = stats.value?.runtime;
  return [
    {
      label: t("Accepted tx"),
      value: numberOrDash(explorer?.transactionsAccepted ?? null),
    },
    {
      label: t("Rejected tx"),
      value: numberOrDash(explorer?.transactionsRejected ?? null),
    },
    {
      label: t("Block height"),
      value: numberOrDash(runtime?.currentBlockHeight ?? null),
    },
    {
      label: t("Finalized height"),
      value: numberOrDash(runtime?.finalizedBlockHeight ?? null),
    },
  ];
});

const networkShapeMetrics = computed(() => {
  const explorer = stats.value?.explorer;
  return [
    { label: t("Peers"), value: numberOrDash(explorer?.peers ?? null) },
    { label: t("Accounts"), value: numberOrDash(explorer?.accounts ?? null) },
    { label: t("Citizens"), value: citizenCountLabel.value },
    { label: t("Assets"), value: numberOrDash(explorer?.assets ?? null) },
    { label: t("Domains"), value: numberOrDash(explorer?.domains ?? null) },
  ];
});

const validatorPostureMetrics = computed(() => {
  const governance = stats.value?.governance;
  const runtime = stats.value?.runtime;
  return [
    { label: t("Lanes"), value: numberOrDash(governance?.laneCount ?? null) },
    {
      label: t("Dataspaces"),
      value: numberOrDash(governance?.dataspaceCount ?? null),
    },
    {
      label: t("Validators"),
      value: numberOrDash(governance?.validatorCount ?? null),
    },
    {
      label: t("Highest QC"),
      value: numberOrDash(runtime?.highestQcHeight ?? null),
    },
  ];
});

const velocityMetrics = computed(() =>
  (stats.value?.econometrics?.velocityWindows ?? []).map((window) => ({
    label: window.key.toUpperCase(),
    value: formatCompactAmount(window.amount),
    detail: t(
      "{transfers} transfers · {senders} senders · {receivers} receivers",
      {
        transfers: numberOrDash(window.transfers),
        senders: numberOrDash(window.uniqueSenders),
        receivers: numberOrDash(window.uniqueReceivers),
      },
    ),
  })),
);

const issuanceMetrics = computed(() =>
  (stats.value?.econometrics?.issuanceWindows ?? []).map((window) => ({
    label: window.key.toUpperCase(),
    value: formatCompactAmount(window.net),
    detail: t("Minted {minted} · burned {burned}", {
      minted: formatCompactAmount(window.minted),
      burned: formatCompactAmount(window.burned),
    }),
  })),
);

const issuanceSeriesBars = computed(() => {
  const points = stats.value?.econometrics?.issuanceSeries ?? [];
  return buildDivergingSeriesBars(points).map((bar) => ({
    ...bar,
    title: `${d(bar.bucketStartMs, { dateStyle: "medium" })} · ${bar.netValue}`,
  }));
});

const issuanceSeriesLabel = computed(() =>
  t("Daily net issuance chart for the visible econometrics window."),
);

const lorenzCurve = computed(() =>
  buildLorenzCurve(stats.value?.supply?.distribution.lorenz ?? []),
);

const lorenzCurveLabel = computed(() =>
  t("Lorenz curve for observed XOR holder distribution."),
);

const distributionMetrics = computed(() => {
  const distribution = stats.value?.supply?.distribution;
  return [
    {
      label: t("Gini"),
      value: numberOrDash(distribution?.gini ?? null, 2),
      detail: t("0 is even, 1 is extremely concentrated."),
    },
    {
      label: t("HHI"),
      value: numberOrDash(distribution?.hhi ?? null, 3),
      detail: t("Higher values mean more supply concentration."),
    },
    {
      label: t("Nakamoto 51"),
      value: numberOrDash(distribution?.nakamoto51 ?? null),
      detail: t("Minimum holders needed to control 51% of supply."),
    },
    {
      label: t("Top 1 share"),
      value: formatPercent(distribution?.top1 ?? null),
      detail: t("Share held by the single largest account."),
    },
    {
      label: t("Median holder"),
      value: formatCompactAmount(distribution?.median ?? null),
      detail: t("Midpoint holder balance across the distribution."),
    },
    {
      label: t("P99 holder"),
      value: formatCompactAmount(distribution?.p99 ?? null),
      detail: t("Balance threshold for the top 1% of holders."),
    },
  ];
});

const topHolderRows = computed(() => {
  const topHolders = stats.value?.supply?.topHolders ?? [];
  const totalSupply = Number(stats.value?.supply?.totalSupply ?? 0);
  return topHolders.slice(0, 6).map((holder, index) => {
    const holderBalance = Number(holder.balance);
    const share =
      Number.isFinite(holderBalance) &&
      Number.isFinite(totalSupply) &&
      totalSupply > 0
        ? formatPercent(holderBalance / totalSupply)
        : t("—");
    return {
      rank: `0${index + 1}`.slice(-2),
      accountId: holder.accountId,
      accountLabel: shortenAccountId(holder.accountId),
      balance: formatCompactAmount(holder.balance),
      share,
    };
  });
});

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  if (!toriiUrl) {
    stats.value = null;
    governanceCitizenCount.value = null;
    loadError.value = t("Set up network and wallet first.");
    loading.value = false;
    return;
  }

  const generation = requestGeneration.value + 1;
  requestGeneration.value = generation;
  loading.value = true;
  loadError.value = "";

  try {
    const [statsResult, citizenCountResult] = await Promise.allSettled([
      getNetworkStats({
        toriiUrl,
        assetDefinitionId: assetDefinitionId.value,
      }),
      getGovernanceCitizenCount(toriiUrl),
    ] as const);
    if (
      generation !== requestGeneration.value ||
      toriiUrl !== session.connection.toriiUrl
    ) {
      return;
    }
    governanceCitizenCount.value =
      citizenCountResult.status === "fulfilled"
        ? citizenCountResult.value
        : null;
    if (citizenCountResult.status === "rejected") {
      console.warn(
        "Failed to refresh governance citizen count",
        citizenCountResult.reason,
      );
    }
    if (statsResult.status === "rejected") {
      throw statsResult.reason;
    }
    stats.value = statsResult.value;
  } catch (error) {
    if (generation !== requestGeneration.value) {
      return;
    }
    stats.value = null;
    governanceCitizenCount.value = null;
    loadError.value = toUserFacingErrorMessage(
      error,
      t("Unable to load network stats."),
    );
  } finally {
    if (generation === requestGeneration.value) {
      loading.value = false;
    }
  }
};

watch(
  () => session.connection.toriiUrl,
  () => {
    refresh();
  },
  { immediate: true },
);
</script>

<style scoped>
.stats-shell {
  display: grid;
  gap: var(--space-4);
  max-width: 1180px;
  margin-inline: auto;
}

.stats-summary {
  display: grid;
  grid-template-columns: minmax(240px, 0.72fr) minmax(0, 1.28fr);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.stats-supply,
.stats-overview {
  min-width: 0;
  padding: var(--space-5);
}

.stats-supply {
  border-inline-end: 1px solid var(--color-border);
  background: var(--frost-panel-raised);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.stats-supply h2,
.stats-supply p,
.stats-overview > p {
  margin: 0;
}

.stats-supply h2 {
  margin-top: var(--space-1);
  font-size: 1.1rem;
}

.stats-supply .helper {
  margin-top: var(--space-3);
}

.stats-supply-line {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.stats-supply-line strong {
  color: var(--color-text-strong);
  font-size: clamp(2.5rem, 6vw, 4.8rem);
  line-height: 0.92;
  letter-spacing: -0.06em;
}

.stats-supply-line span {
  color: var(--color-accent);
  font-size: 0.82rem;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.stats-overview {
  display: grid;
  align-content: center;
  gap: var(--space-3);
}

.stats-disclosures {
  display: grid;
  gap: var(--space-3);
}

.stats-detail-section {
  display: grid;
  gap: var(--space-5);
}

.stats-detail-heading,
.stats-subsection-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.stats-detail-heading h2,
.stats-detail-heading p,
.stats-subsection-heading h3 {
  margin: 0;
}

.stats-detail-heading h2 {
  margin-top: var(--space-1);
  font-size: 1.2rem;
}

.stats-context-grid,
.stats-flow-grid,
.stats-distribution-grid {
  display: grid;
  gap: var(--space-5);
}

.stats-context-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.stats-flow-grid,
.stats-distribution-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.stats-context-grid > section,
.stats-flow-grid > section,
.stats-distribution-grid > section {
  min-width: 0;
}

.stats-context-grid h3,
.stats-flow-grid h3,
.stats-distribution-grid h3 {
  margin: 0 0 var(--space-3);
  color: var(--color-text-strong);
  font-size: 0.9rem;
}

.stats-series,
.stats-lorenz {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.stats-series-chart {
  position: relative;
  min-height: 132px;
  padding: var(--space-3);
  display: grid;
  grid-template-columns: repeat(18, minmax(0, 1fr));
  align-items: stretch;
  gap: var(--space-2);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
}

.stats-series-zero {
  position: absolute;
  inset-inline: var(--space-3);
  top: 50%;
  height: 1px;
  background: var(--color-border-strong);
}

.stats-series-day {
  position: relative;
  min-width: 0;
  display: grid;
  grid-template-rows: 1fr 1fr;
}

.stats-series-bar {
  width: 100%;
  min-height: 0;
  border-radius: var(--radius-round);
}

.stats-series-bar.mint {
  align-self: end;
  background: var(--color-success);
}

.stats-series-bar.burn {
  align-self: start;
  background: var(--color-danger);
}

.stats-series-day.flat::after {
  content: "";
  position: absolute;
  inset-inline: var(--space-1);
  top: 50%;
  height: 2px;
  background: var(--color-text-muted);
}

.stats-lorenz {
  margin-top: var(--space-4);
}

.stats-subsection-heading span {
  color: var(--color-text-muted);
  font-weight: 700;
}

.stats-lorenz-chart {
  width: 100%;
  min-height: 190px;
  overflow: visible;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
}

.stats-lorenz-equality,
.stats-lorenz-line {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.stats-lorenz-equality {
  stroke: var(--color-border-strong);
  stroke-dasharray: 4 4;
  stroke-width: 1;
}

.stats-lorenz-line {
  stroke: var(--color-accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
}

.stats-lorenz-legend {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-size: 0.72rem;
}

.stats-holder-list {
  margin: 0;
  padding: 0;
  display: grid;
  list-style: none;
  border-top: 1px solid var(--color-border);
}

.stats-holder-list li {
  min-width: 0;
  padding: var(--space-3) 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.stats-holder-rank {
  color: var(--color-accent);
  font-size: 0.72rem;
  font-weight: 750;
}

.stats-holder-account,
.stats-holder-list .helper {
  margin: 0;
}

.stats-holder-account {
  overflow-wrap: anywhere;
}

.stats-holder-list strong {
  color: var(--color-text-strong);
}

@media (max-width: 980px) {
  .stats-summary,
  .stats-context-grid,
  .stats-distribution-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .stats-supply {
    border-inline-end: 0;
    border-bottom: 1px solid var(--color-border);
  }
}

@media (max-width: 720px) {
  .stats-flow-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .stats-detail-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .stats-series-chart {
    gap: var(--space-1);
  }
}

@media (max-width: 440px) {
  .stats-supply,
  .stats-overview {
    padding: var(--space-4);
  }

  .stats-holder-list li {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .stats-holder-list li > strong {
    grid-column: 2;
  }
}
</style>
