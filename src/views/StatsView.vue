<template>
  <div class="stats-hud">
    <section class="stats-hero">
      <div class="stats-hero-copy">
        <p class="stats-kicker">{{ t("Stats HUD") }}</p>
        <div class="stats-headline-row">
          <div>
            <h2>{{ t("XOR supply") }}</h2>
            <p class="stats-subhead">
              {{
                t(
                  "Live supply, holder concentration, and consensus telemetry for the TAIRA public lane.",
                )
              }}
            </p>
          </div>
          <div class="stats-actions">
            <button class="secondary" :disabled="loading" @click="refresh">
              {{ loading ? t("Refreshing…") : t("Refresh") }}
            </button>
            <a
              class="secondary stats-link"
              :href="TAIRA_EXPLORER_URL"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ t("Open Taira Explorer") }}
            </a>
          </div>
        </div>
        <div class="stats-supply-line">
          <span class="stats-supply-value">{{ totalSupplyLabel }}</span>
          <span class="stats-supply-unit">{{ assetSymbol }}</span>
        </div>
        <div class="stats-chip-row">
          <span class="stats-chip" :class="telemetryChipClass">
            {{ telemetryLabel }}
          </span>
          <span class="stats-chip">{{ definitionLabel }}</span>
          <span class="stats-chip">
            {{ t("As of {time}", { time: collectedAtLabel }) }}
          </span>
        </div>
      </div>
      <div class="stats-orbit" aria-hidden="true">
        <div class="stats-orbit-core"></div>
        <div class="stats-orbit-ring stats-orbit-ring-a"></div>
        <div class="stats-orbit-ring stats-orbit-ring-b"></div>
        <div class="stats-orbit-ring stats-orbit-ring-c"></div>
      </div>
    </section>

    <section v-if="statusMessage" class="stats-banner">
      <span class="stats-banner-label">{{ t("Signal") }}</span>
      <span>{{ statusMessage }}</span>
    </section>

    <p v-if="loadError" class="message error">{{ loadError }}</p>

    <section class="stats-nav-shell">
      <header class="stats-nav-header">
        <p class="stats-kicker">{{ t("Quick find") }}</p>
      </header>
      <div class="stats-nav">
        <a
          v-for="section in statsSections"
          :key="section.href"
          class="stats-nav-card"
          :href="section.href"
        >
          <div>
            <span class="stats-nav-label">{{ section.label }}</span>
            <p class="stats-nav-helper">{{ section.helper }}</p>
          </div>
          <span class="stats-nav-value">{{ section.value }}</span>
        </a>
      </div>
    </section>

    <section id="overview" class="hud-panel hud-section">
      <header class="hud-panel-header">
        <div>
          <p class="hud-panel-kicker">{{ t("Overview") }}</p>
          <h3>{{ t("At a glance") }}</h3>
        </div>
        <span class="hud-panel-meta">{{ t("Fast path") }}</span>
      </header>

      <div class="overview-grid">
        <article
          v-for="card in overviewCards"
          :key="card.label"
          class="overview-card"
          :class="card.tone"
        >
          <span class="overview-label">{{ card.label }}</span>
          <span class="overview-value">{{ card.value }}</span>
        </article>
      </div>
    </section>

    <section id="health" class="hud-panel hud-section">
      <header class="hud-panel-header">
        <div>
          <p class="hud-panel-kicker">{{ t("Consensus") }}</p>
          <h3>{{ t("Runtime pressure") }}</h3>
        </div>
        <span class="hud-panel-meta">{{ t("Live Torii status") }}</span>
      </header>

      <div class="section-split">
        <div class="section-column">
          <div class="section-heading">
            <p class="section-label">{{ t("Pressure gauges") }}</p>
          </div>
          <div class="instrument-grid">
            <article v-for="card in runtimeCards" :key="card.label" class="instrument">
              <div class="instrument-topline">
                <span class="instrument-label">{{ card.label }}</span>
                <span class="instrument-value">{{ card.value }}</span>
              </div>
              <div class="instrument-meter">
                <span
                  class="instrument-meter-fill"
                  :class="card.tone"
                  :style="{ width: `${card.fill}%` }"
                ></span>
              </div>
              <p class="instrument-helper">{{ card.helper }}</p>
            </article>
          </div>
        </div>

        <div class="section-column cluster-stack">
          <article class="signal-cluster">
            <header class="cluster-header">
              <p class="section-label">{{ t("Activity totals") }}</p>
            </header>
            <div class="signal-grid cluster-grid">
              <article
                v-for="card in networkActivityCards"
                :key="card.label"
                class="signal-card"
              >
                <span class="signal-label">{{ card.label }}</span>
                <span class="signal-value">{{ card.value }}</span>
              </article>
            </div>
          </article>

          <article class="signal-cluster">
            <header class="cluster-header">
              <p class="section-label">{{ t("Network shape") }}</p>
            </header>
            <div class="signal-grid cluster-grid">
              <article v-for="card in networkShapeCards" :key="card.label" class="signal-card">
                <span class="signal-label">{{ card.label }}</span>
                <span class="signal-value">{{ card.value }}</span>
              </article>
            </div>
          </article>

          <article class="signal-cluster">
            <header class="cluster-header">
              <p class="section-label">{{ t("Validator posture") }}</p>
            </header>
            <div class="signal-grid cluster-grid">
              <article
                v-for="card in validatorPostureCards"
                :key="card.label"
                class="signal-card"
              >
                <span class="signal-label">{{ card.label }}</span>
                <span class="signal-value">{{ card.value }}</span>
              </article>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section id="activity" class="hud-panel hud-section">
      <header class="hud-panel-header">
        <div>
          <p class="hud-panel-kicker">{{ t("Flow") }}</p>
          <h3>{{ t("Velocity and issuance") }}</h3>
        </div>
        <span class="hud-panel-meta">{{ t("1h / 24h / 7d windows") }}</span>
      </header>

      <div class="section-split">
        <div class="section-column">
          <div class="section-heading">
            <p class="section-label">{{ t("Velocity") }}</p>
          </div>
          <div class="window-grid triple">
            <article
              v-for="window in velocityCards"
              :key="`velocity-${window.key}`"
              class="window-card"
            >
              <span class="window-tag">{{ t("Velocity") }}</span>
              <div class="window-header">
                <h4>{{ window.key }}</h4>
                <span class="window-value">{{ window.amount }}</span>
              </div>
              <p class="window-sub">
                {{
                  t("{transfers} transfers · {senders} senders · {receivers} receivers", {
                    transfers: window.transfers,
                    senders: window.senders,
                    receivers: window.receivers,
                  })
                }}
              </p>
            </article>
          </div>
        </div>

        <div class="section-column">
          <div class="section-heading">
            <p class="section-label">{{ t("Issuance") }}</p>
          </div>
          <div class="window-grid triple">
            <article
              v-for="window in issuanceCards"
              :key="`issuance-${window.key}`"
              class="window-card issuance"
            >
              <span class="window-tag">{{ t("Issuance") }}</span>
              <div class="window-header">
                <h4>{{ window.key }}</h4>
                <span class="window-value">{{ window.net }}</span>
              </div>
              <p class="window-sub">
                {{
                  t("Minted {minted} · burned {burned}", {
                    minted: window.minted,
                    burned: window.burned,
                  })
                }}
              </p>
            </article>
          </div>

          <div class="series-panel">
            <div class="series-copy">
              <p class="series-label">{{ t("30 day issuance pulse") }}</p>
              <p class="series-helper">
                {{
                  t(
                    "Bars show the absolute net issuance per day so supply shocks are visible at a glance.",
                  )
                }}
              </p>
            </div>
            <div class="series-strip" aria-hidden="true">
              <span
                v-for="bar in issuanceSeriesBars"
                :key="bar.key"
                class="series-bar"
                :class="bar.tone"
                :style="{ height: `${bar.height}%` }"
                :title="bar.title"
              ></span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="distribution" class="hud-panel hud-section">
      <header class="hud-panel-header">
        <div>
          <p class="hud-panel-kicker">{{ t("Distribution") }}</p>
          <h3>{{ t("Whale map") }}</h3>
        </div>
        <span class="hud-panel-meta">{{ definitionLabel }}</span>
      </header>

      <div class="section-split">
        <div class="section-column">
          <div class="section-heading">
            <p class="section-label">{{ t("Concentration") }}</p>
          </div>
          <div class="distribution-grid">
            <article
              v-for="metric in distributionCards"
              :key="metric.label"
              class="distribution-card"
            >
              <span class="signal-label">{{ metric.label }}</span>
              <span class="signal-value">{{ metric.value }}</span>
              <p class="instrument-helper">{{ metric.helper }}</p>
            </article>
          </div>
        </div>

        <div class="section-column">
          <div class="section-heading">
            <p class="section-label">{{ t("Top holders") }}</p>
          </div>
          <div class="holder-list">
            <article
              v-for="holder in topHolderCards"
              :key="holder.accountId"
              class="holder-row"
            >
              <div class="holder-main">
                <span class="holder-rank">{{ holder.rank }}</span>
                <div>
                  <p class="holder-account mono">{{ holder.accountLabel }}</p>
                  <p class="holder-balance">
                    {{ holder.balance }} {{ assetSymbol }}
                  </p>
                </div>
              </div>
              <div class="holder-meter-wrap">
                <span class="holder-share">{{ holder.share }}</span>
                <div class="holder-meter">
                  <span
                    class="holder-meter-fill"
                    :style="{ width: `${holder.fill}%` }"
                  ></span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  TAIRA_EXPLORER_URL,
  TAIRA_XOR_ASSET_DEFINITION_ID,
} from "@/constants/chains";
import { getNetworkStats } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { deriveAssetSymbol, formatAssetDefinitionLabel } from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";

