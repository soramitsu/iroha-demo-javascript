<template>
  <section class="send-shell">
    <header class="send-header">
      <p class="send-account-copy">
        <span>{{ t("From") }}</span>
        <strong>
          {{
            activeAccount?.displayName ||
            activeAccount?.i105AccountId ||
            activeAccount?.accountId ||
            t("Configure account first")
          }}
        </strong>
      </p>
    </header>

    <div class="send-layout">
      <aside class="send-context">
        <div class="send-balance">
          <span class="send-balance-label">{{ t("Available balance") }}</span>
          <strong class="send-balance-value">{{ activeAssetBalance }}</strong>
          <span class="send-balance-asset">{{ activeAssetLabel }}</span>
          <p
            v-if="sendAssetsError"
            class="send-balance-error"
            data-testid="send-assets-error"
            role="alert"
          >
            {{ sendAssetsError }}
          </p>
        </div>
        <details class="technical-details compact send-source-details">
          <summary>{{ t("Payment details") }}</summary>
          <dl class="send-data-list">
            <div>
              <dt>{{ t("From") }}</dt>
              <dd>
                {{ activeAccountDisplayId || t("Configure account first") }}
              </dd>
            </div>
            <div>
              <dt>{{ t("Asset") }}</dt>
              <dd>{{ activeAssetLabel }}</dd>
              <dd v-if="activeAssetAlias" class="send-kpi-sub">
                {{ activeAssetCanonicalLabel }}
              </dd>
            </div>
          </dl>
        </details>
      </aside>

      <div class="send-form-pane">
        <template v-if="!reviewing">
          <div class="form-grid send-form">
            <label>
              {{ t("Recipient") }}
              <input
                v-model="form.destination"
                data-testid="destination-account-input"
              />
              <span
                v-if="destinationResolutionMessage"
                class="field-feedback recipient-resolution"
                :class="{ error: destinationResolution.error }"
              >
                {{ destinationResolutionMessage }}
              </span>
            </label>
            <label>
              {{ t("Amount") }}
              <input
                v-model="form.quantity"
                type="number"
                min="0"
                step="0.01"
              />
            </label>
            <label>
              {{ t("Memo (optional)") }}
              <input
                v-model="form.memo"
                data-testid="send-memo-input"
                maxlength="1024"
              />
            </label>
          </div>

          <p class="transaction-fee-note">
            <span>{{ t("Fee") }}</span>
            <strong>{{ formatTransactionFee(null, t) }}</strong>
          </p>
          <p
            v-if="!networkWriteSupported"
            class="helper send-note"
            data-testid="send-write-prerequisite"
            role="status"
          >
            {{ networkWritePrerequisite }}
          </p>
          <div class="actions send-primary-actions">
            <button
              data-testid="send-review-button"
              data-ui-primary-action
              :disabled="sending || !isValid"
              @click="openReview"
            >
              {{ t("Review") }}
            </button>
          </div>
        </template>

        <section v-else class="send-review" :aria-label="t('Review')">
          <header class="send-review-header">
            <p class="send-review-kicker">{{ t("Review") }}</p>
            <h2>{{ t("Send") }}</h2>
          </header>
          <dl class="send-review-list">
            <div>
              <dt>{{ t("Recipient") }}</dt>
              <dd>{{ reviewDestinationLabel }}</dd>
            </div>
            <div>
              <dt>{{ t("Amount") }}</dt>
              <dd>{{ normalizedQuantity }} {{ activeAssetLabel }}</dd>
            </div>
            <div v-if="form.memo">
              <dt>{{ t("Memo (optional)") }}</dt>
              <dd>{{ form.memo }}</dd>
            </div>
            <div>
              <dt>{{ t("Fee") }}</dt>
              <dd>{{ formatTransactionFee(null, t) }}</dd>
            </div>
          </dl>
          <div class="actions send-review-actions">
            <button
              type="button"
              class="secondary"
              :disabled="sending"
              @click="reviewing = false"
            >
              {{ t("Back") }}
            </button>
            <button
              data-testid="send-confirm-button"
              data-ui-primary-action
              :disabled="sending || !isValid"
              @click="handleSend"
            >
              {{ sending ? t("Submitting…") : t("Send") }}
            </button>
          </div>
        </section>

        <div class="send-feedback">
          <p
            v-if="statusMessage"
            class="helper send-note send-status"
            :class="'send-status-' + statusTone"
            :role="statusTone === 'error' ? 'alert' : 'status'"
            :aria-live="statusTone === 'error' ? 'assertive' : 'polite'"
          >
            {{ statusMessage }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  fetchAccountAssets,
  resolveAccountAlias,
  transferAsset,
} from "@/services/iroha";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import { getPublicAccountId } from "@/utils/accountId";
import {
  extractAssetDefinitionId,
  formatAssetDefinitionLabel,
  resolveToriiXorAsset,
} from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import {
  appendTransactionFee,
  formatTransactionFee,
} from "@/utils/transactionFee";
import { assertFinalizedSubmissionResult } from "@/utils/transactionFinality";
import type { AccountAssetsResponse } from "@/types/iroha";

