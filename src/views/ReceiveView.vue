<template>
  <section class="card receive-shell">
    <header class="card-header receive-header">
      <div>
        <h2>{{ t("Share Payment QR") }}</h2>
        <p class="helper receive-account-copy">
          {{ shareAccountId || t("Configure account first") }}
        </p>
      </div>
      <button class="icon-cta" @click="toggleQr">
        <img :src="receiveIcon" alt="" />
        <span>{{ showQr ? t("Hide QR Code") : t("Show QR Code") }}</span>
      </button>
    </header>
    <div class="receive-layout">
      <div class="receive-context">
        <div class="kv receive-account-card">
          <span class="kv-label">{{ t("Canonical I105 Account ID") }}</span>
          <span class="kv-value">{{
            shareAccountId || t("Configure account first")
          }}</span>
        </div>
        <label v-if="activeAccountId" class="receive-amount">
          {{ t("Amount") }}
          <input
            v-model="amount"
            type="number"
            min="0"
            step="0.01"
            @input="handleAmountChange"
          />
        </label>
        <p class="helper">
          {{
            showQr
              ? t(
                  "QR encodes account + amount + asset definition for compatible wallets.",
                )
              : t("Use the button above to render a QR that wallets can scan.")
          }}
        </p>
      </div>
      <div
        class="qr-panel"
        :class="{ ready: Boolean(showQr && qrMarkup), dormant: !showQr }"
      >
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="showQr && qrMarkup" class="qr" v-html="qrMarkup"></div>
        <p v-else class="helper receive-empty-state">
          {{ showQr ? qrMessage : t("Tap the button to generate a QR.") }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import QRCode from "qrcode";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSessionStore } from "@/stores/session";
import { getPublicAccountId } from "@/utils/accountId";
import ReceiveIcon from "@/assets/receive.svg";

const session = useSessionStore();
const { t } = useAppI18n();
const activeAccount = computed(() => session.activeAccount);
const activeAccountId = computed(() => activeAccount.value?.accountId ?? "");
const shareAccountId = computed(() => getPublicAccountId(activeAccount.value));
const qrMarkup = ref("");
const qrMessage = ref(t("Tap the button to generate a QR."));
const amount = ref("0");
const showQr = ref(false);
const qrGeneration = ref(0);
const receiveIcon = ReceiveIcon;
const QR_DARK_COLOR = "#14202b";
const QR_LIGHT_COLOR = "#ffffff";

const generateQr = async () => {
  const accountId = shareAccountId.value;
  const assetDefinitionId = session.connection.assetDefinitionId;
  const currentAmount = amount.value;
  const privateKeyHex = activeAccount.value?.privateKeyHex ?? "";
  const currentGeneration = qrGeneration.value + 1;
  qrGeneration.value = currentGeneration;

  if (!accountId) {
    qrMarkup.value = "";
    qrMessage.value = t("Configure an account before generating QR codes.");
    return;
  }
  qrMessage.value = t("Generating QR...");
  let shieldedOwnerTagHex = "";
  if (privateKeyHex) {
    try {
      shieldedOwnerTagHex =
        window.iroha.deriveConfidentialOwnerTag(privateKeyHex).ownerTagHex;
    } catch (error) {
      console.warn("Failed to derive confidential owner tag for QR", error);
    }
  }
  const payload = {
    accountId,
    assetDefinitionId,
    amount: currentAmount,
    shieldedOwnerTagHex,
  };
  try {
    const nextQrMarkup = await QRCode.toString(JSON.stringify(payload), {
      type: "svg",
      width: 240,
      color: {
        dark: QR_DARK_COLOR,
        light: QR_LIGHT_COLOR,
      },
    });
    if (
      currentGeneration !== qrGeneration.value ||
      !showQr.value ||
      shareAccountId.value !== accountId ||
      session.connection.assetDefinitionId !== assetDefinitionId ||
      amount.value !== currentAmount ||
      activeAccount.value?.privateKeyHex !== privateKeyHex
    ) {
      return;
    }
    qrMarkup.value = nextQrMarkup;
    qrMessage.value = t("QR ready.");
  } catch (error) {
    if (currentGeneration !== qrGeneration.value) {
      return;
    }
    qrMessage.value = t("Failed to render QR.");
    console.warn("Failed to render QR", error);
  }
};

const toggleQr = () => {
  showQr.value = !showQr.value;
  if (showQr.value) {
    generateQr();
  } else {
    qrGeneration.value += 1;
    qrMarkup.value = "";
    qrMessage.value = t("Tap the button to generate a QR.");
  }
};

const handleAmountChange = () => {
  if (showQr.value) {
    generateQr();
  }
};

watch(
  () => [shareAccountId.value, session.connection.assetDefinitionId],
  () => {
    if (showQr.value) {
      generateQr();
    }
  },
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
  padding: 20px;
}

.qr-panel.ready {
  border-color: rgba(255, 76, 102, 0.42);
  box-shadow: 0 18px 36px rgba(255, 76, 102, 0.14);
}

.qr-panel.dormant {
  min-height: 176px;
  border-style: dashed;
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

  .qr-panel.dormant {
    min-height: 148px;
  }

  .receive-empty-state {
    max-width: none;
  }
}
</style>