const session = useSessionStore();
const { d, n, t } = useAppI18n();

const stats = ref<Awaited<ReturnType<typeof getNetworkStats>> | null>(null);
const loading = ref(false);
const loadError = ref("");
const requestGeneration = ref(0);

const assetDefinitionId = computed(() => TAIRA_XOR_ASSET_DEFINITION_ID);
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
  if (
    queueSize === null ||
    queueSize === undefined ||
    queueCapacity === null ||
    queueCapacity === undefined ||
    queueCapacity <= 0
  ) {
    return null;
  }
  return Math.max(0, Math.min(100, (queueSize / queueCapacity) * 100));
});

const totalSupplyLabel = computed(() =>
  formatCompactAmount(stats.value?.supply?.totalSupply),
);
const holdersCountLabel = computed(() =>
  numberOrDash(stats.value?.supply?.holdersTotal ?? null),
);
const top10ShareLabel = computed(() =>
  formatPercent(stats.value?.supply?.distribution.top10 ?? null),
);
const queueFillLabel = computed(() =>
  queueFillPercent.value === null ? t("—") : formatPercent(queueFillPercent.value / 100),
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

const telemetryChipClass = computed(() => {
  if (stats.value?.partial) return "warning";
  if (stats.value) return "positive";
  return "muted";
});

const statusMessage = computed(() => {
  if (stats.value?.warnings.length) {
    return stats.value.warnings.join(" ");
  }
  if (stats.value) {
    return t(
      "TAIRA is publishing live explorer, supply, and consensus data for the XOR lane.",
    );
  }
  if (loading.value) {
    return t("Querying TAIRA explorer and status surfaces.");
  }
  return "";
});

const statsSections = computed(() => {
  const velocity24h = stats.value?.econometrics?.velocityWindows.find(
    (window) => window.key === "24h",
  );
  const supplySummaryValue =
    stats.value?.supply?.totalSupply == null
      ? t("—")
      : `${totalSupplyLabel.value} ${assetSymbol.value}`;
  return [
    {
      href: "#overview",
      label: t("Overview"),
      helper: t("At a glance"),
      value: supplySummaryValue,
    },
    {
      href: "#health",
      label: t("Consensus"),
      helper: t("Runtime pressure"),
      value: queueFillLabel.value,
    },
    {
      href: "#activity",
      label: t("Flow"),
      helper: t("Velocity and issuance"),
      value: velocity24h ? formatCompactAmount(velocity24h.amount) : t("—"),
    },
    {
      href: "#distribution",
      label: t("Distribution"),
      helper: t("Whale map"),
      value: top10ShareLabel.value,
    },
  ];
});

const overviewCards = computed(() => {
  const runtime = stats.value?.runtime;
  const queueFill = queueFillPercent.value ?? 0;
  const finalityLag = runtime?.finalizationLag ?? 0;
  const supplySummaryValue =
    stats.value?.supply?.totalSupply == null
      ? t("—")
      : `${totalSupplyLabel.value} ${assetSymbol.value}`;
  return [
    {
      label: t("XOR supply"),
      value: supplySummaryValue,
      tone: "accent",
    },
    {
      label: t("Holders"),
      value: holdersCountLabel.value,
      tone: "neutral",
    },
    {
      label: t("Top 10 share"),
      value: top10ShareLabel.value,
      tone: "neutral",
    },
    {
      label: t("Queue fill"),
      value: queueFillLabel.value,
      tone:
        runtime?.txQueueSaturated || queueFill >= 75
          ? "danger"
          : queueFill >= 40
            ? "warning"
            : "positive",
    },
    {
      label: t("Commit time"),
      value: formatMs(runtime?.commitTimeMs),
      tone:
        (runtime?.commitTimeMs ?? 0) >= 3500
          ? "danger"
          : (runtime?.commitTimeMs ?? 0) >= 1800
            ? "warning"
            : "positive",
    },
    {
      label: t("Finality lag"),
      value: numberOrDash(finalityLag),
      tone:
        finalityLag >= 6 ? "danger" : finalityLag >= 2 ? "warning" : "positive",
    },
  ];
});

const runtimeCards = computed(() => {
  const runtime = stats.value?.runtime;
  const queueFill = queueFillPercent.value;
  const finalityLag = runtime?.finalizationLag ?? null;
  return [
    {
      label: t("Queue fill"),
      value: queueFill === null ? t("—") : formatPercent(queueFill / 100),
      helper:
        runtime?.txQueueSaturated == null
          ? t("Queue saturation signal unavailable.")
          : runtime.txQueueSaturated
            ? t("Ingress is at the saturation threshold.")
            : t("Ingress is below saturation."),
      fill: queueFill ?? 0,
      tone:
        runtime?.txQueueSaturated || (queueFill ?? 0) >= 75
          ? "danger"
          : (queueFill ?? 0) >= 40
            ? "warning"
            : "positive",
    },
    {
      label: t("Finality lag"),
      value: numberOrDash(finalityLag),
      helper: t("Current block height minus finalized height."),
      fill: Math.max(0, Math.min(100, ((finalityLag ?? 0) / 12) * 100)),
      tone:
        (finalityLag ?? 0) >= 6
          ? "danger"
          : (finalityLag ?? 0) >= 2
            ? "warning"
            : "positive",
    },
    {
      label: t("Commit time"),
      value: formatMs(runtime?.commitTimeMs),
      helper: t("Observed transaction commit latency."),
      fill: Math.max(
        0,
        Math.min(100, (((runtime?.commitTimeMs ?? 0) as number) / 6000) * 100),
      ),
      tone:
        (runtime?.commitTimeMs ?? 0) >= 3500
          ? "danger"
          : (runtime?.commitTimeMs ?? 0) >= 1800
            ? "warning"
            : "positive",
    },
    {
      label: t("Block cadence"),
      value: formatMs(runtime?.effectiveBlockTimeMs),
      helper: t("Effective block time after current pacing."),
      fill: Math.max(
        0,
        Math.min(
          100,
          (((runtime?.effectiveBlockTimeMs ?? 0) as number) / 6000) * 100,
        ),
      ),
      tone:
        (runtime?.effectiveBlockTimeMs ?? 0) >= 4000
          ? "warning"
          : "positive",
    },
  ];
});

const networkActivityCards = computed(() => {
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

const networkShapeCards = computed(() => {
  const explorer = stats.value?.explorer;
  return [
    { label: t("Peers"), value: numberOrDash(explorer?.peers ?? null) },
    { label: t("Accounts"), value: numberOrDash(explorer?.accounts ?? null) },
    { label: t("Assets"), value: numberOrDash(explorer?.assets ?? null) },
    { label: t("Domains"), value: numberOrDash(explorer?.domains ?? null) },
  ];
});

const validatorPostureCards = computed(() => {
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

const velocityCards = computed(() =>
  (stats.value?.econometrics?.velocityWindows ?? []).map((window) => ({
    key: window.key.toUpperCase(),
    amount: formatCompactAmount(window.amount),
    transfers: numberOrDash(window.transfers),
    senders: numberOrDash(window.uniqueSenders),
    receivers: numberOrDash(window.uniqueReceivers),
  })),
);

const issuanceCards = computed(() =>
  (stats.value?.econometrics?.issuanceWindows ?? []).map((window) => ({
    key: window.key.toUpperCase(),
    net: formatCompactAmount(window.net),
    minted: formatCompactAmount(window.minted),
    burned: formatCompactAmount(window.burned),
  })),
);

const issuanceSeriesBars = computed(() => {
  const points = stats.value?.econometrics?.issuanceSeries ?? [];
  const trailing = points.slice(-18);
  const maxAbs = trailing.reduce((acc, point) => {
    const magnitude = Math.abs(Number(point.net));
    return Number.isFinite(magnitude) ? Math.max(acc, magnitude) : acc;
  }, 0);
  return trailing.map((point, index) => {
    const netValue = Number(point.net);
    const magnitude = Number.isFinite(netValue) ? Math.abs(netValue) : 0;
    const height = maxAbs > 0 ? Math.max(10, (magnitude / maxAbs) * 100) : 10;
    return {
      key: `${point.bucketStartMs}-${index}`,
      height,
      tone: netValue < 0 ? "burn" : netValue > 0 ? "mint" : "flat",
      title: `${d(point.bucketStartMs, { dateStyle: "medium" })} · ${point.net}`,
    };
  });
});

const distributionCards = computed(() => {
  const distribution = stats.value?.supply?.distribution;
  return [
    {
      label: t("Gini"),
      value: numberOrDash(distribution?.gini ?? null, 2),
      helper: t("0 is even, 1 is extremely concentrated."),
    },
    {
      label: t("HHI"),
      value: numberOrDash(distribution?.hhi ?? null, 3),
      helper: t("Higher values mean more supply concentration."),
    },
    {
      label: t("Nakamoto 51"),
      value: numberOrDash(distribution?.nakamoto51 ?? null),
      helper: t("Minimum holders needed to control 51% of supply."),
    },
    {
      label: t("Top 1 share"),
      value: formatPercent(distribution?.top1 ?? null),
      helper: t("Share held by the single largest account."),
    },
    {
      label: t("Median holder"),
      value: formatCompactAmount(distribution?.median ?? null),
      helper: t("Midpoint holder balance across the distribution."),
    },
    {
      label: t("P99 holder"),
      value: formatCompactAmount(distribution?.p99 ?? null),
      helper: t("Balance threshold for the top 1% of holders."),
    },
  ];
});

const topHolderCards = computed(() => {
  const topHolders = stats.value?.supply?.topHolders ?? [];
  const topBalance = Number(topHolders[0]?.balance ?? 0);
  const totalSupply = Number(stats.value?.supply?.totalSupply ?? 0);
  return topHolders.slice(0, 6).map((holder, index) => {
    const holderBalance = Number(holder.balance);
    const fill =
      Number.isFinite(holderBalance) && Number.isFinite(topBalance) && topBalance > 0
        ? Math.max(8, (holderBalance / topBalance) * 100)
        : 8;
    const share =
      Number.isFinite(holderBalance) && Number.isFinite(totalSupply) && totalSupply > 0
        ? formatPercent(holderBalance / totalSupply)
        : t("—");
    return {
      rank: `0${index + 1}`.slice(-2),
      accountId: holder.accountId,
      accountLabel: shortenAccountId(holder.accountId),
      balance: formatCompactAmount(holder.balance),
      share,
      fill,
    };
  });
});

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  if (!toriiUrl) {
    stats.value = null;
    loadError.value = t("Set up network and wallet first.");
    loading.value = false;
    return;
  }

  const generation = requestGeneration.value + 1;
  requestGeneration.value = generation;
  loading.value = true;
  loadError.value = "";

  try {
    const nextStats = await getNetworkStats({
      toriiUrl,
      assetDefinitionId: assetDefinitionId.value,
    });
    if (
      generation !== requestGeneration.value ||
      toriiUrl !== session.connection.toriiUrl
    ) {
      return;
    }
    stats.value = nextStats;
  } catch (error) {
    if (generation !== requestGeneration.value) {
      return;
    }
    stats.value = null;
    loadError.value = toUserFacingErrorMessage(
      error,
      t("Unable to load TAIRA stats."),
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
.stats-hud {
  display: grid;
  gap: 18px;
}

.stats-hero,
.hud-panel,
.stats-banner,
.stats-nav-shell {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.08), transparent 52%),
    linear-gradient(180deg, rgba(7, 12, 24, 0.92), rgba(8, 10, 18, 0.8));
  border-radius: 28px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 24px 60px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(18px);
}

:root[data-theme="light"] .stats-hero,
:root[data-theme="light"] .hud-panel,
:root[data-theme="light"] .stats-banner,
:root[data-theme="light"] .stats-nav-shell {
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.4)),
    linear-gradient(180deg, rgba(241, 246, 255, 0.94), rgba(230, 238, 253, 0.82));
  border-color: rgba(12, 20, 36, 0.08);
}

.stats-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(260px, 0.7fr);
  gap: 18px;
  padding: 28px;
}

.stats-hero::before,
.hud-panel::before,
.stats-nav-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0, rgba(255, 255, 255, 0.04) 48%, transparent 100%),
    repeating-linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.015) 0,
      rgba(255, 255, 255, 0.015) 1px,
      transparent 1px,
      transparent 20px
    );
  mix-blend-mode: screen;
  opacity: 0.65;
}