const session = useSessionStore();
const endpointStore = useEndpointStore();
const activeAccount = computed(() => session.activeAccount);
const { t } = useAppI18n();
const activeAccountDisplayId = computed(() =>
  getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
);
const requestAccountId = computed(
  () => activeAccountDisplayId.value || activeAccount.value?.accountId || "",
);
const sendAssets = ref<AccountAssetsResponse["items"]>([]);
const sendAssetsState = ref<"idle" | "loading" | "ready" | "error">("idle");
const sendAssetsError = ref("");
let sendAssetsRequestSequence = 0;
const form = reactive({
  destination: "",
  quantity: "0",
  memo: "",
});
const sending = ref(false);
const reviewing = ref(false);
const statusMessage = ref("");
const statusTone = ref<"neutral" | "success" | "error">("neutral");
const destinationResolution = reactive({
  input: "",
  toriiUrl: "",
  networkPrefix: null as number | null,
  accountId: "",
  alias: "",
  resolved: false,
  resolving: false,
  error: "",
});
let destinationResolveTimer: ReturnType<typeof setTimeout> | null = null;
let destinationResolveSequence = 0;

const normalizedQuantity = computed(() => String(form.quantity).trim());
const destinationValue = computed(() => form.destination.trim());
const destinationResolutionMatchesContext = computed(
  () =>
    destinationResolution.input === destinationValue.value &&
    destinationResolution.toriiUrl === session.connection.toriiUrl &&
    destinationResolution.networkPrefix === session.connection.networkPrefix,
);
const destinationResolutionIsUsable = computed(
  () =>
    destinationResolutionMatchesContext.value &&
    !destinationResolution.resolving &&
    !destinationResolution.error &&
    Boolean(destinationResolution.accountId),
);
const resolvedDestinationAccountId = computed(() =>
  destinationResolutionIsUsable.value ? destinationResolution.accountId : "",
);
const destinationAccountIdForSubmit = computed(
  () => resolvedDestinationAccountId.value || destinationValue.value,
);
const reviewDestinationLabel = computed(
  () => destinationAccountIdForSubmit.value || destinationValue.value,
);
const destinationResolutionMessage = computed(() => {
  if (!destinationResolutionMatchesContext.value) {
    return "";
  }
  if (destinationResolution.resolving) {
    return t("Resolving recipient…");
  }
  if (destinationResolution.error) {
    return destinationResolution.error;
  }
  if (destinationResolution.resolved && destinationResolution.accountId) {
    return t("Alias {alias} resolves to {accountId}.", {
      alias: destinationResolution.alias || destinationResolution.input,
      accountId: destinationResolution.accountId,
    });
  }
  if (
    destinationResolution.accountId &&
    destinationResolution.accountId !== destinationResolution.input
  ) {
    return t("Recipient normalized to {accountId}.", {
      accountId: destinationResolution.accountId,
    });
  }
  return "";
});
const resolvedAssetDefinitionId = computed(
  () =>
    extractAssetDefinitionId(session.connection.assetDefinitionId).trim() ||
    session.connection.assetDefinitionId.trim(),
);
const activeAsset = computed(() =>
  resolveToriiXorAsset(sendAssets.value, [
    resolvedAssetDefinitionId.value,
    session.connection.assetDefinitionId,
  ]),
);
const activeAssetId = computed(
  () => activeAsset.value?.asset_id || resolvedAssetDefinitionId.value,
);
const activeAssetAlias = computed(() =>
  String(activeAsset.value?.asset_alias ?? activeAsset.value?.asset_name ?? "")
    .trim()
    .replace(/^@/, ""),
);
const activeAssetCanonicalLabel = computed(() =>
  formatAssetDefinitionLabel(activeAssetId.value, t("—")),
);
const activeAssetLabel = computed(
  () => activeAssetAlias.value || activeAssetCanonicalLabel.value,
);
const activeAssetBalance = computed(() => {
  if (sendAssetsState.value === "error") {
    return t("Unavailable");
  }
  if (sendAssetsState.value !== "ready") {
    return t("—");
  }
  return activeAsset.value?.quantity ?? "0";
});
const sendAssetsReady = computed(() => sendAssetsState.value === "ready");
const isAmountValid = computed(() => Number(form.quantity) > 0);
const isMemoValid = computed(() => {
  if (!form.memo) return true;
  if (
    form.memo.trim() !== form.memo ||
    form.memo.normalize("NFC") !== form.memo
  ) {
    return false;
  }
  for (const character of form.memo) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x1f || codePoint === 0x7f) {
      return false;
    }
  }
  return (
    !/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(form.memo) &&
    new TextEncoder().encode(form.memo).byteLength <= 1_024
  );
});
const isDestinationValid = computed(() => {
  if (!destinationValue.value) {
    return false;
  }
  return !(
    destinationResolutionMatchesContext.value && destinationResolution.error
  );
});
const networkWriteSupported = computed(
  () =>
    endpointStore.writeAllowed &&
    endpointStore.inspection?.features.assetTransfers.supported === true,
);
const networkWritePrerequisite = computed(() => {
  if (endpointStore.state === "checking") {
    return t("Wait for endpoint capability inspection to finish.");
  }
  if (!endpointStore.writeAllowed) {
    return (
      endpointStore.diagnostic ||
      t("Writes are blocked until the endpoint identity is verified.")
    );
  }
  return t(
    "This endpoint does not advertise the required asset transfer operations.",
  );
});

