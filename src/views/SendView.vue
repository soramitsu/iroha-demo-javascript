<template>
  <section class="card">
    <header class="card-header">
      <h2>{{ t("Transfer Asset") }}</h2>
      <div class="actions-row">
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
    <div v-if="scanner.scanning" class="scanner">
      <video ref="scanner.videoRef" autoplay muted playsinline></video>
    </div>
    <div class="form-grid">
      <label>
        {{ t("Destination Account ID") }}
        <input
          v-model="form.destination"
          :placeholder="t('n42u... (I105 account ID)')"
          :disabled="destinationLocked"
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
      <label>
        {{ t("Memo (optional)") }}
        <input v-model="form.memo" :placeholder="t('Thanks for lunch')" />
      </label>
      <label class="shield-option">
        <input
          v-model="form.shielded"
          type="checkbox"
          :disabled="!shieldSupported"
        />
        <span>{{ t("Shield transfer") }}</span>
      </label>
    </div>
    <div class="actions">
      <button :disabled="sending || !isValid" @click="handleSend">
        {{ sending ? t("Submitting…") : submitActionLabel }}
      </button>
    </div>
    <p v-if="scanMessage || scanner.message" class="helper">
      {{ scanMessage || scanner.message }}
    </p>
    <p v-if="shieldCapabilityMessage" class="helper">
      {{ shieldCapabilityMessage }}
    </p>
    <p
      v-if="shieldSupported && shieldPolicyMode && !shieldCapabilityMessage"
      class="helper"
    >
      {{ t("Shield policy mode: {mode}.", { mode: shieldPolicyMode }) }}
    </p>
    <p v-if="form.shielded" class="helper">
      {{
        t(
          "Shield mode currently supports self-shielding only. Destination must be your own account, and amount must be a whole number in base units.",
        )
      }}
    </p>
    <p v-if="statusMessage" class="helper">{{ statusMessage }}</p>
  </section>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref, computed, toRef } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { transferAsset } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { useQrScanner } from "@/composables/useQrScanner";
import { useShieldedDestinationLock } from "@/composables/useShieldedDestinationLock";
import { useShieldCapability } from "@/composables/useShieldCapability";
import { isPositiveWholeAmount } from "@/utils/confidential";
import SendIcon from "@/assets/send.svg";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const { t } = useAppI18n();
const form = reactive({
  destination: "",
  quantity: "0",
  memo: "",
  shielded: false,
});
const sending = ref(false);
const statusMessage = ref("");
const scanMessage = ref("");
const { shieldSupported, shieldCapabilityMessage, shieldPolicyMode } =
  useShieldCapability({
    toriiUrl: toRef(session.connection, "toriiUrl"),
    assetDefinitionId: toRef(session.connection, "assetDefinitionId"),
    shielded: toRef(form, "shielded"),
    translate: t,
  });
const scanner = useQrScanner(
  (payload) => {
    try {
      const parsed = JSON.parse(payload);
      if (parsed.accountId) {
        if (!form.shielded) {
          form.destination = parsed.accountId;
        }
      }
      if (parsed.amount) {
        form.quantity = String(parsed.amount);
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

const { destinationLocked } = useShieldedDestinationLock({
  shielded: toRef(form, "shielded"),
  destination: toRef(form, "destination"),
  accountId: computed(() => activeAccount.value?.accountId),
});
const submitActionLabel = computed(() =>
  form.shielded ? t("Shield") : t("Send"),
);

const normalizedQuantity = computed(() => String(form.quantity).trim());
const destinationValue = computed(() => form.destination.trim());
const isTransparentAmountValid = computed(() => Number(form.quantity) > 0);
const isShieldAmountValid = computed(() =>
  isPositiveWholeAmount(normalizedQuantity.value),
);
const isDestinationValid = computed(() => {
  if (!form.shielded) {
    return Boolean(destinationValue.value);
  }
  return Boolean(
    activeAccount.value &&
      destinationValue.value === activeAccount.value.accountId,
  );
});

const isValid = computed(() =>
  Boolean(
    session.hasAccount &&
      activeAccount.value &&
      session.connection.assetDefinitionId &&
      (form.shielded
        ? isShieldAmountValid.value
        : isTransparentAmountValid.value) &&
      isDestinationValid.value,
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
    if (destinationValue.value !== account.accountId) {
      statusMessage.value = t(
        "Shield mode requires destination to be your active account.",
      );
      return;
    }
    if (!isPositiveWholeAmount(amount)) {
      statusMessage.value = t(
        "Shield amount must be a whole number greater than zero.",
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
      assetDefinitionId: session.connection.assetDefinitionId,
      accountId: account.accountId,
      destinationAccountId: destinationValue.value,
      quantity: normalizedQuantity.value,
      privateKeyHex: account.privateKeyHex,
      metadata: form.memo ? { memo: form.memo } : undefined,
      shielded: form.shielded,
    });
    statusMessage.value =
      submitMode === "shield"
        ? t("Shield transaction submitted: {hash}", { hash: result.hash })
        : t("Transaction submitted: {hash}", { hash: result.hash });
  } catch (error) {
    statusMessage.value =
      error instanceof Error ? error.message : String(error);
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
.scanner {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 16px;
}

video {
  width: 100%;
  background: black;
}

.shield-option {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.shield-option input[type="checkbox"] {
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  border-radius: 6px;
  box-shadow: none;
}
</style>
