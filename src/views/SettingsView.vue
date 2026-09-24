<template>
  <div class="settings-shell">
    <section class="settings-endpoint-card" aria-labelledby="torii-heading">
      <header class="settings-heading">
        <div>
          <p class="settings-eyebrow">{{ endpointModeLabel }}</p>
          <h2 id="torii-heading">{{ t("Torii endpoint") }}</h2>
          <p class="helper">
            {{
              t(
                "Choose the Torii endpoint used for wallet, staking, governance, VPN, and explorer requests.",
              )
            }}
          </p>
        </div>
        <button
          type="button"
          class="ghost settings-reset"
          :disabled="checkingEndpoint || isDefaultEndpoint"
          @click="handleResetEndpoint"
        >
          {{ t("Reset to default") }}
        </button>
      </header>

      <form
        class="settings-form"
        :aria-busy="checkingEndpoint"
        @submit.prevent="handleCheckAndSaveEndpoint"
      >
        <label class="settings-endpoint-field">
          {{ t("Torii URL") }}
          <input
            id="settings-torii-url"
            ref="endpointInputRef"
            v-model.trim="endpointDraft"
            data-testid="settings-torii-url-input"
            type="url"
            name="toriiUrl"
            autocomplete="url"
            spellcheck="false"
            translate="no"
            aria-describedby="settings-endpoint-status settings-endpoint-error"
            :aria-invalid="Boolean(errorMessage)"
          />
          <span class="field-hint">
            {{
              t(
                "The chain ID and account prefix are the expected wallet target. Endpoint checks never retarget them.",
              )
            }}
          </span>
        </label>
        <button
          type="submit"
          class="settings-primary"
          data-ui-primary-action
          :disabled="checkingEndpoint"
        >
          {{ checkingEndpoint ? t("Checking…") : t("Check & Save") }}
        </button>
      </form>

      <div
        class="settings-feedback"
        :class="{ 'has-feedback': statusMessage || errorMessage }"
      >
        <p
          v-if="statusMessage"
          id="settings-endpoint-status"
          class="message success"
          role="status"
          aria-live="polite"
        >
          {{ statusMessage }}
        </p>
        <p
          v-if="errorMessage"
          id="settings-endpoint-error"
          class="message error"
          role="alert"
        >
          {{ errorMessage }}
        </p>
      </div>

      <dl class="settings-network-facts">
        <div>
          <dt>{{ t("Current endpoint") }}</dt>
          <dd class="mono" translate="no">{{ currentEndpoint }}</dd>
        </div>
        <div>
          <dt>{{ t("Chain ID") }}</dt>
          <dd>
            <input
              class="settings-fact-input mono"
              :value="session.connection.chainId"
              type="text"
              name="chainId"
              autocomplete="off"
              spellcheck="false"
              translate="no"
              :aria-label="t('Chain ID')"
              readonly
            />
          </dd>
        </div>
        <div>
          <dt>{{ t("Network Prefix") }}</dt>
          <dd>
            <input
              class="settings-fact-input mono"
              :value="session.connection.networkPrefix"
              type="text"
              name="networkPrefix"
              autocomplete="off"
              spellcheck="false"
              translate="no"
              :aria-label="t('Network Prefix')"
              readonly
            />
          </dd>
        </div>
      </dl>

      <dl
        v-if="endpointStore.inspection"
        class="settings-endpoint-diagnostics"
        data-testid="endpoint-diagnostics"
      >
        <div>
          <dt>{{ t("Access mode") }}</dt>
          <dd>{{ accessModeLabel }}</dd>
        </div>
        <div>
          <dt>{{ t("Observed chain") }}</dt>
          <dd class="mono" translate="no">
            {{
              endpointStore.inspection.observed?.chainId || t("Not observed")
            }}
          </dd>
        </div>
        <div>
          <dt>{{ t("Observed network prefix") }}</dt>
          <dd class="mono" translate="no">
            {{
              endpointStore.inspection.observed?.networkPrefix ??
              t("Not observed")
            }}
          </dd>
        </div>
        <div>
          <dt>{{ t("Last checked") }}</dt>
          <dd>{{ lastCheckedLabel }}</dd>
        </div>
      </dl>
      <p
        v-if="endpointStore.inspection"
        class="message"
        :class="
          endpointStore.inspection.accessMode === 'read-write'
            ? 'success'
            : 'warning'
        "
      >
        {{ endpointStore.inspection.diagnostic.message }}
      </p>
      <section
        v-if="endpointStore.inspection"
        class="settings-feature-inventory"
        aria-labelledby="endpoint-features-heading"
      >
        <h3 id="endpoint-features-heading">
          {{ t("Endpoint write features") }}
        </h3>
        <ul>
          <li v-for="feature in endpointFeatureRows" :key="feature.key">
            <span>{{ feature.label }}</span>
            <strong :class="{ unsupported: !feature.supported }">
              {{ feature.supported ? t("Supported") : t("Unavailable") }}
            </strong>
          </li>
        </ul>
      </section>

      <details class="settings-advanced technical-details">
        <summary>{{ t("Advanced") }}</summary>
        <div class="settings-advanced-content">
          <div>
            <strong>{{ t("Save without checking") }}</strong>
            <p class="helper">
              {{
                t(
                  "Choose the Torii endpoint used for wallet, staking, governance, VPN, and explorer requests.",
                )
              }}
            </p>
          </div>
          <button
            type="button"
            class="secondary"
            :disabled="checkingEndpoint"
            @click="handleSaveEndpoint"
          >
            {{ t("Save without checking") }}
          </button>
        </div>
        <p class="settings-default-note">
          <span>{{ t("Default endpoint") }}</span>
          <span class="mono" translate="no">{{ defaultEndpoint }}</span>
        </p>
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CHAIN_PRESETS, DEFAULT_CHAIN_PRESET } from "@/constants/chains";
import { useAppI18n } from "@/composables/useAppI18n";
import { inspectEndpoint } from "@/services/iroha";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import { normalizeEndpointUrl } from "@/utils/endpoint";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";

