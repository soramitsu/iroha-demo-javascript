<template>
  <section class="card send-shell">
    <header class="card-header send-header">
      <div>
        <h2>{{ t("Send") }}</h2>
        <p class="helper send-account-copy">
          {{
            activeAccount?.displayName ||
            activeAccount?.i105AccountId ||
            activeAccount?.accountId ||
            t("Configure account first")
          }}
        </p>
      </div>
      <div class="actions-row send-tools">
        <button class="icon-cta" @click="toggleScanner">
          <img :src="sendIcon" alt="" />
          <span>{{
            scanner.scanning ? t("Stop scanner") : t("Scan payment QR")
          }}</span>
        </button>
        <button class="icon-cta secondary" @click="scanner.openFilePicker">
          <img :src="sendIcon" alt="" />
          <span>{{ t("Upload QR image") }}</span>
        </button>
        <input
          ref="scanner.fileInputRef"
          type="file"
          accept="image/*"
          class="sr-only"
          @change="scanner.decodeFile"
        />
      </div>
    </header>
    <div class="send-layout">
      <div class="send-context">
        <div class="send-kpis">
          <div class="kv">
            <span class="kv-label">{{ t("From") }}</span>
            <span class="kv-value">{{
              activeAccountDisplayId || t("Configure account first")
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Asset") }}</span>
            <span class="kv-value">{{ activeAssetLabel }}</span>
            <span v-if="activeAssetAlias" class="send-kpi-sub">
              {{ activeAssetCanonicalLabel }}
            </span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Balance") }}</span>
            <span class="kv-value">{{ activeAssetBalance }}</span>
            <span class="send-kpi-sub">{{ activeAssetLabel }}</span>
          </div>
        </div>
        <div
          class="scanner-frame"
          :class="{ active: scanner.scanning, idle: !scanner.scanning }"
        >
          <div v-if="scanner.scanning" class="scanner">
            <video ref="scanner.videoRef" autoplay muted playsinline></video>
          </div>
          <div v-else class="scanner-idle">
            <span class="scanner-title">{{ t("Scan payment QR") }}</span>
            <span class="scanner-sub">{{ t("or upload a QR image") }}</span>
          </div>
        </div>
      </div>

      <div class="send-form-pane">
        <div
          class="payment-mode-toggle"
          role="group"
          :aria-label="t('Send mode')"
        >
          <button
            type="button"
            class="secondary"
            :class="{ active: !form.shielded }"
            @click="form.shielded = false"
          >
            {{ t("Standard") }}
          </button>
          <button
            type="button"
            class="secondary"
            :class="{ active: form.shielded }"
            :disabled="!shieldSupported"
            @click="form.shielded = true"
          >
            {{ t("Private") }}
          </button>
        </div>
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
          <p v-else class="helper send-note">
            {{
              t(
                "Private transfers use a recipient private address or Receive QR and do not include memos.",
              )
            }}
          </p>
          <label class="shield-option">
            <input
              v-model="form.shielded"
              type="checkbox"
              :disabled="!shieldSupported"
            />
            <span>{{ t("Private transfer") }}</span>
          </label>
        </div>
        <p class="transaction-fee-note">
          <span>{{ t("Fee") }}</span>
          <strong>{{ formatTransactionFee(null, t) }}</strong>
        </p>
        <div class="actions">
          <button :disabled="sending || !isValid" @click="handleSend">
            {{ sending ? t("Submitting…") : submitActionLabel }}
          </button>
        </div>
        <div class="send-feedback">
          <p v-if="scanMessage || scanner.message" class="helper send-note">
            {{ scanMessage || scanner.message }}
          </p>
          <p v-if="shieldCapabilityMessage" class="helper send-note">
            {{ shieldCapabilityMessage }}
          </p>
          <p
            v-if="destinationResolutionMessage"
            class="helper send-note recipient-resolution"
            :class="{ error: destinationResolution.error }"
          >
            {{ destinationResolutionMessage }}
          </p>
          <p
            v-if="
              form.shielded && !destinationIsSelf && !hasShieldedPaymentAddress
            "
            class="helper send-note"
          >
            {{
              t(
                "Paste a private address or scan a Receive QR before sending privately.",
              )
            }}
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
const statusMessage = ref("");
const statusTone = ref<"neutral" | "success" | "error">("neutral");
const scanMessage = ref("");
const destinationResolution = reactive({
  input: "",
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
const scanner = useQrScanner(
  (payload) => {
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
const sendIcon = SendIcon;

const normalizedQuantity = computed(() => String(form.quantity).trim());
const destinationValue = computed(() => form.destination.trim());
const destinationResolutionMatchesInput = computed(
  () => destinationResolution.input === destinationValue.value,
);
const resolvedDestinationAccountId = computed(() =>
  destinationResolutionMatchesInput.value
    ? destinationResolution.accountId
    : "",
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
const destinationResolutionMessage = computed(() => {
  if (!destinationResolutionMatchesInput.value) {
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
  if (destinationResolutionMatchesInput.value && destinationResolution.error) {
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
  if (!destination) {
    resetDestinationResolution();
    return "";
  }
  destinationResolution.input = destination;
  destinationResolution.resolving = true;
  destinationResolution.error = "";
  try {
    const result = await resolveAccountAlias({
      toriiUrl: session.connection.toriiUrl,
      alias: destination,
      networkPrefix: session.connection.networkPrefix,
    });
    if (sequence !== destinationResolveSequence) {
      return "";
    }
    destinationResolution.input = destination;
    destinationResolution.accountId = result.accountId;
    destinationResolution.alias = result.alias || destination;
    destinationResolution.resolved = result.resolved;
    destinationResolution.error = "";
    return result.accountId;
  } catch (error) {
    if (sequence !== destinationResolveSequence) {
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
    if (sequence === destinationResolveSequence) {
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

watch(
  [
    destinationValue,
    () => session.connection.toriiUrl,
    () => session.connection.networkPrefix,
  ],
  handleDestinationInputChange,
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

const handleSend = async () => {
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
    const shouldResolveDestination =
      Boolean(destinationValue.value) &&
      !destinationIsShieldedAddressInput.value;
    const resolvedDestination = shouldResolveDestination
      ? await resolveDestinationNow()
      : "";
    if (shouldResolveDestination && !resolvedDestination) {
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
    statusMessage.value = appendTransactionFee(successMessage, result, t);
    statusTone.value = "success";
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
  await nextTick();
  scanner.message.value = "";
  scanner.start();
};
</script>

<style scoped>
.send-header {
  align-items: flex-start;
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
  margin-top: 4px;
  word-break: break-all;
  unicode-bidi: plaintext;
}

.send-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: 20px;
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

.send-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.send-kpi-sub {
  min-width: 0;
  color: var(--iroha-muted);
  font-size: 0.78rem;
  overflow-wrap: anywhere;
  unicode-bidi: plaintext;
}

.scanner-frame {
  min-height: 248px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent 68%),
    rgba(0, 0, 0, 0.18);
  overflow: hidden;
  display: grid;
  place-items: center;
}

.scanner-frame.active {
  border-color: rgba(255, 76, 102, 0.42);
  box-shadow: 0 18px 36px rgba(255, 76, 102, 0.14);
}

.scanner {
  width: 100%;
  height: 100%;
  min-height: 248px;
}

.scanner-idle {
  display: grid;
  gap: 8px;
  justify-items: center;
  text-align: center;
  padding: 24px;
  color: var(--iroha-muted);
}

.scanner-title {
  font-weight: 700;
  color: inherit;
}

.scanner-sub {
  font-size: 0.84rem;
}

video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: black;
}

.send-form {
  gap: 14px;
}

.send-form label,
.send-form input {
  min-width: 0;
}

.send-form input {
  width: 100%;
}

.payment-mode-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 6px;
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.04);
}

.payment-mode-toggle button {
  box-shadow: none;
}

.payment-mode-toggle button.active {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(
    120deg,
    rgba(255, 75, 75, 0.92),
    rgba(255, 102, 139, 0.88)
  );
  box-shadow: 0 12px 22px rgba(255, 76, 102, 0.22);
}

.shield-option {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.03);
}

.shield-option input[type="checkbox"] {
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  border-radius: 6px;
  box-shadow: none;
}

.send-feedback {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.send-note {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.03);
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.send-status {
  color: var(--iroha-muted);
}

.send-status-success {
  color: #bbf7d0;
  border-color: rgba(34, 197, 94, 0.46);
  background:
    linear-gradient(135deg, rgba(34, 197, 94, 0.16), transparent 70%),
    rgba(34, 197, 94, 0.08);
  box-shadow: inset 3px 0 0 rgba(34, 197, 94, 0.72);
}

.send-status-error {
  color: #fecdd3;
  border-color: rgba(255, 93, 113, 0.62);
  background:
    linear-gradient(135deg, rgba(255, 76, 102, 0.2), transparent 70%),
    rgba(255, 76, 102, 0.1);
  box-shadow: inset 3px 0 0 rgba(255, 76, 102, 0.82);
}

:global(:root[data-theme="light"]) .send-status-success {
  color: #166534;
  background:
    linear-gradient(135deg, rgba(22, 163, 74, 0.12), transparent 70%),
    rgba(22, 163, 74, 0.08);
}

:global(:root[data-theme="light"]) .send-status-error {
  color: #9f1239;
  background:
    linear-gradient(135deg, rgba(225, 29, 72, 0.12), transparent 70%),
    rgba(225, 29, 72, 0.08);
}

.recipient-resolution {
  word-break: break-all;
  unicode-bidi: plaintext;
}

.recipient-resolution.error {
  border-color: rgba(255, 93, 113, 0.5);
}

@media (max-width: 1080px) {
  .send-layout {
    grid-template-columns: 1fr;
  }

  .send-form-pane {
    order: -1;
  }

  .send-tools {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .send-header {
    gap: 14px;
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
    min-height: 56px;
    padding-inline: 12px;
    text-align: center;
  }

  .send-kpis {
    grid-template-columns: 1fr;
  }

  .send-context {
    gap: 12px;
  }

  .scanner-frame.idle {
    display: none;
  }

  .scanner-frame,
  .scanner {
    min-height: 220px;
  }

  .send-note {
    padding: 10px 12px;
  }
}
</style>