.stats-kicker,
.hud-panel-kicker,
.series-label {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.72rem;
  color: rgba(255, 190, 136, 0.8);
}

.stats-headline-row,
.hud-panel-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}

.stats-headline-row h2,
.hud-panel-header h3 {
  margin: 0;
  font-size: clamp(1.4rem, 2vw, 2rem);
}

.stats-subhead,
.instrument-helper,
.series-helper,
.window-sub,
.hud-panel-meta,
.stats-banner,
.holder-balance {
  color: var(--iroha-muted);
}

.stats-subhead {
  margin: 8px 0 0;
  max-width: 56ch;
}

.stats-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.stats-link {
  text-decoration: none;
}

.stats-nav-shell {
  padding: 18px 20px 20px;
}

.stats-nav-header {
  margin-bottom: 14px;
}

.stats-nav {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stats-nav-card {
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 20px;
  text-decoration: none;
  color: inherit;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
    rgba(4, 9, 18, 0.62);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

:root[data-theme="light"] .stats-nav-card {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 247, 255, 0.74)),
    rgba(255, 255, 255, 0.8);
  border-color: rgba(12, 20, 36, 0.08);
}

.stats-nav-card:hover,
.stats-nav-card:focus-visible {
  transform: translateY(-2px);
  border-color: rgba(110, 221, 255, 0.3);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
}

