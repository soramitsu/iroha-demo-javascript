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
      <div class="actions-row send-tools">
        <button
          type="button"
          class="icon-cta secondary"
          :aria-expanded="scannerSheetOpen"
          @click="toggleScanner"
        >
          <img :src="sendIcon" alt="" />
          <span>{{
            scannerSheetOpen ? t("Stop scanner") : t("Scan payment QR")
          }}</span>
        </button>
        <button
          type="button"
          class="icon-cta secondary"
          @click="scanner.openFilePicker"
        >
          <img :src="sendIcon" alt="" />
          <span>{{ t("Upload QR image") }}</span>
        </button>
        <input
          ref="scannerFileInputRef"
          type="file"
          accept="image/*"
          class="sr-only"
          :aria-label="t('Upload QR image')"
          @change="scanner.decodeFile"
        />
      </div>
    </header>

    <QrScannerSheet
      :open="scannerSheetOpen"
      :title="t('Scan payment QR')"
      :description="t('or upload a QR image')"
      :close-label="t('Cancel')"
      @close="closeScanner"
    >
      <div class="scanner-frame active">
        <div class="scanner">
          <video ref="scannerVideoRef" autoplay muted playsinline></video>
        </div>
      </div>
    </QrScannerSheet>

    <div class="send-layout">
      <aside class="send-context">
        <div class="send-balance">
          <span class="send-balance-label">{{ t("Available balance") }}</span>
          <strong class="send-balance-value">{{ activeAssetBalance }}</strong>
          <span class="send-balance-asset">{{ activeAssetLabel }}</span>
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
          <SegmentedControl
            class="payment-mode-toggle"
            data-testid="send-mode-control"
            :model-value="sendMode"
            :label="t('Send mode')"
            :options="sendModeOptions"
            @update:model-value="setSendMode"
          />

          <div class="form-grid send-form">
            <label>
              {{ t("Recipient") }}
              <input
                v-model="form.destination"
                data-testid="destination-account-input"
                :placeholder="
                  form.shielded
                    ? t(
                        'Paste private address, scan a Receive QR, or enter your own wallet to make funds private.',
                      )
                    : ''
                "
              />
              <span
                v-if="destinationResolutionMessage"
                class="field-feedback recipient-resolution"
                :class="{ error: destinationResolution.error }"
              >
                {{ destinationResolutionMessage }}
              </span>
              <span
                v-else-if="
                  form.shielded &&
                  !destinationIsSelf &&
                  !hasShieldedPaymentAddress
                "
                class="field-feedback"
              >
                {{
                  t(
                    "Paste a private address or scan a Receive QR before sending privately.",
                  )
                }}
              </span>
            </label>
            <label>
              {{ t("Amount") }}
              <input
                v-model="form.quantity"
                type="number"
                min="0"
                :step="form.shielded ? '1' : '0.01'"
              />
            </label>
            <label v-if="!form.shielded">
              {{ t("Memo (optional)") }}
              <input v-model="form.memo" />
            </label>
            <p v-else class="helper private-mode-note">
              {{
                t(
                  "Private transfers use a recipient private address or Receive QR and do not include memos.",
                )
              }}
            </p>
          </div>

          <p class="transaction-fee-note">
            <span>{{ t("Fee") }}</span>
            <strong>{{
              formatTransactionFee(
                transactionFeeHintForEndpoint(session.connection.toriiUrl),
                t,
              )
            }}</strong>
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
            <h2>{{ submitActionLabel }}</h2>
          </header>
          <dl class="send-review-list">
            <div>
              <dt>{{ t("Send mode") }}</dt>
              <dd>{{ form.shielded ? t("Private") : t("Standard") }}</dd>
            </div>
            <div>
              <dt>{{ t("Recipient") }}</dt>
              <dd>{{ reviewDestinationLabel }}</dd>
            </div>
            <div>
              <dt>{{ t("Amount") }}</dt>
              <dd>{{ normalizedQuantity }} {{ activeAssetLabel }}</dd>
            </div>
            <div v-if="!form.shielded && form.memo">
              <dt>{{ t("Memo (optional)") }}</dt>
              <dd>{{ form.memo }}</dd>
            </div>
            <div>
              <dt>{{ t("Fee") }}</dt>
              <dd>
                {{
                  formatTransactionFee(
                    transactionFeeHintForEndpoint(session.connection.toriiUrl),
                    t,
                  )
                }}
              </dd>
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
              {{ sending ? t("Submitting…") : submitActionLabel }}
            </button>
          </div>
        </section>

        <div class="send-feedback">
          <p v-if="scanMessage || scannerMessage" class="helper send-note">
            {{ scanMessage || scannerMessage }}
          </p>
          <p v-if="shieldCapabilityMessage" class="helper send-note">
            {{ shieldCapabilityMessage }}
          </p>
          <p
            v-if="statusMessage"
            class="helper send-note send-status"
            :class="`send-status-${statusTone}`"
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
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  toRef,
  watch,
} from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { QrScannerSheet, SegmentedControl } from "@/components/ui";
import {
  fetchAccountAssets,
  resolveAccountAlias,
  transferAsset,
} from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { useQrScanner } from "@/composables/useQrScanner";
import { useShieldCapability } from "@/composables/useShieldCapability";
import { isPositiveWholeAmount } from "@/utils/confidential";
import { getPublicAccountId } from "@/utils/accountId";
import {
  extractAssetDefinitionId,
  formatAssetDefinitionLabel,
  resolveToriiXorAsset,
  shouldReplaceConfiguredAssetDefinitionId,
} from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import {
  appendTransactionFee,
  formatTransactionFee,
  transactionFeeHintForEndpoint,
} from "@/utils/transactionFee";
import {
  CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX,
  parseConfidentialPaymentAddressText,
  type ConfidentialPaymentAddressPayload,
} from "@/utils/confidentialPaymentAddress";
import type { AccountAssetsResponse } from "@/types/iroha";
import SendIcon from "@/assets/send.svg";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const { t } = useAppI18n();
const activeAccountDisplayId = computed(() =>
  getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
);
const requestAccountId = computed(
  () => activeAccountDisplayId.value || activeAccount.value?.accountId || "",
);
const sendAssets = ref<AccountAssetsResponse["items"]>([]);
const sendAssetsLoading = ref(false);
let sendAssetsRequestSequence = 0;
const form = reactive({
  destination: "",
  quantity: "0",
  memo: "",
  shielded: false,
  shieldedReceiveKeyId: "",
  shieldedReceivePublicKeyBase64Url: "",
  shieldedOwnerTagHex: "",
  shieldedDiversifierHex: "",
  shieldedAddressAccountId: "",
});
const sending = ref(false);
const reviewing = ref(false);
const statusMessage = ref("");
const statusTone = ref<"neutral" | "success" | "error">("neutral");
const scanMessage = ref("");
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
const shieldedRecipientSource = ref<"none" | "qr" | "address-input">("none");
const shieldedPaymentAddressText = ref("");
let destinationResolveTimer: ReturnType<typeof setTimeout> | null = null;
let destinationResolveSequence = 0;
const persistResolvedShieldAssetDefinitionId = (
  resolvedAssetDefinitionId: string,
) => {
  const normalizedResolvedAssetDefinitionId = extractAssetDefinitionId(
    resolvedAssetDefinitionId,
  ).trim();
  if (
    !normalizedResolvedAssetDefinitionId ||
    !shouldReplaceConfiguredAssetDefinitionId({
      configuredAssetDefinitionId: session.connection.assetDefinitionId,
      detectedAssetDefinitionId: normalizedResolvedAssetDefinitionId,
      knownAssetIds: [resolvedAssetDefinitionId],
    })
  ) {
    return;
  }
  session.$patch({
    connection: {
      ...session.connection,
      assetDefinitionId: normalizedResolvedAssetDefinitionId,
    },
  });
};
const { shieldSupported, shieldCapabilityMessage, shieldResolvedAssetId } =
  useShieldCapability({
    toriiUrl: toRef(session.connection, "toriiUrl"),
    accountId: activeAccountDisplayId,
    assetDefinitionId: toRef(session.connection, "assetDefinitionId"),
    shielded: toRef(form, "shielded"),
    operation: "shieldedTransfer",
    translate: t,
    onResolvedAssetDefinitionId: persistResolvedShieldAssetDefinitionId,
  });
