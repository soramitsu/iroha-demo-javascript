<template>
  <div class="soracloud-shell">
    <section class="card soracloud-command-card">
      <header class="card-header soracloud-command-header">
        <div>
          <h2>{{ t("SoraCloud") }}</h2>
          <p class="helper">
            {{ t("Launch and monitor live services") }}
          </p>
        </div>
        <div class="soracloud-command-actions">
          <span class="pill positive">{{ activeAccountLabel }}</span>
          <span class="pill" :class="availabilityTone">
            {{ availabilityLabel }}
          </span>
          <button type="button" :disabled="cloud.loading" @click="refresh">
            {{ cloud.loading ? t("Refreshing") : t("Refresh") }}
          </button>
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
        <div class="soracloud-state-actions">
          <button type="button" @click="refresh">{{ t("Refresh") }}</button>
        </div>
      </div>

      <div v-else class="soracloud-state">
        <p class="wallet-empty-title">{{ t("Checking SoraCloud...") }}</p>
        <p class="helper">{{ session.connection.toriiUrl }}</p>
      </div>
    </section>

    <section class="soracloud-console">
      <section class="card soracloud-launch-card">
        <header class="card-header">
          <div>
            <h2>{{ t("Launch instance") }}</h2>
            <p class="helper">
              {{
                t("Deploy a Hugging Face model through the live SoraCloud API.")
              }}
            </p>
          </div>
          <span class="pill muted">{{ t("Hugging Face") }}</span>
        </header>

        <div class="soracloud-stepper" aria-label="SoraCloud launch steps">
          <button
            v-for="step in launchSteps"
            :key="step.id"
            type="button"
            :class="{ active: activeStep === step.id }"
            :disabled="!canUseLauncher"
            @click="activeStep = step.id"
          >
            <span>{{ step.index }}</span>
            {{ t(step.label) }}
          </button>
        </div>

        <form class="soracloud-form" @submit.prevent="launch">
          <fieldset :disabled="!canUseLauncher || cloud.launching">
            <div v-if="activeStep === 'model'" class="soracloud-step-panel">
              <label>
                <span>{{ t("Hugging Face repo") }}</span>
                <input
                  v-model.trim="launchForm.repoId"
                  type="text"
                  autocomplete="off"
                  :placeholder="t('owner/model-name')"
                />
              </label>
              <label>
                <span>{{ t("Revision") }}</span>
                <input
                  v-model.trim="launchForm.revision"
                  type="text"
                  autocomplete="off"
                />
              </label>
              <label>
                <span>{{ t("Model name") }}</span>
                <input
                  v-model.trim="launchForm.modelName"
                  type="text"
                  autocomplete="off"
                  @input="modelNameTouched = true"
                />
              </label>
              <label>
                <span>{{ t("Service name") }}</span>
                <input
                  v-model.trim="launchForm.serviceName"
                  type="text"
                  autocomplete="off"
                  @input="serviceNameTouched = true"
                />
              </label>
              <p
                v-if="launchForm.serviceName && !serviceNameValid"
                class="helper error-text"
              >
                {{
                  t(
                    "Use 3-64 lowercase letters, numbers, underscores, or hyphens, starting with a letter.",
                  )
                }}
              </p>
            </div>

            <div
              v-else-if="activeStep === 'lease'"
              class="soracloud-step-panel"
            >
              <label>
                <span>{{ t("Storage class") }}</span>
                <select v-model="launchForm.storageClass">
                  <option value="warm">{{ t("Warm") }}</option>
                  <option value="hot">{{ t("Hot") }}</option>
                  <option value="cold">{{ t("Cold") }}</option>
                </select>
              </label>
              <label>
                <span>{{ t("Lease duration") }}</span>
                <select v-model.number="launchForm.leaseTermHours">
                  <option :value="1">{{ t("1 hour") }}</option>
                  <option :value="24">{{ t("24 hours") }}</option>
                  <option :value="168">{{ t("7 days") }}</option>
                </select>
              </label>
              <label>
                <span>{{ t("Settlement asset") }}</span>
                <input
                  v-model.trim="launchForm.leaseAssetDefinitionId"
                  type="text"
                  autocomplete="off"
                />
                <small class="helper">
                  {{
                    t("Use the canonical asset definition ID, not an alias.")
                  }}
                  {{ t("If this is empty, claim XOR in Wallet first.") }}
                </small>
              </label>
              <label>
                <span>{{ t("Base fee nanos") }}</span>
                <input
                  v-model.trim="launchForm.baseFeeNanos"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                />
              </label>
              <label class="soracloud-span-2">
                <span>{{ t("API token") }}</span>
                <input
                  v-model.trim="launchForm.apiToken"
                  type="password"
                  autocomplete="off"
                />
                <small class="helper">
                  {{
                    t("Optional. Used only for this request and never saved.")
                  }}
                </small>
              </label>
            </div>

            <div v-else class="soracloud-step-panel">
              <div class="soracloud-review-grid">
                <div class="kv">
                  <span class="kv-label">{{ t("Endpoint") }}</span>
                  <span class="kv-value mono">{{
                    session.connection.toriiUrl
                  }}</span>
                </div>
                <div class="kv">
                  <span class="kv-label">{{ t("Wallet") }}</span>
                  <span class="kv-value">{{ activeAccountLabel }}</span>
                </div>
                <div class="kv">
                  <span class="kv-label">{{ t("Repo") }}</span>
                  <span class="kv-value">{{
                    launchForm.repoId || t("Required")
                  }}</span>
                </div>
                <div class="kv">
                  <span class="kv-label">{{ t("Service") }}</span>
                  <span class="kv-value">{{
                    launchForm.serviceName || t("Required")
                  }}</span>
                </div>
                <div class="kv">
                  <span class="kv-label">{{ t("Lease") }}</span>
                  <span class="kv-value">
                    {{
                      t("{count} hours", {
                        count: n(launchForm.leaseTermHours),
                      })
                    }}
                  </span>
                </div>
                <div class="kv">
                  <span class="kv-label">{{ t("Base fee") }}</span>
                  <span class="kv-value">
                    {{ launchForm.baseFeeNanos || t("Required") }}
                  </span>
                </div>
              </div>
            </div>
          </fieldset>

          <p v-if="launcherDisabledReason" class="helper">
            {{ launcherDisabledReason }}
          </p>
          <p v-if="cloud.launchError" class="helper error-text">
            {{ cloud.launchError }}
          </p>
          <div v-if="cloud.launchResult" class="soracloud-launch-result">
            <span class="pill positive">{{ t("Launch submitted") }}</span>
            <span>{{ cloud.launchResult.service_name }}</span>
            <span v-if="cloud.launchResult.tx_hash_hex" class="mono">
              {{ cloud.launchResult.tx_hash_hex }}
            </span>
          </div>

          <div class="soracloud-form-actions">
            <button
              type="button"
              class="secondary"
              :disabled="activeStep === 'model'"
              @click="previousStep"
            >
              {{ t("Back") }}
            </button>
            <button
              v-if="activeStep !== 'review'"
              type="button"
              :disabled="!canUseLauncher"
              @click="nextStep"
            >
              {{ t("Next") }}
            </button>
            <button
              v-else
              type="submit"
              :disabled="launchDisabled || cloud.launching"
            >
              {{ cloud.launching ? t("Launching") : t("Launch live instance") }}
            </button>
          </div>
        </form>
      </section>

      <section class="card soracloud-list-card">
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

        <div v-if="sortedServices.length" class="soracloud-deployment-list">
          <article
            v-for="service in sortedServices"
            :key="service.id"
            class="soracloud-deployment-row"
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
          <p class="helper">
            {{
              cloud.availability === "available"
                ? t(
                    "Use Launch instance to submit a real Hugging Face deployment.",
                  )
                : t(
                    "Refresh after switching to a SoraCloud-enabled Torii endpoint.",
                  )
            }}
          </p>
        </div>
      </section>

      <aside class="card soracloud-inspector-card">
        <header class="card-header">
          <div>
            <h2>{{ t("Diagnostics") }}</h2>
            <p class="helper mono">{{ session.connection.toriiUrl }}</p>
          </div>
          <span class="pill" :class="availabilityTone">{{
            availabilityLabel
          }}</span>
        </header>

        <div class="soracloud-inspector-grid">
          <div class="kv">
            <span class="kv-label">{{ t("API") }}</span>
            <span class="kv-value">/v1/soracloud/status</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Status code") }}</span>
            <span class="kv-value">{{
              cloud.status?.statusCode ?? t("OK")
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Audit events") }}</span>
            <span class="kv-value">{{
              n(cloud.status?.auditEventCount ?? 0)
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Schema") }}</span>
            <span class="kv-value">
              {{ cloud.status?.schemaVersion ?? t("Unavailable") }}
            </span>
          </div>
        </div>

        <details class="technical-details compact">
          <summary>{{ t("Status payload") }}</summary>
          <pre>{{ diagnosticsPayload }}</pre>
        </details>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSessionStore } from "@/stores/session";
import { useSoraCloudStore } from "@/stores/soracloud";
import { getAccountDisplayLabel } from "@/utils/accountId";
import {
  deriveSoraCloudModelName,
  deriveSoraCloudServiceName,
  sortSoraCloudServices,
  soraCloudStatusTone,
  validateSoraCloudLeaseAssetDefinitionId,
  validateSoraCloudServiceName,
  type SoraCloudDeploymentStatus,
  type SoraCloudStorageClass,
} from "@/utils/soracloud";

type LaunchStep = "model" | "lease" | "review";

const { t, n, d } = useAppI18n();
const session = useSessionStore();
const cloud = useSoraCloudStore();

const launchSteps: Array<{ id: LaunchStep; index: number; label: string }> = [
  { id: "model", index: 1, label: "Choose model" },
  { id: "lease", index: 2, label: "Lease and payment" },
  { id: "review", index: 3, label: "Review and launch" },
];

const activeStep = ref<LaunchStep>("model");
const modelNameTouched = ref(false);
const serviceNameTouched = ref(false);
const canonicalLeaseAssetDefinitionId = (value: string): string => {
  const assetDefinitionId = value.trim();
  return validateSoraCloudLeaseAssetDefinitionId(assetDefinitionId)
    ? assetDefinitionId
    : "";
};
const launchForm = reactive({
  repoId: "",
  revision: "main",
  modelName: "",
  serviceName: "",
  apartmentName: "",
  storageClass: "warm" as SoraCloudStorageClass,
  leaseTermHours: 24,
  leaseAssetDefinitionId: canonicalLeaseAssetDefinitionId(
    session.connection.assetDefinitionId,
  ),
  baseFeeNanos: "",
  apiToken: "",
});

const statusLabels: Record<SoraCloudDeploymentStatus, string> = {
  healthy: "Healthy",
  deploying: "Deploying",
  warning: "Needs attention",
  paused: "Paused",
  failed: "Failed",
  unknown: "Unknown",
};

const activeAccount = computed(() => session.activeAccount);
const activeAccountLabel = computed(
  () =>
    getAccountDisplayLabel(
      activeAccount.value,
      "",
      session.connection.networkPrefix,
    ) || t("Wallet ready"),
);
const canUseLauncher = computed(
  () => cloud.availability === "available" && Boolean(activeAccount.value),
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
const serviceNameValid = computed(() =>
  validateSoraCloudServiceName(launchForm.serviceName),
);
const leaseAssetDefinitionValid = computed(() =>
  validateSoraCloudLeaseAssetDefinitionId(launchForm.leaseAssetDefinitionId),
);
const baseFeeValid = computed(
  () =>
    /^\d+$/u.test(launchForm.baseFeeNanos.trim()) &&
    BigInt(launchForm.baseFeeNanos.trim()) > 0n,
);
const launcherDisabledReason = computed(() => {
  if (cloud.availability !== "available") {
    return t("Select a SoraCloud-enabled endpoint before launching.");
  }
  if (!activeAccount.value) return t("Create or restore a wallet first.");
  if (!activeAccount.value.hasStoredSecret) {
    return t("Save this wallet in the secure vault before launching.");
  }
  if (launchForm.leaseAssetDefinitionId && !leaseAssetDefinitionValid.value) {
    return t("Settlement asset must be a canonical asset definition ID.");
  }
  return "";
});
const launchDisabled = computed(
  () =>
    Boolean(launcherDisabledReason.value) ||
    !launchForm.repoId.trim() ||
    !launchForm.modelName.trim() ||
    !serviceNameValid.value ||
    !leaseAssetDefinitionValid.value ||
    !baseFeeValid.value,
);
const diagnosticsPayload = computed(() =>
  JSON.stringify(cloud.status?.raw ?? cloud.status ?? {}, null, 2),
);

const refresh = () =>
  cloud.refresh({
    toriiUrl: session.connection.toriiUrl,
    apiToken: launchForm.apiToken,
  });

const nextStep = () => {
  if (activeStep.value === "model") {
    activeStep.value = "lease";
  } else if (activeStep.value === "lease") {
    activeStep.value = "review";
  }
};

const previousStep = () => {
  if (activeStep.value === "review") {
    activeStep.value = "lease";
  } else if (activeStep.value === "lease") {
    activeStep.value = "model";
  }
};

const launch = async () => {
  if (launchDisabled.value || !activeAccount.value) return;
  await cloud.launchHf({
    toriiUrl: session.connection.toriiUrl,
    accountId: activeAccount.value.accountId,
    repoId: launchForm.repoId,
    revision: launchForm.revision || undefined,
    modelName: launchForm.modelName,
    serviceName: launchForm.serviceName,
    apartmentName: launchForm.apartmentName || undefined,
    storageClass: launchForm.storageClass,
    leaseTermMs: launchForm.leaseTermHours * 60 * 60 * 1000,
    leaseAssetDefinitionId: launchForm.leaseAssetDefinitionId,
    baseFeeNanos: launchForm.baseFeeNanos,
    apiToken: launchForm.apiToken || undefined,
  });
};

const statusLabel = (status: SoraCloudDeploymentStatus) => statusLabels[status];

watch(
  () => launchForm.repoId,
  (repoId) => {
    if (!modelNameTouched.value) {
      launchForm.modelName = deriveSoraCloudModelName(repoId);
    }
    if (!serviceNameTouched.value) {
      launchForm.serviceName = deriveSoraCloudServiceName(
        repoId,
        activeAccount.value?.accountId,
      );
    }
  },
);

watch(
  () => session.connection.assetDefinitionId,
  (assetDefinitionId) => {
    const canonicalAssetDefinitionId =
      canonicalLeaseAssetDefinitionId(assetDefinitionId);
    if (
      canonicalAssetDefinitionId &&
      !validateSoraCloudLeaseAssetDefinitionId(
        launchForm.leaseAssetDefinitionId,
      )
    ) {
      launchForm.leaseAssetDefinitionId = canonicalAssetDefinitionId;
    }
  },
);

onMounted(() => {
  cloud.hydrate();
  void refresh();
});
</script>
