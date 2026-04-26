<template>
  <section class="card receive-shell">
    <header class="card-header receive-header">
      <div>
        <h2>{{ t("Receive") }}</h2>
        <p class="helper receive-account-copy">
          {{ t("Show a fresh QR for this wallet.") }}
        </p>
      </div>
      <button class="icon-cta" :disabled="!qrDataUrl" @click="shareQr">
        <img :src="receiveIcon" alt="" />
        <span>{{ t("Share QR") }}</span>
      </button>
    </header>
    <div class="receive-layout">
      <div class="receive-context">
        <p class="helper">
          {{
            t("This QR creates a private payment address for the next sender.")
          }}
        </p>
        <details class="technical-details compact">
          <summary>{{ t("Wallet details") }}</summary>
          <div class="kv receive-account-card">
            <span class="kv-label">{{ t("I105 Account ID") }}</span>
            <span class="kv-value">{{
              shareAccountId || t("Configure account first")
            }}</span>
          </div>
        </details>
      </div>
      <div class="qr-panel" :class="{ ready: Boolean(qrMarkup) }">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="qrMarkup" class="qr" v-html="qrMarkup"></div>
        <p v-if="qrMarkup && qrMessage" class="helper receive-qr-status">
          {{ qrMessage }}
        </p>
        <p v-else class="helper receive-empty-state">
          {{ qrMessage }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import QRCode from "qrcode";
import { useAppI18n } from "@/composables/useAppI18n";
import { createConfidentialPaymentAddress } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { getPublicAccountId } from "@/utils/accountId";
import ReceiveIcon from "@/assets/receive.svg";

const session = useSessionStore();
const { t } = useAppI18n();
const activeAccount = computed(() => session.activeAccount);
const shareAccountId = computed(() =>
  getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
);
const qrMarkup = ref("");
const qrDataUrl = ref("");
const qrPayloadText = ref("");
const qrMessage = ref(t("Generating QR..."));
const qrGeneration = ref(0);
const receiveIcon = ReceiveIcon;
const QR_DARK_COLOR = "#14202b";
const QR_LIGHT_COLOR = "#ffffff";

const generateQr = async () => {
  const accountId = shareAccountId.value;
  const currentGeneration = qrGeneration.value + 1;
  qrGeneration.value = currentGeneration;

  if (!accountId) {
    qrMarkup.value = "";
    qrDataUrl.value = "";
    qrPayloadText.value = "";
    qrMessage.value = t("Configure an account before generating QR codes.");
    return;
  }
  qrMessage.value = t("Generating QR...");
  try {
    const payload = await createConfidentialPaymentAddress({
      accountId,
      privateKeyHex: activeAccount.value?.privateKeyHex,
    });
    const payloadText = JSON.stringify(payload);
    const qrOptions = {
      width: 240,
      color: {
        dark: QR_DARK_COLOR,
        light: QR_LIGHT_COLOR,
      },
    };
    const [nextQrMarkup, nextQrDataUrl] = await Promise.all([
      QRCode.toString(payloadText, {
        ...qrOptions,
        type: "svg",
      }),
      QRCode.toDataURL(payloadText, {
        ...qrOptions,
        type: "image/png",
      }),
    ]);
    if (
      currentGeneration !== qrGeneration.value ||
      shareAccountId.value !== accountId
    ) {
      return;
    }
    qrMarkup.value = nextQrMarkup;
    qrDataUrl.value = nextQrDataUrl;
    qrPayloadText.value = payloadText;
    qrMessage.value = t("QR ready.");
  } catch (error) {
    if (currentGeneration !== qrGeneration.value) {
      return;
    }
    qrMarkup.value = "";
    qrDataUrl.value = "";
    qrPayloadText.value = "";
    qrMessage.value = t("Failed to render QR.");
    console.warn("Failed to render QR", error);
  }
};

const shareQr = async () => {
  if (!qrDataUrl.value || !qrPayloadText.value) {
    qrMessage.value = t("Generating QR...");
    await generateQr();
  }
  if (!qrDataUrl.value || !qrPayloadText.value) {
    return;
  }
  try {
    const response = await fetch(qrDataUrl.value);
    const blob = await response.blob();
    const file = new File([blob], "iroha-receive-qr.png", {
      type: blob.type || "image/png",
    });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: t("Receive"),
        files: [file],
      });
      qrMessage.value = t("QR shared.");
      return;
    }
    if (navigator.share) {
      await navigator.share({
        title: t("Receive"),
        text: qrPayloadText.value,
      });
      qrMessage.value = t("QR shared.");
      return;
    }
    await navigator.clipboard.writeText(qrPayloadText.value);
    qrMessage.value = t("QR payload copied to clipboard.");
  } catch (error) {
    qrMessage.value = t("QR share failed.");
    console.warn("Failed to share QR", error);
  }
};

watch(
  () => shareAccountId.value,
  () => {
    void generateQr();
  },
  { immediate: true },
);
</script>

<style scoped>
.receive-header {
  align-items: flex-start;
}

.receive-account-copy {
  margin-top: 4px;
  word-break: break-all;
  unicode-bidi: plaintext;
}

.receive-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.88fr) minmax(320px, 1.12fr);
  gap: 20px;
  align-items: start;
}

.receive-context {
  display: grid;
  gap: 16px;
  align-content: start;
}

.receive-account-card {
  margin: 0;
}

.receive-amount {
  max-width: 260px;
}

.qr-panel {
  min-height: 280px;
  border-radius: 20px;
  border: 1px solid var(--glass-border);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 72%),
    rgba(255, 255, 255, 0.03);
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  padding: 20px;
}

.qr-panel.ready {
  border-color: rgba(255, 76, 102, 0.42);
  box-shadow: 0 18px 36px rgba(255, 76, 102, 0.14);
}

.qr {
  max-width: min(312px, 100%);
  display: grid;
  place-items: center;
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(20, 32, 43, 0.16);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), #f7f2ec);
  box-shadow:
    0 18px 34px rgba(11, 17, 24, 0.18),
    inset 0 0 0 1px rgba(255, 255, 255, 0.82);
}

.qr :deep(svg) {
  width: min(280px, 100%);
  height: auto;
  display: block;
}

.receive-empty-state {
  max-width: 320px;
  text-align: center;
}

.receive-qr-status {
  margin: 0;
  text-align: center;
}

@media (max-width: 960px) {
  .receive-layout {
    grid-template-columns: 1fr;
  }

  .receive-amount {
    max-width: none;
  }
}

@media (max-width: 720px) {
  .receive-header {
    gap: 14px;
  }

  .receive-header .icon-cta {
    width: 100%;
    justify-content: center;
  }

  .receive-context {
    gap: 14px;
  }

  .qr-panel {
    min-height: 220px;
    padding: 16px;
  }

  .receive-empty-state {
    max-width: none;
  }
}
</style>
