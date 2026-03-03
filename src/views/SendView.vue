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
    </div>
    <div class="actions">
      <button :disabled="sending || !isValid" @click="handleSend">
        {{ sending ? "Submitting…" : "Send" }}
      </button>
    </div>
    <p v-if="scanMessage || scanner.message" class="helper">
      {{ scanMessage || scanner.message }}
    </p>
    <p v-if="statusMessage" class="helper">{{ statusMessage }}</p>
  </section>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref, computed } from "vue";
import { transferAsset } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { useQrScanner } from "@/composables/useQrScanner";
import SendIcon from "@/assets/send.svg";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const form = reactive({
  destination: "",
  quantity: "0",
  memo: "",
});
const sending = ref(false);
const statusMessage = ref("");
const scanMessage = ref("");
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

const isValid = computed(() =>
  Boolean(
    session.hasAccount &&
      activeAccount.value &&
      session.connection.assetDefinitionId &&
      Number(form.quantity) > 0 &&
      form.destination,
  ),
);

const handleSend = async () => {
  if (!isValid.value || !session.connection.toriiUrl || !activeAccount.value) {
    statusMessage.value = "Configure Torii + account first.";
    return;
  }
  const account = activeAccount.value;
  sending.value = true;
  statusMessage.value = "";
  try {
    const result = await transferAsset({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      assetDefinitionId: session.connection.assetDefinitionId,
      accountId: account.accountId,
      destinationAccountId: form.destination,
      quantity: form.quantity,
      privateKeyHex: account.privateKeyHex,
      metadata: form.memo ? { memo: form.memo } : undefined,
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
</style>