const session = useSessionStore();
const endpointStore = useEndpointStore();
const { t } = useAppI18n();
const defaultEndpoint = DEFAULT_CHAIN_PRESET.connection.toriiUrl;

const endpointDraft = ref(session.connection.toriiUrl || defaultEndpoint);
const endpointInputRef = ref<HTMLInputElement | null>(null);
const checkingEndpoint = ref(false);
const statusMessage = ref("");
const errorMessage = ref("");
let candidateInspectionGeneration = 0;

const currentEndpoint = computed(
  () => session.connection.toriiUrl || defaultEndpoint,
);
const isDefaultEndpoint = computed(
  () => currentEndpoint.value === defaultEndpoint,
);
const endpointModeLabel = computed(() =>
  isDefaultEndpoint.value ? t("Default endpoint") : t("Custom endpoint"),
);
const accessModeLabel = computed(() => {
  switch (endpointStore.inspection?.accessMode) {
    case "read-write":
      return t("Read and write");
    case "read-only":
      return t("Read only");
    case "offline":
      return t("Offline");
    default:
      return t("Not observed");
  }
});
const lastCheckedLabel = computed(() => {
  const checkedAtMs = endpointStore.inspection?.checkedAtMs;
  return checkedAtMs
    ? new Date(checkedAtMs).toLocaleString()
    : t("Not observed");
});
const endpointFeatureRows = computed(() => {
  const features = endpointStore.inspection?.features;
  if (!features) return [];
  return [
    {
      key: "accountRegistration",
      label: t("Account registration"),
      supported: features.accountRegistration.supported,
    },
    {
      key: "accountOnboarding",
      label: t("Account onboarding"),
      supported: features.accountOnboarding.supported,
    },
    {
      key: "assetTransfers",
      label: t("Asset transfers"),
      supported: features.assetTransfers.supported,
    },
    {
      key: "faucetClaim",
      label: t("Faucet claims"),
      supported: features.faucetClaim.supported,
    },
    {
      key: "kaigiMeetings",
      label: t("Kaigi meetings"),
      supported: features.kaigiMeetings.supported,
    },
    {
      key: "governanceWrites",
      label: t("Governance writes"),
      supported: features.governanceWrites.supported,
    },
    {
      key: "stakingWrites",
      label: t("Staking writes"),
      supported: features.stakingWrites.supported,
    },
    {
      key: "subscriptionWrites",
      label: t("Subscription writes"),
      supported: features.subscriptionWrites.supported,
    },
    {
      key: "soraCloudHfSharedLease",
      label: t("SoraCloud HF shared lease"),
      supported: features.soraCloudHfSharedLease.supported,
    },
    {
      key: "vpnSessions",
      label: t("VPN sessions"),
      supported: features.vpnSessions.supported,
    },
    {
      key: "irohaConnectSessions",
      label: t("IrohaConnect sessions"),
      supported: features.irohaConnectSessions.supported,
    },
  ];
});

