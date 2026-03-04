<template>
  <section class="card">
    <header class="card-header">
      <h2>Transfer Asset</h2>
      <div class="actions-row">
        <button class="icon-cta" @click="toggleScanner">
          <img :src="sendIcon" alt="" />
          <span>{{ scanner.scanning ? "Stop Scanner" : "Scan QR Code" }}</span>
        </button>
        <button class="icon-cta secondary" @click="scanner.openFilePicker">
          <img :src="sendIcon" alt="" />
          <span>Upload QR Image</span>
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
        Destination Account ID
        <input
          v-model="form.destination"
          placeholder="34m... or 0x...@wonderland"
        />
      </label>
      <label>
        Amount
        <input v-model="form.quantity" type="number" min="0" step="0.01" />
      </label>
      <label>
        Memo (optional)
        <input v-model="form.memo" placeholder="Thanks for lunch" />
      </label>
      <label class="shield-option">
        <input
          v-model="form.shielded"
          type="checkbox"
          :disabled="!shieldSupported"
        />
        <span>Shield transfer</span>
      </label>
    </div>
    <div class="actions">
      <button :disabled="sending || !isValid" @click="handleSend">
        {{ sending ? "Submitting…" : "Send" }}
      </button>
    </div>
    <p v-if="scanMessage || scanner.message" class="helper">
      {{ scanMessage || scanner.message }}
    </p>
    <p v-if="shieldCapabilityMessage" class="helper">
      {{ shieldCapabilityMessage }}
    </p>
    <p v-if="form.shielded" class="helper">
      Shield mode currently supports self-shielding only. Destination must be
      your own account, and amount must be a whole number in base units.
    </p>
    <p v-if="statusMessage" class="helper">{{ statusMessage }}</p>
  </section>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref, computed, watch } from "vue";
import { getConfidentialAssetPolicy, transferAsset } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { useQrScanner } from "@/composables/useQrScanner";
import SendIcon from "@/assets/send.svg";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const form = reactive({
  destination: "",
  quantity: "0",
  memo: "",
  shielded: false,
});
const sending = ref(false);
const statusMessage = ref("");
const scanMessage = ref("");
const shieldSupported = ref(true);
const shieldCapabilityMessage = ref("");
const scanner = useQrScanner((payload) => {
  try {
    const parsed = JSON.parse(payload);
    if (parsed.accountId) {
      form.destination = parsed.accountId;
    }
    if (parsed.amount) {
      form.quantity = String(parsed.amount);
    }
    scanMessage.value = "QR decoded successfully.";
  } catch (err) {
    scanMessage.value = "QR payload is invalid.";
    console.warn("Invalid QR payload", err);
  }
});
const sendIcon = SendIcon;

const normalizeShieldMode = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const supportsShieldMode = (mode: string) => {
  const normalized = normalizeShieldMode(mode);
  return (
    normalized === "shieldedonly" ||
    normalized === "convertible" ||
    normalized === "hybrid" ||
    normalized === "zknative"
  );
};

const isValid = computed(() =>
  Boolean(
    session.hasAccount &&
      activeAccount.value &&
      session.connection.assetDefinitionId &&
      Number(form.quantity) > 0 &&
      form.destination,
  ),
);

const refreshShieldCapability = async () => {
  shieldCapabilityMessage.value = "";
  shieldSupported.value = true;
  if (!session.connection.toriiUrl || !session.connection.assetDefinitionId) {
    return;
  }
  try {
    const policy = await getConfidentialAssetPolicy({
      toriiUrl: session.connection.toriiUrl,
      assetDefinitionId: session.connection.assetDefinitionId,
    });
    const effectiveMode = policy.effective_mode || policy.current_mode;
    if (!supportsShieldMode(effectiveMode)) {
      shieldSupported.value = false;
      form.shielded = false;
      shieldCapabilityMessage.value = `Shield mode unavailable: effective policy mode is ${effectiveMode}.`;
    }
  } catch (error) {
    shieldSupported.value = true;
    shieldCapabilityMessage.value =
      error instanceof Error
        ? `Shield policy check failed: ${error.message}. Submission may still fail if shield mode is unsupported.`
        : "Shield policy check failed. Submission may still fail if shield mode is unsupported.";
  }
};

watch(
  () => [session.connection.toriiUrl, session.connection.assetDefinitionId],
  () => {
    void refreshShieldCapability();
  },
  { immediate: true },
);

const handleSend = async () => {
  if (!isValid.value || !session.connection.toriiUrl || !activeAccount.value) {
    statusMessage.value = "Configure Torii + account first.";
    return;
  }
  const account = activeAccount.value;
  if (form.shielded && !shieldSupported.value) {
    statusMessage.value =
      shieldCapabilityMessage.value || "Shield mode is unavailable.";
    return;
  }
  if (form.shielded) {
    const amount = String(form.quantity).trim();
    if (form.destination.trim() !== account.accountId) {
      statusMessage.value =
        "Shield mode requires destination to be your active account.";
      return;
    }
    if (!/^\d+$/.test(amount) || /^0+$/.test(amount)) {
      statusMessage.value =
        "Shield amount must be a whole number greater than zero.";
      return;
    }
  }
  sending.value = true;
  statusMessage.value = "";
  try {
    const result = await transferAsset({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      assetDefinitionId: session.connection.assetDefinitionId,
      accountId: account.accountId,
      destinationAccountId: form.destination,
      quantity: String(form.quantity),
      privateKeyHex: account.privateKeyHex,
      metadata: form.memo ? { memo: form.memo } : undefined,
      shielded: form.shielded,
    });
    statusMessage.value = `Transaction submitted: ${result.hash}`;
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