const resetShieldedRecipientFields = () => {
  form.shieldedReceiveKeyId = "";
  form.shieldedReceivePublicKeyBase64Url = "";
  form.shieldedOwnerTagHex = "";
  form.shieldedDiversifierHex = "";
  form.shieldedAddressAccountId = "";
  shieldedRecipientSource.value = "none";
  shieldedPaymentAddressText.value = "";
};
const applyShieldedPaymentAddress = (
  payload: ConfidentialPaymentAddressPayload,
  source: "qr" | "address-input",
  rawAddressText = "",
) => {
  const parsedAccountId = payload.accountId?.trim() ?? "";
  if (source === "qr") {
    form.destination = parsedAccountId;
  }
  if (payload.amount) {
    form.quantity = String(payload.amount);
  }
  form.shielded = true;
  form.shieldedReceiveKeyId = payload.receiveKeyId;
  form.shieldedReceivePublicKeyBase64Url = payload.receivePublicKeyBase64Url;
  form.shieldedOwnerTagHex = payload.shieldedOwnerTagHex;
  form.shieldedDiversifierHex = payload.shieldedDiversifierHex;
  form.shieldedAddressAccountId = parsedAccountId;
  shieldedRecipientSource.value = source;
  shieldedPaymentAddressText.value =
    source === "address-input" ? rawAddressText.trim() : "";
};
const scannerSheetOpen = ref(false);
const scanner = useQrScanner(
  (payload) => {
    scannerSheetOpen.value = false;
    const paymentAddress = parseConfidentialPaymentAddressText(payload);
    if (paymentAddress.ok) {
      applyShieldedPaymentAddress(paymentAddress.payload, "qr");
      scanMessage.value = t("QR decoded successfully.");
      return;
    }
    if (
      paymentAddress.reason !== "none" &&
      (paymentAddress.reason !== "invalid" ||
        payload.trim().startsWith(CONFIDENTIAL_PAYMENT_ADDRESS_PREFIX))
    ) {
      resetShieldedRecipientFields();
      if (paymentAddress.reason === "legacy") {
        form.shielded = false;
        scanMessage.value = t(
          "Legacy private Receive QR codes are no longer supported. Ask the recipient to refresh their Receive QR.",
        );
        return;
      }
      scanMessage.value = t("Private payment address is invalid.");
      return;
    }

    try {
      const parsed = JSON.parse(payload);
      const parsedAccountId = parsed.accountId
        ? String(parsed.accountId).trim()
        : "";
      if (parsedAccountId) {
        form.destination = parsedAccountId;
      }
      if (parsed.amount) {
        form.quantity = String(parsed.amount);
      }
      resetShieldedRecipientFields();
      scanMessage.value = t("QR decoded successfully.");
    } catch (err) {
      resetShieldedRecipientFields();
      scanMessage.value = t("QR payload is invalid.");
      console.warn("Invalid QR payload", err);
    }
  },
  { translate: t },
);
const scannerMessage = scanner.message;
const scannerVideoRef = scanner.videoRef;
const scannerFileInputRef = scanner.fileInputRef;
const sendIcon = SendIcon;