.stats-nav-label,
.section-label,
.overview-label {
  display: block;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--iroha-muted);
}

.stats-nav-helper {
  margin: 6px 0 0;
  color: var(--iroha-muted);
}

.stats-nav-value {
  font-size: 1.2rem;
  font-weight: 600;
}

.stats-supply-line {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 28px;
  flex-wrap: wrap;
}

.stats-supply-value {
  font-size: clamp(2.6rem, 6vw, 5rem);
  line-height: 0.92;
  font-weight: 700;
  letter-spacing: -0.06em;
  text-shadow: 0 0 35px rgba(110, 221, 255, 0.22);
}

.stats-supply-unit {
  font-size: 1rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(110, 221, 255, 0.78);
}

.stats-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}

.stats-chip {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  font-size: 0.88rem;
  backdrop-filter: blur(10px);
}

.stats-chip.positive {
  border-color: rgba(95, 230, 169, 0.34);
  color: #8ef6c8;
}

.stats-chip.warning {
  border-color: rgba(255, 193, 118, 0.34);
  color: #ffd58e;
}

.stats-chip.muted {
  color: var(--iroha-muted);
}

.stats-orbit {
  position: relative;
  min-height: 240px;
  display: grid;
  place-items: center;
}

.stats-orbit-core {
  width: 116px;
  height: 116px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.95), transparent 32%),
    radial-gradient(circle at 50% 50%, rgba(53, 196, 255, 0.45), rgba(14, 18, 28, 0.1) 72%);
  box-shadow:
    0 0 0 14px rgba(95, 230, 169, 0.06),
    0 0 70px rgba(53, 196, 255, 0.24);
}