const cancelDestinationResolution = () => {
  if (destinationResolveTimer) {
    clearTimeout(destinationResolveTimer);
    destinationResolveTimer = null;
  }
  destinationResolveSequence += 1;
};

const resetDestinationResolution = () => {
  destinationResolution.input = "";
  destinationResolution.toriiUrl = "";
  destinationResolution.networkPrefix = null;
  destinationResolution.accountId = "";
  destinationResolution.alias = "";
  destinationResolution.resolved = false;
  destinationResolution.resolving = false;
  destinationResolution.error = "";
};

const resolveDestinationNow = async (input = destinationValue.value) => {
  const destination = input.trim();
  cancelDestinationResolution();
  const sequence = destinationResolveSequence;
  const toriiUrl = session.connection.toriiUrl;
  const networkPrefix = session.connection.networkPrefix;
  if (!destination) {
    resetDestinationResolution();
    return "";
  }
  destinationResolution.input = destination;
  destinationResolution.toriiUrl = toriiUrl;
  destinationResolution.networkPrefix = networkPrefix;
  destinationResolution.accountId = "";
  destinationResolution.alias = "";
  destinationResolution.resolved = false;
  destinationResolution.resolving = true;
  destinationResolution.error = "";
  try {
    const result = await resolveAccountAlias({
      toriiUrl,
      alias: destination,
      networkPrefix,
    });
    if (
      sequence !== destinationResolveSequence ||
      destinationValue.value !== destination ||
      session.connection.toriiUrl !== toriiUrl ||
      session.connection.networkPrefix !== networkPrefix
    ) {
      return "";
    }
    destinationResolution.input = destination;
    destinationResolution.accountId = result.accountId;
    destinationResolution.alias = result.alias || destination;
    destinationResolution.resolved = result.resolved;
    destinationResolution.error = "";
    return result.accountId;
  } catch (error) {
    if (
      sequence !== destinationResolveSequence ||
      destinationValue.value !== destination ||
      session.connection.toriiUrl !== toriiUrl ||
      session.connection.networkPrefix !== networkPrefix
    ) {
      return "";
    }
    destinationResolution.input = destination;
    destinationResolution.accountId = "";
    destinationResolution.alias = destination;
    destinationResolution.resolved = false;
    destinationResolution.error = toUserFacingErrorMessage(
      error,
      t("Unable to resolve recipient."),
    );
    return "";
  } finally {
    if (
      sequence === destinationResolveSequence &&
      destinationResolution.input === destination &&
      destinationResolution.toriiUrl === toriiUrl &&
      destinationResolution.networkPrefix === networkPrefix
    ) {
      destinationResolution.resolving = false;
    }
  }
};

