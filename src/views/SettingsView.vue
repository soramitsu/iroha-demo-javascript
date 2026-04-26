<template>
  <div class="settings-shell">
    <section class="card settings-endpoint-card">
      <header class="card-header">
        <div>
          <p class="section-label">{{ t("Settings") }}</p>
          <h2>{{ t("Torii endpoint") }}</h2>
          <p class="helper">
            {{
              t(
                "Choose the Torii endpoint used for wallet, staking, governance, VPN, and explorer requests.",
              )
            }}
          </p>
        </div>
        <span class="status-pill" :class="{ ok: isDefaultEndpoint }">
          {{ endpointModeLabel }}
        </span>
      </header>

      <div class="settings-endpoint-summary">
        <div class="settings-summary-item">
          <p class="meta-label">{{ t("Current endpoint") }}</p>
          <p class="meta-value mono" translate="no">{{ currentEndpoint }}</p>
        </div>
        <div class="settings-summary-item">
          <p class="meta-label">{{ t("Default endpoint") }}</p>
          <p class="meta-value mono" translate="no">{{ defaultEndpoint }}</p>
        </div>
      </div>

      <div class="form-grid settings-form-grid">
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
        </label>
        <label>
          {{ t("Chain ID") }}
          <input
            :value="session.connection.chainId"
            type="text"
            name="chainId"
            autocomplete="off"
            spellcheck="false"
            translate="no"
            readonly
          />
        </label>
        <label>
          {{ t("Network Prefix") }}
          <input
            :value="session.connection.networkPrefix"
            type="text"
            name="networkPrefix"
            autocomplete="off"
            spellcheck="false"
            translate="no"
            readonly
          />
        </label>
      </div>

      <p class="helper">
        {{
          t(
            "Chain ID and account prefix are loaded from Torii when you check and save the endpoint.",
          )
        }}
      </p>

      <div class="actions settings-actions">
        <button
          :disabled="checkingEndpoint"
          @click="handleCheckAndSaveEndpoint"
        >
          {{ checkingEndpoint ? t("Checking…") : t("Check & Save") }}
        </button>
        <button
          class="secondary"
          :disabled="checkingEndpoint"
          @click="handleSaveEndpoint"
        >
          {{ t("Save without checking") }}
        </button>
        <button
          class="secondary"
          :disabled="checkingEndpoint || isDefaultEndpoint"
          @click="handleResetEndpoint"
        >
          {{ t("Reset to default") }}
        </button>
      </div>

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
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { DEFAULT_CHAIN_PRESET } from "@/constants/chains";
import { useAppI18n } from "@/composables/useAppI18n";
import { getChainMetadata } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { normalizeEndpointUrl } from "@/utils/endpoint";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";

const session = useSessionStore();
const { t } = useAppI18n();
const defaultEndpoint = DEFAULT_CHAIN_PRESET.connection.toriiUrl;

const endpointDraft = ref(session.connection.toriiUrl || defaultEndpoint);
const endpointInputRef = ref<HTMLInputElement | null>(null);
const checkingEndpoint = ref(false);
const statusMessage = ref("");
const errorMessage = ref("");

const currentEndpoint = computed(
  () => session.connection.toriiUrl || defaultEndpoint,
);
const isDefaultEndpoint = computed(
  () => currentEndpoint.value === defaultEndpoint,
);
const endpointModeLabel = computed(() =>
  isDefaultEndpoint.value ? t("Default endpoint") : t("Custom endpoint"),
);

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

const focusEndpointInput = () => {
  endpointInputRef.value?.focus();
};

const applyEndpoint = (
  endpoint: string,
  metadata?: { chainId: string; networkPrefix: number },
) => {
  const nextConnection = metadata
    ? {
        toriiUrl: endpoint,
        chainId: metadata.chainId,
        networkPrefix: metadata.networkPrefix,
      }
    : { toriiUrl: endpoint };
  session.updateConnection(nextConnection);
  session.persistState();
  endpointDraft.value = session.connection.toriiUrl;
};

const handleSaveEndpoint = () => {
  clearMessages();
  try {
    applyEndpoint(normalizeDraftEndpoint());
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
  clearMessages();
  applyEndpoint(defaultEndpoint, {
    chainId: DEFAULT_CHAIN_PRESET.connection.chainId,
    networkPrefix: DEFAULT_CHAIN_PRESET.connection.networkPrefix,
  });
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

  checkingEndpoint.value = true;
  try {
    const metadata = await getChainMetadata(endpoint);
    applyEndpoint(endpoint, metadata);
    statusMessage.value = t("Endpoint checked and chain settings saved.");
  } catch (error) {
    errorMessage.value = formatEndpointError(
      error,
      t("Unable to load chain metadata from Torii."),
    );
    focusEndpointInput();
  } finally {
    checkingEndpoint.value = false;
  }
};
</script>

<style scoped>
.settings-shell {
  display: grid;
  gap: 20px;
}

.settings-endpoint-card {
  display: grid;
  gap: 18px;
}

.settings-endpoint-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.settings-summary-item {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: var(--surface-soft);
}

.settings-summary-item .meta-value {
  overflow-wrap: anywhere;
}

.settings-form-grid {
  grid-template-columns: minmax(0, 1.3fr) minmax(220px, 0.85fr) 160px;
  align-items: start;
}

.settings-endpoint-field {
  grid-column: 1 / 2;
}

.settings-actions {
  margin-top: 0;
}

@media (max-width: 760px) {
  .settings-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-endpoint-field {
    grid-column: auto;
  }
}
</style>