.stats-orbit-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(110, 221, 255, 0.22);
}

.stats-orbit-ring-a {
  width: 180px;
  height: 180px;
  animation: spin-slow 22s linear infinite;
}

.stats-orbit-ring-b {
  width: 240px;
  height: 240px;
  border-style: dashed;
  animation: spin-reverse 32s linear infinite;
}

.stats-orbit-ring-c {
  width: 300px;
  height: 300px;
  border-color: rgba(255, 142, 170, 0.18);
  animation: pulse 5s ease-in-out infinite;
}

.stats-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
}

.stats-banner-label {
  display: inline-flex;
  min-width: 76px;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(110, 221, 255, 0.12);
  color: rgba(110, 221, 255, 0.88);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.72rem;
}

.hud-panel {
  padding: 22px;
  min-height: 100%;
}

.hud-section {
  scroll-margin-top: 84px;
}

.hud-panel-meta {
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
}

.overview-grid,
.instrument-grid,
.window-grid,
.distribution-grid,
.signal-grid {
  display: grid;
  gap: 12px;
}

.overview-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.instrument-grid,
.signal-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.window-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.window-grid.triple {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.distribution-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.section-split {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 18px;
}

.section-column,
.cluster-stack {
  display: grid;
  gap: 14px;
  align-content: start;
}

.section-heading,
.cluster-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.instrument,
.overview-card,
.window-card,
.distribution-card,
.signal-card,
.signal-cluster {
  position: relative;
  border-radius: 18px;
  padding: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
    rgba(4, 9, 18, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

:root[data-theme="light"] .instrument,
:root[data-theme="light"] .overview-card,
:root[data-theme="light"] .window-card,
:root[data-theme="light"] .distribution-card,
:root[data-theme="light"] .signal-card,
:root[data-theme="light"] .signal-cluster {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 247, 255, 0.7)),
    rgba(255, 255, 255, 0.8);
  border-color: rgba(12, 20, 36, 0.08);
}

.overview-card {
  display: grid;
  gap: 10px;
  align-content: start;
  min-height: 130px;
}

.overview-card.accent {
  border-color: rgba(110, 221, 255, 0.3);
  box-shadow: inset 0 0 0 1px rgba(110, 221, 255, 0.08);
}

.overview-card.positive {
  border-color: rgba(95, 230, 169, 0.22);
}

.overview-card.warning {
  border-color: rgba(255, 193, 118, 0.24);
}

.overview-card.danger {
  border-color: rgba(255, 122, 138, 0.24);
}

.instrument-topline,
.window-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.instrument-label,
.signal-label,
.window-tag,
.holder-share {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--iroha-muted);
}