const scheduleDestinationResolution = () => {
  cancelDestinationResolution();
  const destination = destinationValue.value;
  if (!destination) {
    resetDestinationResolution();
    return;
  }
  destinationResolution.input = destination;
  destinationResolution.toriiUrl = session.connection.toriiUrl;
  destinationResolution.networkPrefix = session.connection.networkPrefix;
  destinationResolution.accountId = "";
  destinationResolution.alias = "";
  destinationResolution.resolved = false;
  destinationResolution.resolving = true;
  destinationResolution.error = "";
  destinationResolveTimer = setTimeout(() => {
    void resolveDestinationNow(destination);
  }, 350);
};

watch(destinationValue, scheduleDestinationResolution);

watch(
  [() => session.connection.toriiUrl, () => session.connection.networkPrefix],
  () => {
    reviewing.value = false;
    scheduleDestinationResolution();
  },
  { flush: "sync" },
);

watch(
  () => [form.destination, form.quantity, form.memo],
  () => {
    reviewing.value = false;
  },
);

const refreshSendAssets = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = requestAccountId.value;
  const requestSequence = sendAssetsRequestSequence + 1;
  sendAssetsRequestSequence = requestSequence;
  if (!toriiUrl || !accountId) {
    sendAssets.value = [];
    sendAssetsState.value = "idle";
    sendAssetsError.value = "";
    return;
  }
  sendAssetsState.value = "loading";
  sendAssetsError.value = "";
  try {
    const result = await fetchAccountAssets({
      toriiUrl,
      accountId,
      networkPrefix: session.connection.networkPrefix,
      limit: 200,
    });
    if (
      requestSequence !== sendAssetsRequestSequence ||
      session.connection.toriiUrl !== toriiUrl ||
      requestAccountId.value !== accountId
    ) {
      return;
    }
    sendAssets.value = result.items;
    sendAssetsState.value = "ready";
  } catch (error) {
    if (
      requestSequence !== sendAssetsRequestSequence ||
      session.connection.toriiUrl !== toriiUrl ||
      requestAccountId.value !== accountId
    ) {
      return;
    }
    console.warn("Failed to load send asset balance", error);
    sendAssetsState.value = "error";
    sendAssetsError.value = toUserFacingErrorMessage(error, t("Unavailable"));
  }
};

