<template>
  <div class="soracloud-shell">
    <RouteHeaderAction>
      <AppButton variant="secondary" :disabled="cloud.loading" @click="refresh">
        {{ cloud.loading ? t("Refreshing") : t("Refresh") }}
      </AppButton>
    </RouteHeaderAction>

    <section class="card soracloud-command-card">
      <header class="card-header soracloud-command-header">
        <div>
          <h2>{{ t("Service status") }}</h2>
          <p class="helper">{{ t("Monitor live SoraCloud services") }}</p>
        </div>
        <div class="soracloud-command-actions">
          <span class="pill positive">{{ activeAccountLabel }}</span>
          <span class="pill" :class="availabilityTone">
            {{ availabilityLabel }}
          </span>
        </div>
      </header>

      <div v-if="cloud.availability === 'available'" class="soracloud-kpi-grid">
        <div class="kv">
          <span class="kv-label">{{ t("Live services") }}</span>
          <span class="kv-value">{{ n(serviceCount) }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Healthy") }}</span>
          <span class="kv-value">{{ n(healthyCount) }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Deploying") }}</span>
          <span class="kv-value">{{ n(deployingCount) }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Last refresh") }}</span>
          <span class="kv-value">{{ lastRefreshLabel }}</span>
        </div>
      </div>

      <div
        v-else-if="cloud.availability === 'unavailable'"
        class="soracloud-state"
      >
        <p class="wallet-empty-title">
          {{ t("SoraCloud is not available on this endpoint yet.") }}
        </p>
        <p class="helper">
          {{
            t(
              "Choose a Torii endpoint that exposes /v1/soracloud, then refresh this page.",
            )
          }}
        </p>
        <div class="soracloud-state-actions">
          <button type="button" @click="refresh">{{ t("Refresh") }}</button>
          <RouterLink class="button secondary" to="/settings">
            {{ t("Open Settings") }}
          </RouterLink>
        </div>
      </div>

      <div v-else-if="cloud.availability === 'error'" class="soracloud-state">
        <p class="wallet-empty-title">{{ t("Could not load SoraCloud.") }}</p>
        <p class="helper">{{ cloud.error }}</p>
        <button type="button" @click="refresh">{{ t("Refresh") }}</button>
      </div>

      <div v-else class="soracloud-state">
        <p class="wallet-empty-title">{{ t("Checking SoraCloud...") }}</p>
        <p class="helper mono">{{ session.connection.toriiUrl }}</p>
      </div>
    </section>

    <SegmentedControl
      v-model="consoleMode"
      :label="t('SoraCloud workspace')"
      :options="[
        { value: 'services', label: t('Live services') },
        { value: 'lease', label: t('HF shared lease') },
      ]"
    />

    <section class="soracloud-console">
      <section v-if="consoleMode === 'lease'" class="card soracloud-lease-card">
        <header class="card-header">
          <div>
            <h2>{{ t("Hugging Face shared lease") }}</h2>
            <p class="helper">
              {{
                t(
                  "Inspect the exact shared-lease source, pool, and wallet membership reported by Torii.",
                )
              }}
            </p>
          </div>
          <span class="pill muted">GET /v1/soracloud/hf/lease/status</span>
        </header>

        <form class="soracloud-form" @submit.prevent="refreshSharedLeaseStatus">
          <div class="soracloud-step-panel">
            <label>
              <span>{{ t("Hugging Face repo") }}</span>
              <input
                v-model.trim="leaseForm.repoId"
                type="text"
                autocomplete="off"
                :placeholder="t('owner/model-name')"
              />
            </label>
            <label>
              <span>{{ t("Full commit revision") }}</span>
              <input
                v-model.trim="leaseForm.revision"
                type="text"
                autocomplete="off"
                :placeholder="HF_REVISION_PLACEHOLDER"
              />
            </label>
            <label>
              <span>{{ t("Storage class") }}</span>
              <select v-model="leaseForm.storageClass">
                <option value="warm">{{ t("Warm") }}</option>
                <option value="hot">{{ t("Hot") }}</option>
                <option value="cold">{{ t("Cold") }}</option>
              </select>
            </label>
            <label>
              <span>{{ t("Lease duration") }}</span>
              <select v-model.number="leaseForm.leaseTermHours">
                <option :value="1">{{ t("1 hour") }}</option>
                <option :value="24">{{ t("24 hours") }}</option>
                <option :value="168">{{ t("7 days") }}</option>
              </select>
            </label>
          </div>

          <p v-if="leaseRouteDisabledReason" class="helper error-text">
            {{ leaseRouteDisabledReason }}
          </p>
          <p v-if="cloud.hfSharedLeaseStatusError" class="helper error-text">
            {{ cloud.hfSharedLeaseStatusError }}
          </p>

          <div class="soracloud-form-actions">
            <button
              type="submit"
              :disabled="
                !canCheckSharedLease || cloud.hfSharedLeaseStatusLoading
              "
            >
              {{
                cloud.hfSharedLeaseStatusLoading
                  ? t("Checking")
                  : t("Check shared lease")
              }}
            </button>
          </div>
        </form>

        <div class="soracloud-write-disabled" role="status">
          <p class="wallet-empty-title">
            {{ t("Lease joining is read-only") }}
          </p>
          <p class="helper">
            {{
              t(
                "This release will not post a lease join until the current Iroha SDK exports the exact canonical Norito provenance encoder and signer required by Torii.",
              )
            }}
          </p>
          <button type="button" disabled>
            {{ t("Join shared lease unavailable") }}
          </button>
        </div>

        <div
          v-if="cloud.hfSharedLeaseStatus?.found"
          class="soracloud-review-grid"
          data-testid="hf-shared-lease-status"
        >
          <div class="kv">
            <span class="kv-label">{{ t("Source") }}</span>
            <span class="kv-value mono">
              {{ cloud.hfSharedLeaseStatus.source?.sourceId }}
            </span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Resolved revision") }}</span>
            <span class="kv-value mono">
              {{ cloud.hfSharedLeaseStatus.source?.resolvedRevision }}
            </span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Pool") }}</span>
            <span class="kv-value mono">
              {{ cloud.hfSharedLeaseStatus.pool?.poolId ?? t("No lease pool") }}
            </span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Storage base fee") }}</span>
            <span class="kv-value mono">
              {{ cloud.hfSharedLeaseStatus.storageBaseFee }}
            </span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Membership") }}</span>
            <span class="kv-value">
              {{
                cloud.hfSharedLeaseStatus.member?.status ?? t("Not a member")
              }}
            </span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Service bindings") }}</span>
            <span class="kv-value">
              {{
                cloud.hfSharedLeaseStatus.member?.serviceBindings.join(", ") ||
                t("None")
              }}
            </span>
          </div>
        </div>

        <div
          v-else-if="cloud.hfSharedLeaseStatus"
          class="soracloud-empty"
          data-testid="hf-shared-lease-missing"
        >
          <p class="wallet-empty-title">{{ t("HF source not found") }}</p>
          <p class="helper">{{ cloud.hfSharedLeaseStatus.message }}</p>
        </div>
      </section>

      <section v-else class="card soracloud-list-card">
        <header class="card-header">
          <div>
            <h2>{{ t("Live services") }}</h2>
            <p class="helper">
              {{
                t(
                  "Only records returned by the active Torii endpoint are shown.",
                )
              }}
            </p>
          </div>
        </header>

        <div v-if="sortedServices.length" class="soracloud-service-list">
          <article
            v-for="service in sortedServices"
            :key="service.id"
            class="soracloud-service-row"
          >
            <span
              class="soracloud-status-dot"
              :class="soraCloudStatusTone(service.status)"
              aria-hidden="true"
            ></span>
            <span class="soracloud-row-main">
              <span class="soracloud-row-title">{{ service.name }}</span>
              <span class="soracloud-row-meta">
                {{ service.currentVersion || t("Version pending") }} /
                {{
                  t("{count} revisions", { count: n(service.revisionCount) })
                }}
              </span>
              <a
                v-if="service.publicUrls[0]"
                class="soracloud-service-link"
                :href="service.publicUrls[0]"
                target="_blank"
                rel="noreferrer"
              >
                {{ service.publicUrls[0] }}
              </a>
            </span>
            <span class="soracloud-row-side">
              <span class="pill" :class="soraCloudStatusTone(service.status)">
                {{ t(statusLabel(service.status)) }}
              </span>
              <span v-if="service.rolloutStage" class="helper">
                {{ service.rolloutStage }}
                <template v-if="service.rolloutPercent !== null">
                  / {{ n(service.rolloutPercent) }}%
                </template>
              </span>
              <span v-else-if="service.leaseStatus" class="helper">
                {{ service.leaseStatus }}
              </span>
            </span>
          </article>
        </div>

        <div v-else class="soracloud-empty">
          <p class="wallet-empty-title">
            {{
              cloud.availability === "available"
                ? t("No SoraCloud services found on this endpoint.")
                : t("Live services will appear after SoraCloud is available.")
            }}
          </p>
        </div>
      </section>

      <TechnicalDisclosure
        class="soracloud-inspector-card"
        :summary="t('Diagnostics')"
      >
        <p class="helper mono">{{ session.connection.toriiUrl }}</p>
        <div class="soracloud-inspector-grid">
          <div class="kv">
            <span class="kv-label">{{ t("API") }}</span>
            <span class="kv-value">/v1/soracloud/status</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Status code") }}</span>
            <span class="kv-value">{{ diagnosticStatusCode }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Audit events") }}</span>
            <span class="kv-value">{{ diagnosticAuditEventCount }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Schema") }}</span>
            <span class="kv-value">
              {{ cloud.status?.schemaVersion ?? t("Unavailable") }}
            </span>
          </div>
        </div>
        <TechnicalDisclosure :summary="t('Status payload')">
          <pre>{{ diagnosticsPayload }}</pre>
        </TechnicalDisclosure>
      </TechnicalDisclosure>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { RouterLink } from "vue-router";

import {
  AppButton,
  RouteHeaderAction,
  SegmentedControl,
  TechnicalDisclosure,
} from "@/components/ui";
import { useAppI18n } from "@/composables/useAppI18n";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import { useSoraCloudStore } from "@/stores/soracloud";
import { getAccountDisplayLabel } from "@/utils/accountId";
import {
  buildSoraCloudHfStatusQuery,
  sortSoraCloudServices,
  soraCloudStatusTone,
  type SoraCloudServiceStatus,
  type SoraCloudStorageClass,
} from "@/utils/soracloud";

const { t, n, d } = useAppI18n();
const session = useSessionStore();
const endpointStore = useEndpointStore();
const cloud = useSoraCloudStore();
const consoleMode = ref<"services" | "lease">("services");
const HF_REVISION_PLACEHOLDER = "0123456789abcdef0123456789abcdef01234567";
const leaseForm = reactive({
  repoId: "",
  revision: "",
  storageClass: "warm" as SoraCloudStorageClass,
  leaseTermHours: 24,
});

const statusLabels: Record<SoraCloudServiceStatus, string> = {
  healthy: "Healthy",
  deploying: "Deploying",
  warning: "Needs attention",
  paused: "Paused",
  failed: "Failed",
  unknown: "Unknown",
};

const activeAccount = computed(() => session.activeAccount);
const activeAccountId = computed(() => activeAccount.value?.accountId ?? "");
const activeAccountLabel = computed(
  () =>
    getAccountDisplayLabel(
      activeAccount.value,
      "",
      session.connection.networkPrefix,
    ) || t("Wallet ready"),
);
const sortedServices = computed(() => sortSoraCloudServices(cloud.services));
const serviceCount = computed(() => cloud.status?.serviceCount ?? 0);
const healthyCount = computed(
  () => cloud.services.filter((service) => service.status === "healthy").length,
);
const deployingCount = computed(
  () =>
    cloud.services.filter((service) => service.status === "deploying").length,
);
const availabilityTone = computed(() => {
  if (cloud.availability === "available") return "positive";
  if (cloud.availability === "unavailable") return "warning";
  if (cloud.availability === "error") return "error";
  return "muted";
});
const availabilityLabel = computed(() => {
  if (cloud.loading) return t("Checking");
  if (cloud.availability === "available") return t("Live API ready");
  if (cloud.availability === "unavailable") return t("API unavailable");
  if (cloud.availability === "error") return t("Connection error");
  return t("Checking");
});
const lastRefreshLabel = computed(() =>
  cloud.lastUpdatedAtMs
    ? d(new Date(cloud.lastUpdatedAtMs), {
        hour: "2-digit",
        minute: "2-digit",
      })
    : t("Not refreshed"),
);
const leaseRouteSupported = computed(
  () =>
    endpointStore.inspection?.features.soraCloudHfSharedLease.supported ===
    true,
);
const leaseStatusInput = computed(() => {
  try {
    const leaseTermMs = leaseForm.leaseTermHours * 60 * 60 * 1000;
    buildSoraCloudHfStatusQuery({
      repoId: leaseForm.repoId,
      revision: leaseForm.revision,
      storageClass: leaseForm.storageClass,
      leaseTermMs,
      ...(activeAccountId.value ? { accountId: activeAccountId.value } : {}),
    });
    return {
      toriiUrl: session.connection.toriiUrl,
      repoId: leaseForm.repoId,
      revision: leaseForm.revision,
      storageClass: leaseForm.storageClass,
      leaseTermMs,
      ...(activeAccountId.value ? { accountId: activeAccountId.value } : {}),
    };
  } catch {
    return null;
  }
});
const leaseRouteDisabledReason = computed(() => {
  if (cloud.availability !== "available") {
    return t("Select a SoraCloud-enabled endpoint before checking a lease.");
  }
  if (!leaseRouteSupported.value) {
    return t(
      "This endpoint does not advertise the exact /v1/soracloud/hf/lease contract.",
    );
  }
  if (!leaseStatusInput.value) {
    return t("Enter an exact repo and full 40-character commit revision.");
  }
  return "";
});
const canCheckSharedLease = computed(
  () => !leaseRouteDisabledReason.value && leaseStatusInput.value !== null,
);
const diagnosticsPayload = computed(() =>
  JSON.stringify(
    cloud.hfSharedLeaseStatus?.raw ?? cloud.status?.raw ?? cloud.status ?? {},
    null,
    2,
  ),
);
const diagnosticStatusCode = computed(() => {
  if (!cloud.status) return t("Unavailable");
  if (cloud.status.statusCode !== undefined) {
    return String(cloud.status.statusCode);
  }
  return cloud.status.available ? t("OK") : t("Unavailable");
});
const diagnosticAuditEventCount = computed(() =>
  cloud.status?.available ? n(cloud.status.auditEventCount) : t("Unavailable"),
);

const refresh = () =>
  cloud.refresh({
    toriiUrl: session.connection.toriiUrl,
    accountId: activeAccountId.value,
  });

const refreshSharedLeaseStatus = async () => {
  const input = leaseStatusInput.value;
  if (!input || !leaseRouteSupported.value) {
    cloud.clearHfSharedLeaseStatus();
    return;
  }
  try {
    await cloud.refreshHfSharedLeaseStatus(input);
  } catch {
    // The store exposes this independent read error without hiding services.
  }
};

const statusLabel = (status: SoraCloudServiceStatus) => statusLabels[status];

watch(
  () => [session.connection.toriiUrl, activeAccountId.value],
  () => {
    cloud.clearHfSharedLeaseStatus();
    void refresh();
  },
);

onMounted(() => {
  cloud.hydrate();
  void refresh();
});
</script>

<style scoped>
.soracloud-command-card,
.soracloud-lease-card,
.soracloud-list-card {
  background: var(--frost-panel-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.soracloud-kpi-grid,
.soracloud-state,
.soracloud-write-disabled {
  background: var(--frost-panel-inset);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.soracloud-write-disabled {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: var(--radius-control);
}
</style>