const sendMode = computed(() => (form.shielded ? "private" : "standard"));
const sendModeOptions = computed(() => [
  { value: "standard", label: t("Standard") },
  { value: "private", label: t("Private"), disabled: !shieldSupported.value },
]);
const setSendMode = (mode: string) => {
  form.shielded = mode === "private";
};

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
const destinationIsShieldedAddressInput = computed(
  () =>
    form.shielded &&
    hasShieldedPaymentAddress.value &&
    Boolean(shieldedPaymentAddressText.value) &&
    destinationValue.value === shieldedPaymentAddressText.value,
);
const destinationAccountIdForSubmit = computed(() =>
  destinationIsShieldedAddressInput.value
    ? form.shieldedAddressAccountId.trim()
    : resolvedDestinationAccountId.value || destinationValue.value,
);
const reviewDestinationLabel = computed(() => {
  if (form.shielded && hasShieldedPaymentAddress.value) {
    return (
      form.shieldedAddressAccountId.trim() ||
      resolvedDestinationAccountId.value ||
      t("Private address")
    );
  }
  return destinationAccountIdForSubmit.value || destinationValue.value;
});
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
    extractAssetDefinitionId(shieldResolvedAssetId.value).trim() ||
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
const activeAssetBalance = computed(() =>
  sendAssetsLoading.value ? t("—") : (activeAsset.value?.quantity ?? "0"),
);
const isTransparentAmountValid = computed(() => Number(form.quantity) > 0);
const isShieldAmountValid = computed(() =>
  isPositiveWholeAmount(normalizedQuantity.value),
);
const isDestinationValid = computed(() => {
  if (!destinationValue.value) {
    return false;
  }
  if (
    destinationResolutionMatchesContext.value &&
    destinationResolution.error
  ) {
    return false;
  }
  return true;
});
const destinationIsSelf = computed(() => {
  const destination = destinationAccountIdForSubmit.value;
  return Boolean(
    destination &&
      (destination === activeAccountDisplayId.value ||
        destination === activeAccount.value?.accountId ||
        destination === activeAccount.value?.i105AccountId),
  );
});
const submitActionLabel = computed(() =>
  form.shielded
    ? destinationIsSelf.value
      ? t("Create private balance")
      : t("Send privately")
    : t("Send"),
);
const hasV3ShieldedPaymentAddress = computed(
  () =>
    /^[A-Za-z0-9_-]{8,128}$/.test(form.shieldedReceiveKeyId.trim()) &&
    /^[A-Za-z0-9_-]+$/.test(form.shieldedReceivePublicKeyBase64Url.trim()) &&
    /^[0-9a-f]{64}$/i.test(form.shieldedOwnerTagHex.trim()) &&
    /^[0-9a-f]{64}$/i.test(form.shieldedDiversifierHex.trim()),
);
const hasShieldedPaymentAddress = computed(
  () => hasV3ShieldedPaymentAddress.value,
);

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