watch(
  [() => session.connection.toriiUrl, requestAccountId],
  () => {
    void refreshSendAssets();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  cancelDestinationResolution();
});

const isValid = computed(() =>
  Boolean(
    networkWriteSupported.value &&
      sendAssetsReady.value &&
      session.hasAccount &&
      activeAccount.value &&
      resolvedAssetDefinitionId.value &&
      isAmountValid.value &&
      isMemoValid.value &&
      isDestinationValid.value,
  ),
);

const openReview = async () => {
  if (!networkWriteSupported.value) {
    statusMessage.value = networkWritePrerequisite.value;
    statusTone.value = "error";
    return;
  }
  if (!sendAssetsReady.value) {
    statusMessage.value = sendAssetsError.value || t("Unavailable");
    statusTone.value = "error";
    return;
  }
  if (!isValid.value || !session.connection.toriiUrl || !activeAccount.value) {
    statusMessage.value = t("Configure Torii + account first.");
    statusTone.value = "error";
    return;
  }
  const resolvedDestination = await resolveDestinationNow();
  if (!resolvedDestination) {
    statusMessage.value =
      destinationResolution.error || t("Unable to resolve recipient.");
    statusTone.value = "error";
    return;
  }
  statusMessage.value = "";
  statusTone.value = "neutral";
  reviewing.value = true;
};

const handleSend = async () => {
  if (!reviewing.value) {
    return;
  }
  if (!networkWriteSupported.value) {
    statusMessage.value = networkWritePrerequisite.value;
    statusTone.value = "error";
    return;
  }
  if (!sendAssetsReady.value) {
    statusMessage.value = sendAssetsError.value || t("Unavailable");
    statusTone.value = "error";
    return;
  }
  if (!isValid.value || !session.connection.toriiUrl || !activeAccount.value) {
    statusMessage.value = t("Configure Torii + account first.");
    statusTone.value = "error";
    return;
  }
  if (!destinationResolutionIsUsable.value) {
    await resolveDestinationNow();
  }
  if (!destinationResolutionIsUsable.value) {
    statusMessage.value =
      destinationResolution.error || t("Unable to resolve recipient.");
    statusTone.value = "error";
    return;
  }

  const account = activeAccount.value;
  sending.value = true;
  statusMessage.value = "";
  statusTone.value = "neutral";
  try {
    const result = await transferAsset({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      assetDefinitionId: resolvedAssetDefinitionId.value,
      accountId: account.accountId,
      destinationAccountId: destinationAccountIdForSubmit.value,
      networkPrefix: session.connection.networkPrefix,
      quantity: normalizedQuantity.value,
      ...(form.memo ? { memo: form.memo } : {}),
    });
    assertFinalizedSubmissionResult(result);
    const successMessage = t("Transaction finalized on-chain: {hash}", {
      hash: result.hash,
    });
    statusMessage.value = appendTransactionFee(
      successMessage +
        " · " +
        t("Block {height}", {
          height: result.finality.blockHeight,
        }),
      result.feeQuote,
      t,
    );
    statusTone.value = "success";
    reviewing.value = false;
    void refreshSendAssets();
  } catch (error) {
    statusMessage.value = toUserFacingErrorMessage(
      error,
      t("Transaction failed."),
    );
    statusTone.value = "error";
  } finally {
    sending.value = false;
  }
};
</script>
<style scoped>
.send-shell {
  display: grid;
  gap: 24px;
  min-width: 0;
}

.send-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--color-border);
}

.send-account-copy {
  display: grid;
  gap: 3px;
  margin: 0;
  min-width: 0;
}