.window-tag {
  display: inline-flex;
  margin-bottom: 12px;
}

.overview-value {
  font-size: clamp(1.5rem, 2.4vw, 2.4rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
}

.instrument-value,
.signal-value,
.window-value {
  font-size: 1.28rem;
  font-weight: 600;
}

.instrument-meter,
.holder-meter {
  position: relative;
  overflow: hidden;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  margin: 14px 0 10px;
}

.instrument-meter-fill,
.holder-meter-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #49e9b6, #6eddff);
  box-shadow: 0 0 22px rgba(110, 221, 255, 0.3);
}

.instrument-meter-fill.warning {
  background: linear-gradient(90deg, #ffca6f, #ff8f62);
}

.instrument-meter-fill.danger {
  background: linear-gradient(90deg, #ff7a8a, #ff4c66);
}

.signal-grid,
.distribution-grid {
  margin-top: 14px;
}

.cluster-grid {
  margin-top: 0;
}

.series-panel {
  margin-top: 18px;
  display: grid;
  gap: 14px;
}

.series-strip {
  display: grid;
  grid-template-columns: repeat(18, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
  min-height: 112px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.series-bar {
  display: block;
  width: 100%;
  min-height: 12px;
  border-radius: 999px 999px 3px 3px;
  background: linear-gradient(180deg, #6eddff, rgba(110, 221, 255, 0.32));
}

.series-bar.burn {
  background: linear-gradient(180deg, #ff9d6c, rgba(255, 122, 138, 0.32));
}

.series-bar.flat {
  background: linear-gradient(180deg, #9ba6bf, rgba(155, 166, 191, 0.26));
}

.holder-list {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.holder-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 0.44fr);
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.holder-main {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.holder-rank {
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: rgba(110, 221, 255, 0.12);
  color: rgba(110, 221, 255, 0.9);
  font-weight: 600;
}

.holder-account,
.holder-balance {
  margin: 0;
}

.holder-account {
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}

.holder-meter-wrap {
  display: grid;
  gap: 8px;
}

@keyframes spin-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes spin-reverse {
  from {
    transform: rotate(360deg);
  }
  to {
    transform: rotate(0deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(0.98);
    opacity: 0.72;
  }
  50% {
    transform: scale(1.02);
    opacity: 1;
  }
}

@media (max-width: 1220px) {
  .stats-nav,
  .overview-grid,
  .window-grid.triple,
  .section-split {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .distribution-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .stats-hero,
  .stats-nav,
  .overview-grid,
  .section-split,
  .holder-row {
    grid-template-columns: 1fr;
  }

  .stats-orbit {
    min-height: 200px;
  }

  .instrument-grid,
  .window-grid,
  .distribution-grid,
  .signal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