watch(
  () => session.connection.toriiUrl,
  (value) => {
    endpointDraft.value = value || defaultEndpoint;
  },
);

const normalizeDraftEndpoint = () => normalizeEndpointUrl(endpointDraft.value);

const clearMessages = () => {
  statusMessage.value = "";
  errorMessage.value = "";
};

const formatEndpointError = (error: unknown, fallback: string) =>
  t(toUserFacingErrorMessage(error, fallback));

const activeSessionEndpointContext = () =>
  JSON.stringify([
    session.connection.toriiUrl,
    session.connection.chainId,
    session.connection.networkPrefix,
  ]);

const focusEndpointInput = () => {
  endpointInputRef.value?.focus();
};

const applyEndpoint = (
  endpoint: string,
  expected?: { chainId: string; networkPrefix: number },
) => {
  const nextConnection = expected
    ? {
        toriiUrl: endpoint,
        chainId: expected.chainId,
        networkPrefix: expected.networkPrefix,
      }
    : { toriiUrl: endpoint };
  session.updateConnection(nextConnection);
  session.persistState();
  endpointDraft.value = session.connection.toriiUrl;
};

const expectedContextForEndpoint = (endpoint: string) => {
  const preset = CHAIN_PRESETS.find(
    (candidate) =>
      normalizeEndpointUrl(candidate.connection.toriiUrl) === endpoint,
  );
  return {
    toriiUrl: endpoint,
    chainId: preset?.connection.chainId ?? session.connection.chainId,
    networkPrefix:
      preset?.connection.networkPrefix ?? session.connection.networkPrefix,
  };
};

const handleSaveEndpoint = () => {
  candidateInspectionGeneration += 1;
  checkingEndpoint.value = false;
  clearMessages();
  try {
    applyEndpoint(normalizeDraftEndpoint());
    endpointStore.invalidate();
    statusMessage.value = t("Endpoint saved.");
  } catch (error) {
    errorMessage.value = formatEndpointError(
      error,
      t("Enter a valid Torii endpoint URL."),
    );
    focusEndpointInput();
  }
};

const handleResetEndpoint = () => {
  candidateInspectionGeneration += 1;
  checkingEndpoint.value = false;
  clearMessages();
  applyEndpoint(defaultEndpoint, {
    chainId: DEFAULT_CHAIN_PRESET.connection.chainId,
    networkPrefix: DEFAULT_CHAIN_PRESET.connection.networkPrefix,
  });
  endpointStore.invalidate();
  statusMessage.value = t("Default endpoint restored.");
};

const handleCheckAndSaveEndpoint = async () => {
  clearMessages();
  let endpoint: string;
  try {
    endpoint = normalizeDraftEndpoint();
  } catch (error) {
    errorMessage.value = formatEndpointError(
      error,
      t("Enter a valid Torii endpoint URL."),
    );
    focusEndpointInput();
    return;
  }

  const generation = ++candidateInspectionGeneration;
  const requestDraft = endpointDraft.value;
  const activeContext = activeSessionEndpointContext();
  const isCurrentCandidate = () =>
    generation === candidateInspectionGeneration &&
    requestDraft === endpointDraft.value &&
    activeContext === activeSessionEndpointContext();

  checkingEndpoint.value = true;
  try {
    const expected = expectedContextForEndpoint(endpoint);
    const inspection = await inspectEndpoint(expected);
    if (!isCurrentCandidate()) return;
    if (inspection.identityStatus === "unreachable") {
      throw new Error(inspection.diagnostic.message);
    }
    applyEndpoint(endpoint, expected);
    endpointStore.adoptInspection(inspection);
    statusMessage.value =
      inspection.accessMode === "read-write"
        ? t("Endpoint identity verified and saved.")
        : t("Endpoint saved in read-only mode: {message}", {
            message: inspection.diagnostic.message,
          });
  } catch (error) {
    if (isCurrentCandidate()) {
      errorMessage.value = formatEndpointError(
        error,
        t("Unable to inspect endpoint identity."),
      );
      focusEndpointInput();
    }
  } finally {
    if (generation === candidateInspectionGeneration) {
      checkingEndpoint.value = false;
    }
  }
};
</script>