const handleDestinationInputChange = () => {
  const destination = destinationValue.value;
  const parsedPaymentAddress = parseConfidentialPaymentAddressText(destination);
  if (parsedPaymentAddress.ok) {
    applyShieldedPaymentAddress(
      parsedPaymentAddress.payload,
      "address-input",
      destination,
    );
    cancelDestinationResolution();
    resetDestinationResolution();
    scanMessage.value = t("Private payment address loaded.");
    return;
  }
  if (parsedPaymentAddress.reason !== "none") {
    resetShieldedRecipientFields();
    cancelDestinationResolution();
    resetDestinationResolution();
    scanMessage.value =
      parsedPaymentAddress.reason === "legacy"
        ? t(
            "Legacy private Receive QR codes are no longer supported. Ask the recipient to refresh their Receive QR.",
          )
        : t("Private payment address is invalid.");
    return;
  }

  const qrRecipientWasReplaced =
    shieldedRecipientSource.value === "qr" &&
    destination !== form.shieldedAddressAccountId.trim();
  if (
    shieldedRecipientSource.value === "address-input" ||
    qrRecipientWasReplaced
  ) {
    resetShieldedRecipientFields();
  }
  scheduleDestinationResolution();
};

watch(destinationValue, handleDestinationInputChange);

watch(
  [() => session.connection.toriiUrl, () => session.connection.networkPrefix],
  () => {
    reviewing.value = false;
    handleDestinationInputChange();
  },
  { flush: "sync" },
);