.send-account-copy span {
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.send-account-copy strong {
  overflow-wrap: anywhere;
  unicode-bidi: plaintext;
}

.send-layout {
  display: grid;
  grid-template-columns: minmax(220px, 0.72fr) minmax(360px, 1.28fr);
  gap: clamp(28px, 5vw, 72px);
  align-items: start;
  min-width: 0;
}

.send-context,
.send-form-pane {
  display: grid;
  gap: 16px;
  align-content: start;
  min-width: 0;
}

.send-context {
  position: sticky;
  top: 20px;
}

.send-balance {
  display: grid;
  gap: 6px;
  padding: 8px 0 22px;
  border-bottom: 1px solid var(--color-border);
}

.send-balance-label {
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.send-balance-value {
  font-size: clamp(2.2rem, 5vw, 3.6rem);
  font-weight: 650;
  letter-spacing: -0.055em;
  line-height: 0.95;
}

.send-balance-asset {
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
  unicode-bidi: plaintext;
}

.send-balance-error {
  margin: 6px 0 0;
  color: var(--color-danger);
  font-size: 0.78rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.send-kpi-sub {
  min-width: 0;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  overflow-wrap: anywhere;
  unicode-bidi: plaintext;
}

.send-source-details {
  margin-top: 0;
  background: transparent;
}

.send-data-list,
.send-review-list {
  display: grid;
  gap: 0;
  margin-block: 0;
}

.send-data-list > div,
.send-review-list > div {
  display: grid;
  grid-template-columns: minmax(88px, 0.42fr) minmax(0, 1fr);
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
}

.send-data-list > div:last-child,
.send-review-list > div:last-child {
  border-bottom: 0;
}

.send-data-list dt,
.send-review-list dt {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.send-data-list dd,
.send-review-list dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: end;
  unicode-bidi: plaintext;
}

.send-form {
  gap: 18px;
}

.send-form label,
.send-form input {
  min-width: 0;
}

.send-form input {
  width: 100%;
}

.send-form-pane {
  padding: clamp(20px, 3vw, 32px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.field-feedback {
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 500;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.field-feedback.error {
  color: var(--color-danger);
}

.send-feedback {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.send-note {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-soft);
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.send-status {
  color: var(--color-text-muted);
}

.send-status-success {
  color: var(--color-success);
  border-color: color-mix(in srgb, currentColor 38%, var(--color-border));
  background: color-mix(in srgb, currentColor 8%, transparent);
  box-shadow: inset 3px 0 0 currentColor;
}

.send-status-error {
  color: var(--color-danger);
  border-color: color-mix(in srgb, currentColor 38%, var(--color-border));
  background: color-mix(in srgb, currentColor 8%, transparent);
  box-shadow: inset 3px 0 0 currentColor;
}

.recipient-resolution {
  word-break: break-all;
  unicode-bidi: plaintext;
}

.recipient-resolution.error {
  color: var(--color-danger);
}

.send-primary-actions button {
  width: 100%;
}

.send-review {
  display: grid;
  gap: 20px;
  animation: send-reveal 160ms ease-out;
}

.send-review-header {
  display: grid;
  gap: 6px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--color-border);
}

.send-review-kicker {
  margin: 0;
  color: var(--color-accent);
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.send-review-header h2 {
  margin: 0;
  font-size: clamp(1.35rem, 3vw, 1.8rem);
}

.send-review-actions {
  display: grid;
  grid-template-columns: auto minmax(160px, 1fr);
}

@keyframes send-reveal {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 960px) {
  .send-layout {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .send-context {
    position: static;
    grid-template-columns: minmax(0, 1fr) minmax(240px, 0.8fr);
    align-items: start;
  }
}

@media (max-width: 760px) {
  .send-header {
    gap: 14px;
    align-items: flex-start;
    flex-direction: column;
  }

  .send-context {
    grid-template-columns: 1fr;
    order: 2;
  }

  .send-form-pane {
    order: 1;
    padding: 18px;
    border-radius: 18px;
  }

  .send-note {
    padding: 10px 12px;
  }

  .send-review-actions {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .send-review {
    animation: none;
  }
}
</style>
