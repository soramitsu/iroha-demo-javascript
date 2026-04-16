<template>
  <section class="card send-shell">
    <header class="card-header send-header">
      <div>
        <h2>{{ t("Transfer Asset") }}</h2>
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
            scanner.scanning ? t("Stop Scanner") : t("Scan QR Code")
          }}</span>
        </button>
        <button class="icon-cta secondary" @click="scanner.openFilePicker">
          <img :src="sendIcon" alt="" />
          <span>{{ t("Upload QR Image") }}</span>
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
            <span class="kv-label">{{ t("Active account") }}</span>
            <span class="kv-value">{{
              activeAccountDisplayId || t("Configure account first")
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Asset Definition ID") }}</span>
            <span class="kv-value">{{ activeAssetLabel }}</span>
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
            <span class="scanner-title">{{ t("Scan QR Code") }}</span>
            <span class="scanner-sub">{{ t("Upload QR Image") }}</span>
          </div>
        </div>
      </div>

      <div class="send-form-pane">
        <div class="form-grid send-form">
          <label>
            {{ t("Destination Account ID") }}
            <input
              v-model="form.destination"
              data-testid="destination-account-input"
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
                "Shielded sends do not publish memos. Scan the recipient Receive QR so the encrypted note can be delivered.",
              )
            }}
          </p>
          <label class="shield-option">
            <input
              v-model="form.shielded"
              type="checkbox"
              :disabled="!shieldSupported"
            />
            <span>{{ t("Anonymous shielded send") }}</span>
          </label>
        </div>
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
            v-if="
              form.shielded &&
              shieldSupported &&
              shieldPolicyMode &&
              !shieldCapabilityMessage
            "
            class="helper send-note"
          >
            {{ t("Shield policy mode: {mode}.", { mode: shieldPolicyMode }) }}
          </p>
          <p
            v-if="
              form.shielded && !destinationIsSelf && !hasShieldedPaymentAddress
            "
            class="helper send-note"
          >
            {{
              t(
                "Scan a shielded Receive QR for this destination before sending anonymously.",
              )
            }}
          </p>
          <p
            v-if="
              !form.shielded &&
              shieldSupported &&
              shieldPolicyMode &&
              !shieldCapabilityMessage
            "
            class="helper send-note"
          >
            {{
              t(
                "Shielding is optional. Leave it off to avoid shield transactions, but you will not get privacy for this transfer.",
              )
            }}
          </p>
          <p v-if="statusMessage" class="helper send-note">
            {{ statusMessage }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref, computed, toRef } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { transferAsset } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { useQrScanner } from "@/composables/useQrScanner";
import { useShieldCapability } from "@/composables/useShieldCapability";
import { isPositiveWholeAmount } from "@/utils/confidential";
import { getPublicAccountId } from "@/utils/accountId";
import {
  extractAssetDefinitionId,
  formatAssetDefinitionLabel,
  shouldReplaceConfiguredAssetDefinitionId,
} from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import SendIcon from "@/assets/send.svg";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const { t } = useAppI18n();
const activeAccountDisplayId = computed(() =>
  getPublicAccountId(activeAccount.value),
);
const activeAssetLabel = computed(() =>
  formatAssetDefinitionLabel(session.connection.assetDefinitionId, t("—")),
);
const form = reactive({
  destination: "",
  quantity: "0",
  memo: "",
  shielded: false,
  shieldedOwnerTagHex: "",
  shieldedDiversifierHex: "",
  shieldedAddressAccountId: "",
});
const sending = ref(false);
const statusMessage = ref("");
const scanMessage = ref("");
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
const {
  shieldSupported,
  shieldCapabilityMessage,
  shieldPolicyMode,
  shieldResolvedAssetId,
} = useShieldCapability({
  toriiUrl: toRef(session.connection, "toriiUrl"),
  accountId: activeAccountDisplayId,
  assetDefinitionId: toRef(session.connection, "assetDefinitionId"),
  shielded: toRef(form, "shielded"),
  operation: "shieldedTransfer",
  translate: t,
  onResolvedAssetDefinitionId: persistResolvedShieldAssetDefinitionId,
});
const scanner = useQrScanner(
  (payload) => {
    try {
      const parsed = JSON.parse(payload);
      const parsedAccountId = parsed.accountId
        ? String(parsed.accountId).trim()
        : "";
      if (parsed.accountId) {
        form.destination = parsedAccountId;
      }
      if (parsed.amount) {
        form.quantity = String(parsed.amount);
      }
      if (parsed.shieldedOwnerTagHex || parsed.ownerTagHex) {
        form.shieldedOwnerTagHex = String(
          parsed.shieldedOwnerTagHex ?? parsed.ownerTagHex,
        ).trim();
      }
      if (parsed.shieldedDiversifierHex || parsed.diversifierHex) {
        form.shieldedDiversifierHex = String(
          parsed.shieldedDiversifierHex ?? parsed.diversifierHex,
        ).trim();
      }
      if (
        parsed.schema === "iroha-confidential-payment-address/v2" ||
        parsed.shieldedOwnerTagHex ||
        parsed.shieldedDiversifierHex
      ) {
        form.shielded = true;
        form.shieldedAddressAccountId = parsedAccountId;
      }
      scanMessage.value = t("QR decoded successfully.");
    } catch (err) {
      scanMessage.value = t("QR payload is invalid.");
      console.warn("Invalid QR payload", err);
    }
  },
  { translate: t },
);
const sendIcon = SendIcon;

