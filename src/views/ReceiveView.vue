<template>
  <section class="receive-shell">
    <div class="receive-layout">
      <div class="receive-qr-workspace">
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
        <div class="actions-row receive-actions">
          <button
            class="icon-cta secondary"
            :disabled="!privateAddressText"
            @click="copyAddress"
          >
            <img :src="receiveIcon" alt="" />
            <span>{{ t("Copy address") }}</span>
          </button>
          <button class="icon-cta" :disabled="!qrDataUrl" @click="shareQr">
            <img :src="receiveIcon" alt="" />
            <span>{{ t("Share QR") }}</span>
          </button>
        </div>
      </div>

      <aside class="receive-context">
        <header class="receive-intro">
          <p class="receive-kicker">{{ t("Private address") }}</p>
          <p class="receive-lead">
            {{
              t(
                "This QR creates a private payment address for the next sender.",
              )
            }}
          </p>
          <p class="helper receive-account-copy">
            {{ t("Show a fresh QR for this wallet.") }}
          </p>
        </header>
        <TechnicalDisclosure
          class="receive-address-details"
          :summary="t('Private address')"
        >
          <label class="private-address-field">
            <span>{{ t("Private address") }}</span>
            <textarea
              readonly
              rows="4"
              :value="privateAddressText"
              @focus="selectAddressText"
            ></textarea>
          </label>
        </TechnicalDisclosure>
        <TechnicalDisclosure
          class="receive-wallet-details"
          :summary="t('Wallet details')"
        >
          <div class="receive-account-card">
            <span class="kv-label">{{ t("I105 Account ID") }}</span>
            <span class="kv-value">{{
              shareAccountId || t("Configure account first")
            }}</span>
          </div>
        </TechnicalDisclosure>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import QRCode from "qrcode";
import { TechnicalDisclosure } from "@/components/ui";
import { useAppI18n } from "@/composables/useAppI18n";
import { createConfidentialPaymentAddress } from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { getPublicAccountId } from "@/utils/accountId";
import { encodeConfidentialPaymentAddress } from "@/utils/confidentialPaymentAddress";
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
const privateAddressText = ref("");
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
    privateAddressText.value = "";
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
    const addressText = encodeConfidentialPaymentAddress(payload);
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
    privateAddressText.value = addressText;
    qrMessage.value = t("QR ready.");
  } catch (error) {
    if (currentGeneration !== qrGeneration.value) {
      return;
    }
    qrMarkup.value = "";
    qrDataUrl.value = "";
    qrPayloadText.value = "";
    privateAddressText.value = "";
    qrMessage.value = t("Failed to render QR.");
    console.warn("Failed to render QR", error);
  }
};

const copyAddress = async () => {
  if (!privateAddressText.value) {
    qrMessage.value = t("Generating QR...");
    await generateQr();
  }
  if (!privateAddressText.value) {
    return;
  }
  try {
    await navigator.clipboard.writeText(privateAddressText.value);
    qrMessage.value = t("Private address copied.");
  } catch (error) {
    qrMessage.value = t("Private address copy failed.");
    console.warn("Failed to copy private address", error);
  }
};

const shareQr = async () => {
  if (!qrDataUrl.value || !privateAddressText.value) {
    qrMessage.value = t("Generating QR...");
    await generateQr();
  }
  if (!qrDataUrl.value || !privateAddressText.value) {
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
        text: privateAddressText.value,
      });
      qrMessage.value = t("QR shared.");
      return;
    }
    await navigator.clipboard.writeText(privateAddressText.value);
    qrMessage.value = t("Private address copied.");
  } catch (error) {
    qrMessage.value = t("QR share failed.");
    console.warn("Failed to share QR", error);
  }
};

const selectAddressText = (event: FocusEvent) => {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement) {
    target.select();
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
.receive-shell {
  min-width: 0;
}

.receive-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.receive-actions .icon-cta {
  width: 100%;
  min-height: 46px;
  justify-content: center;
}

.receive-account-copy {
  margin-top: 10px;
}

.receive-layout {
  display: grid;
  grid-template-columns: minmax(360px, 1.25fr) minmax(260px, 0.75fr);
  gap: clamp(28px, 6vw, 80px);
  align-items: center;
}

.receive-qr-workspace,
.receive-context {
  display: grid;
  gap: 16px;
  align-content: start;
  min-width: 0;
}

.receive-account-card {
  display: grid;
  gap: 6px;
  padding-top: 2px;
}

.receive-account-card .kv-value {
  overflow-wrap: anywhere;
  unicode-bidi: plaintext;
}

.receive-intro {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--color-border);
}

.receive-kicker {
  margin: 0 0 10px;
  color: var(--color-accent);
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.receive-lead {
  max-width: 28ch;
  margin: 0;
  font-size: clamp(1.35rem, 3vw, 2rem);
  font-weight: 620;
  letter-spacing: -0.035em;
  line-height: 1.18;
}

.receive-address-details,
.receive-wallet-details {
  margin-top: 0;
  background: transparent;
}

.private-address-field {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.private-address-field span {
  color: var(--color-text-muted);
  font-size: 0.84rem;
}

.private-address-field textarea {
  min-width: 0;
  width: 100%;
  resize: vertical;
  font-family: var(--mono-font);
  font-size: 0.78rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
  unicode-bidi: plaintext;
}

.qr-panel {
  min-height: clamp(380px, 52vw, 520px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel-raised);
  display: grid;
  place-items: center;
  align-content: center;
  gap: 18px;
  padding: clamp(24px, 5vw, 52px);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.qr-panel.ready {
  border-color: color-mix(
    in srgb,
    var(--color-accent) 24%,
    var(--color-border)
  );
}

.qr {
  width: min(340px, 100%);
  display: grid;
  place-items: center;
  padding: clamp(18px, 3vw, 28px);
  border-radius: var(--radius-panel);
  border: 1px solid var(--color-border);
  background: var(--color-qr-surface);
  box-shadow: var(--shadow-control);
}

.qr :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}

.receive-empty-state {
  max-width: 320px;
  text-align: center;
}

.receive-qr-status {
  margin: 0;
  min-height: 1.4em;
  text-align: center;
}

@media (max-width: 960px) {
  .receive-layout {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .receive-context {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .receive-intro {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .receive-context {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .qr-panel {
    min-height: 320px;
    padding: 24px;
    border-radius: 20px;
  }

  .receive-empty-state {
    max-width: none;
  }

  .receive-actions {
    grid-template-columns: 1fr;
  }
}
</style>