<style scoped>
.settings-shell {
  position: relative;
  z-index: 1;
  max-width: 920px;
}

.settings-endpoint-card {
  display: grid;
  gap: 24px;
  padding: clamp(20px, 4vw, 40px);
  border: 1px solid var(--frost-border);
  border-radius: 22px;
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.settings-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--panel-border);
}

.settings-heading h2 {
  margin: 4px 0 8px;
  font-size: clamp(1.2rem, 2vw, 1.5rem);
}

.settings-heading .helper {
  max-width: 62ch;
}

.settings-eyebrow {
  margin: 0;
  color: var(--iroha-accent);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.settings-reset {
  flex: 0 0 auto;
  min-height: 40px;
  padding-inline: 10px;
  background: transparent;
  box-shadow: none;
}

.settings-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
}

.settings-endpoint-field {
  min-width: 0;
}

.field-hint {
  color: var(--iroha-muted);
  font-size: 0.78rem;
  font-weight: 400;
  line-height: 1.45;
}

.settings-primary {
  min-width: 148px;
}

.settings-feedback:not(.has-feedback) {
  display: none;
}

.settings-feedback .message {
  margin: 0;
}

.settings-network-facts {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(112px, 0.4fr);
  margin: 0;
  border-block: 1px solid var(--panel-border);
  border-radius: 14px;
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
  overflow: hidden;
}

.settings-endpoint-diagnostics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: var(--panel-border);
  overflow: hidden;
}

.settings-endpoint-diagnostics > div {
  min-width: 0;
  padding: 14px;
  background: var(--color-surface-inset);
}

.settings-endpoint-diagnostics dt {
  margin-bottom: 5px;
  color: var(--iroha-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.settings-endpoint-diagnostics dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.settings-feature-inventory {
  display: grid;
  gap: 10px;
}

.settings-feature-inventory h3 {
  margin: 0;
  font-size: 0.9rem;
}

.settings-feature-inventory ul {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.settings-feature-inventory li {
  min-width: 0;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--color-surface-inset);
}

.settings-feature-inventory strong {
  color: var(--color-success);
  font-size: 0.75rem;
}

.settings-feature-inventory strong.unsupported {
  color: var(--color-warning);
}

.settings-network-facts > div {
  min-width: 0;
  padding: 16px 18px;
}

.settings-network-facts > div + div {
  border-inline-start: 1px solid var(--panel-border);
}

.settings-network-facts dt {
  margin-bottom: 6px;
  color: var(--iroha-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.settings-network-facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.settings-fact-input {
  width: 100%;
  min-height: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: inherit;
}

.settings-advanced {
  margin-top: 0;
}

.settings-advanced-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.settings-advanced-content .helper {
  margin-top: 4px;
}

.settings-default-note {
  display: grid;
  gap: 4px;
  margin-bottom: 0;
  color: var(--iroha-muted);
  font-size: 0.78rem;
}

.settings-default-note .mono {
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .settings-endpoint-card {
    gap: 20px;
    padding: 20px;
  }

  .settings-heading,
  .settings-advanced-content {
    align-items: stretch;
    flex-direction: column;
  }

  .settings-reset {
    align-self: flex-start;
  }

  .settings-form,
  .settings-network-facts,
  .settings-endpoint-diagnostics,
  .settings-feature-inventory ul {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-network-facts > div {
    padding-inline: 0;
  }

  .settings-network-facts > div + div {
    border-inline-start: 0;
    border-top: 1px solid var(--panel-border);
  }

  .settings-primary,
  .settings-advanced-content button {
    width: 100%;
  }
}
</style>