watch(
  () => [form.destination, form.quantity, form.memo, form.shielded],
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
    sendAssetsLoading.value = false;
    return;
  }
  sendAssetsLoading.value = true;
  try {
    const result = await fetchAccountAssets({
      toriiUrl,
      accountId,
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
  } catch (error) {
    if (requestSequence !== sendAssetsRequestSequence) {
      return;
    }
    console.warn("Failed to load send asset balance", error);
    sendAssets.value = [];
  } finally {
    if (requestSequence === sendAssetsRequestSequence) {
      sendAssetsLoading.value = false;
    }
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
  if (destinationResolveTimer) {
    clearTimeout(destinationResolveTimer);
  }
});

const isValid = computed(() =>
  Boolean(
    session.hasAccount &&
      activeAccount.value &&
      session.connection.assetDefinitionId &&
      (form.shielded
        ? isShieldAmountValid.value
        : isTransparentAmountValid.value) &&
      (form.shielded
        ? destinationIsSelf.value || hasShieldedPaymentAddress.value
        : isDestinationValid.value),
  ),
);

const openReview = async () => {
  if (!isValid.value || !session.connection.toriiUrl || !activeAccount.value) {
    statusMessage.value = t("Configure Torii + account first.");
    statusTone.value = "error";
    return;
  }
  if (form.shielded && !shieldSupported.value) {
    statusMessage.value =
      shieldCapabilityMessage.value || t("Shield mode is unavailable.");
    statusTone.value = "error";
    return;
  }
  const shouldResolveDestination =
    Boolean(destinationValue.value) && !destinationIsShieldedAddressInput.value;
  if (shouldResolveDestination) {
    const resolvedDestination = await resolveDestinationNow();
    if (!resolvedDestination) {
      statusMessage.value =
        destinationResolution.error || t("Unable to resolve recipient.");
      statusTone.value = "error";
      return;
    }
  }
  statusMessage.value = "";
  statusTone.value = "neutral";
  reviewing.value = true;
};

const handleSend = async () => {
  if (!reviewing.value) {
    return;
  }
  if (!isValid.value || !session.connection.toriiUrl || !activeAccount.value) {
    statusMessage.value = t("Configure Torii + account first.");
    statusTone.value = "error";
    return;
  }
  const account = activeAccount.value;
  if (form.shielded && !shieldSupported.value) {
    statusMessage.value =
      shieldCapabilityMessage.value || t("Shield mode is unavailable.");
    statusTone.value = "error";
    return;
  }
  if (form.shielded) {
    const amount = normalizedQuantity.value;
    if (!isPositiveWholeAmount(amount)) {
      statusMessage.value = t(
        "Shield amount must be a whole number greater than zero.",
      );
      statusTone.value = "error";
      return;
    }
  }
  const submitMode = form.shielded ? "shield" : "transfer";
  sending.value = true;
  statusMessage.value = "";
  statusTone.value = "neutral";
  try {
    const requiresResolvedDestination =
      Boolean(destinationValue.value) &&
      !destinationIsShieldedAddressInput.value;
    if (requiresResolvedDestination && !destinationResolutionIsUsable.value) {
      await resolveDestinationNow();
    }
    if (requiresResolvedDestination && !destinationResolutionIsUsable.value) {
      statusMessage.value =
        destinationResolution.error || t("Unable to resolve recipient.");
      statusTone.value = "error";
      return;
    }
    if (form.shielded) {
      if (!destinationIsSelf.value && !hasShieldedPaymentAddress.value) {
        statusMessage.value = t(
          "Paste a private address or scan a Receive QR before sending privately.",
        );
        statusTone.value = "error";
        return;
      }
    }
    const destinationAccountId =
      form.shielded &&
      !destinationIsSelf.value &&
      hasShieldedPaymentAddress.value
        ? form.shieldedAddressAccountId.trim() || undefined
        : destinationAccountIdForSubmit.value || undefined;
    const result = await transferAsset({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      assetDefinitionId: resolvedAssetDefinitionId.value,
      accountId: account.accountId,
      destinationAccountId,
      networkPrefix: session.connection.networkPrefix,
      quantity: normalizedQuantity.value,
      privateKeyHex: account.privateKeyHex,
      metadata: !form.shielded && form.memo ? { memo: form.memo } : undefined,
      shielded: form.shielded,
      shieldedOwnerTagHex: form.shieldedOwnerTagHex,
      shieldedDiversifierHex: form.shieldedDiversifierHex,
      shieldedRecipient:
        form.shielded && !destinationIsSelf.value
          ? {
              receiveKeyId: form.shieldedReceiveKeyId,
              receivePublicKeyBase64Url: form.shieldedReceivePublicKeyBase64Url,
              ownerTagHex: form.shieldedOwnerTagHex,
              diversifierHex: form.shieldedDiversifierHex,
            }
          : undefined,
    });
    if (submitMode === "shield") {
      session.updateActiveAccount({ localOnly: false });
    }
    const successMessage =
      submitMode === "shield"
        ? destinationIsSelf.value
          ? t("Private balance created: {hash}", {
              hash: result.hash,
            })
          : t("Private shielded transfer committed: {hash}", {
              hash: result.hash,
            })
        : t("Transaction submitted: {hash}", { hash: result.hash });
    statusMessage.value = appendTransactionFee(
      successMessage,
      result,
      t,
      transactionFeeHintForEndpoint(session.connection.toriiUrl),
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

const toggleScanner = async () => {
  scanMessage.value = "";
  if (scannerSheetOpen.value) {
    scanner.stop();
    scannerSheetOpen.value = false;
    return;
  }
  scannerSheetOpen.value = true;
  await nextTick();
  scanner.message.value = "";
  await scanner.start();
};

const closeScanner = () => {
  scanner.stop();
  scannerSheetOpen.value = false;
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

.send-tools {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.send-tools .icon-cta {
  min-width: 0;
}

.send-tools .icon-cta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.scanner-drawer {
  width: min(100%, 720px);
  justify-self: end;
  animation: send-reveal 160ms ease-out;
}

.scanner-frame {
  min-height: 280px;
  border-radius: var(--radius-panel);
  border: 1px solid var(--color-border);
  background: var(--color-media-stage);
  overflow: hidden;
  display: grid;
  place-items: center;
}

.scanner-frame.active {
  border-color: color-mix(
    in srgb,
    var(--color-accent) 46%,
    var(--color-border)
  );
}

.scanner {
  width: 100%;
  height: 100%;
  min-height: 280px;
}

video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: var(--color-media-stage);
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

.payment-mode-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
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

.private-mode-note {
  padding-inline-start: 12px;
  border-inline-start: 2px solid
    color-mix(in srgb, var(--color-accent) 62%, transparent);
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

  .send-tools {
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .send-header {
    gap: 14px;
    align-items: flex-start;
    flex-direction: column;
  }

  .send-tools {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .send-tools .icon-cta {
    width: 100%;
    justify-content: center;
    min-height: 48px;
    padding-inline: 12px;
    text-align: center;
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

  .scanner-frame,
  .scanner {
    min-height: 220px;
  }

  .send-note {
    padding: 10px 12px;
  }

  .send-review-actions {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .send-review,
  .scanner-drawer {
    animation: none;
  }
}
</style>