const submitActionLabel = computed(() =>
  form.shielded ? t("Send anonymously") : t("Send"),
);

const normalizedQuantity = computed(() => String(form.quantity).trim());
const destinationValue = computed(() => form.destination.trim());
const resolvedAssetDefinitionId = computed(
  () =>
    extractAssetDefinitionId(shieldResolvedAssetId.value).trim() ||
    extractAssetDefinitionId(session.connection.assetDefinitionId).trim() ||
    session.connection.assetDefinitionId.trim(),
);
const isTransparentAmountValid = computed(() => Number(form.quantity) > 0);
const isShieldAmountValid = computed(() =>
  isPositiveWholeAmount(normalizedQuantity.value),
);
const isDestinationValid = computed(() => Boolean(destinationValue.value));
const destinationIsSelf = computed(() => {
  const destination = destinationValue.value;
  return Boolean(
    destination &&
      (destination === activeAccountDisplayId.value ||
        destination === activeAccount.value?.accountId ||
        destination === activeAccount.value?.i105AccountId),
  );
});
const hasShieldedPaymentAddress = computed(
  () =>
    /^[0-9a-f]{64}$/i.test(form.shieldedOwnerTagHex.trim()) &&
    /^[0-9a-f]{64}$/i.test(form.shieldedDiversifierHex.trim()) &&
    form.shieldedAddressAccountId === destinationValue.value,
);

const isValid = computed(() =>
  Boolean(
    session.hasAccount &&
      activeAccount.value &&
      session.connection.assetDefinitionId &&
      (form.shielded
        ? isShieldAmountValid.value
        : isTransparentAmountValid.value) &&
      isDestinationValid.value &&
      (!form.shielded ||
        destinationIsSelf.value ||
        hasShieldedPaymentAddress.value),
  ),
);

const handleSend = async () => {
  if (!isValid.value || !session.connection.toriiUrl || !activeAccount.value) {
    statusMessage.value = t("Configure Torii + account first.");
    return;
  }
  const account = activeAccount.value;
  if (form.shielded && !shieldSupported.value) {
    statusMessage.value =
      shieldCapabilityMessage.value || t("Shield mode is unavailable.");
    return;
  }
  if (form.shielded) {
    const amount = normalizedQuantity.value;
    if (!isPositiveWholeAmount(amount)) {
      statusMessage.value = t(
        "Shield amount must be a whole number greater than zero.",
      );
      return;
    }
    if (!destinationIsSelf.value && !hasShieldedPaymentAddress.value) {
      statusMessage.value = t(
        "Scan a shielded Receive QR for this destination before sending anonymously.",
      );
      return;
    }
  }
  const submitMode = form.shielded ? "shield" : "transfer";
  sending.value = true;
  statusMessage.value = "";
  try {
    const result = await transferAsset({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      assetDefinitionId: resolvedAssetDefinitionId.value,
      accountId: account.accountId,
      destinationAccountId: destinationValue.value,
      quantity: normalizedQuantity.value,
      privateKeyHex: account.privateKeyHex,
      metadata: !form.shielded && form.memo ? { memo: form.memo } : undefined,
      shielded: form.shielded,
      shieldedOwnerTagHex: form.shieldedOwnerTagHex,
      shieldedDiversifierHex: form.shieldedDiversifierHex,
    });
    if (submitMode === "shield") {
      session.updateActiveAccount({ localOnly: false });
    }
    statusMessage.value =
      submitMode === "shield"
        ? t("Anonymous shielded transaction committed: {hash}", {
            hash: result.hash,
          })
        : t("Transaction submitted: {hash}", { hash: result.hash });
  } catch (error) {
    statusMessage.value = toUserFacingErrorMessage(
      error,
      t("Transaction failed."),
    );
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

.send-account-copy {
  margin-top: 4px;
  word-break: break-all;
  unicode-bidi: plaintext;
}

.send-layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.92fr) minmax(360px, 1.08fr);
  gap: 20px;
  align-items: start;
}

.send-context,
.send-form-pane {
  display: grid;
  gap: 16px;
  align-content: start;
}

.send-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
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
}

.send-note {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.03);
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
