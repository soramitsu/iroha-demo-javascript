<template>
  <div class="wallet-layout">
    <section class="card wallet-summary-card">
      <header class="card-header wallet-summary-header">
        <div>
          <h2>{{ t("Balances") }}</h2>
          <p class="helper wallet-account-copy">
            {{
              activeAccount?.displayName || activeAccount?.accountId || t("—")
            }}
          </p>
        </div>
        <button class="secondary" :disabled="loading" @click="refresh">
          {{ loading ? t("Refreshing…") : t("Refresh") }}
        </button>
      </header>
      <div class="wallet-balance-band">
        <p class="wallet-balance-label">{{ t("Quantity") }}</p>
        <p class="wallet-balance-value">{{ primaryAssetQuantity }}</p>
        <p class="wallet-balance-asset">{{ primaryAssetLabel }}</p>
      </div>
      <div class="wallet-quick-actions">
        <a class="secondary wallet-action-link" href="#/receive">
          {{ t("Receive Points") }}
        </a>
        <a class="secondary wallet-action-link" href="#/send">
          {{ t("Send Points") }}
        </a>
      </div>
      <div class="wallet-faucet-panel">
        <div>
          <p class="wallet-faucet-label">{{ t("Faucet Request") }}</p>
          <p class="helper">
            {{ t("Top up a new TAIRA account once with starter XOR.") }}
          </p>
        </div>
        <button
          class="secondary"
          :disabled="loading || faucetLoading || !canRequestFaucet"
          @click="requestStarterFunds"
        >
          {{ faucetLoading ? t("Requesting…") : t("Claim Testnet XOR") }}
        </button>
      </div>
      <p v-if="faucetMessage" class="wallet-faucet-message">
        {{ faucetMessage }}
      </p>
      <p
        v-else-if="faucetError"
        class="wallet-faucet-message wallet-faucet-error"
      >
        {{ faucetError }}
      </p>
      <div class="wallet-kpis">
        <div class="kv">
          <span class="kv-label">{{ t("Assets") }}</span>
          <span class="kv-value">{{ assets.length }}</span>
        </div>
        <div class="kv wallet-kpi-account">
          <span class="kv-label">{{ t("Account ID") }}</span>
          <span class="kv-value">{{ activeAccount?.accountId || t("—") }}</span>
        </div>
      </div>
      <div v-if="assets.length" class="table-wrap wallet-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ t("Asset ID") }}</th>
              <th>{{ t("Quantity") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="asset in assets" :key="asset.asset_id">
              <td>{{ asset.asset_id }}</td>
              <td>{{ asset.quantity }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="wallet-empty">
        <p class="wallet-empty-title">
          {{ t("No assets found for this account.") }}
        </p>
        <p class="helper">
          {{ t("Share QR or Account ID") }} ·
          {{ t("Transfer assets via Torii") }}
        </p>
      </div>
    </section>

    <section class="card wallet-transactions-card">
      <header class="card-header">
        <h2>{{ t("Latest Transactions") }}</h2>
      </header>
      <div v-if="transactions.length" class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ t("Time") }}</th>
              <th>{{ t("Direction") }}</th>
              <th>{{ t("Amount") }}</th>
              <th>{{ t("Counterparty") }}</th>
              <th>{{ t("Status") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tx in transactions" :key="tx.entrypoint_hash">
              <td>{{ formatDate(tx.timestamp_ms) }}</td>
              <td>{{ tx.direction }}</td>
              <td>{{ tx.amount ?? t("—") }}</td>
              <td>{{ tx.counterparty ?? t("—") }}</td>
              <td
                :class="tx.result_ok ? 'status-pill ok' : 'status-pill error'"
              >
                {{ tx.result_ok ? t("Committed") : t("Rejected") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="wallet-empty wallet-ledger-empty">
        <p class="wallet-empty-title">{{ t("No transfers recorded yet.") }}</p>
        <p class="helper">{{ t("Latest Transactions") }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  fetchAccountAssets,
  fetchAccountTransactions,
  requestFaucetFunds,
} from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import type {
  AccountAssetsResponse,
  AccountTransactionsResponse,
} from "@/types/iroha";
import {
  extractTransferInsight,
  type AccountTransactionLike,
} from "@/utils/transactions";

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const { localeStore, t } = useAppI18n();

type AccountTx = AccountTransactionsResponse["items"][number] &
  AccountTransactionLike & {
    entrypoint_hash?: string;
    timestamp_ms?: number;
    result_ok?: boolean;
  };

type TransactionView = AccountTx & {
  direction: string;
  amount: string | null;
  counterparty: string | null;
};

const assets = ref<AccountAssetsResponse["items"]>([]);
const transactionsRaw = ref<AccountTx[]>([]);
const loading = ref(false);
const faucetLoading = ref(false);
const faucetMessage = ref("");
const faucetError = ref("");
const requestGeneration = ref(0);

const formatDate = (timestamp?: number) => {
  if (!timestamp) return t("—");
  return new Intl.DateTimeFormat(localeStore.current, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(timestamp));
};

const resetWalletState = () => {
  assets.value = [];
  transactionsRaw.value = [];
  faucetMessage.value = "";
  faucetError.value = "";
};

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = activeAccount.value?.accountId;
  if (!session.hasAccount || !toriiUrl || !accountId) {
    requestGeneration.value += 1;
    loading.value = false;
    resetWalletState();
    return;
  }
  const currentGeneration = requestGeneration.value + 1;
  requestGeneration.value = currentGeneration;
  loading.value = true;
  try {
    const [{ items: assetItems }, { items: txItems }] = await Promise.all([
      fetchAccountAssets({
        toriiUrl,
        accountId,
        limit: 50,
      }),
      fetchAccountTransactions({
        toriiUrl,
        accountId,
        limit: 25,
      }),
    ]);
    if (
      currentGeneration !== requestGeneration.value ||
      session.connection.toriiUrl !== toriiUrl ||
      activeAccount.value?.accountId !== accountId
    ) {
      return;
    }
    assets.value = assetItems;
    transactionsRaw.value = txItems as AccountTx[];
  } finally {
    if (currentGeneration === requestGeneration.value) {
      loading.value = false;
    }
  }
};

const canRequestFaucet = computed(() =>
  Boolean(
    session.hasAccount &&
      session.connection.toriiUrl &&
      activeAccount.value?.accountId,
  ),
);

const requestStarterFunds = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = activeAccount.value?.accountId;
  if (!toriiUrl || !accountId) {
    return;
  }
  const shouldConfigureAsset = !session.connection.assetDefinitionId.trim();
  faucetLoading.value = true;
  faucetMessage.value = "";
  faucetError.value = "";
  try {
    const result = await requestFaucetFunds({
      toriiUrl,
      accountId,
    });
    if (shouldConfigureAsset) {
      session.updateConnection({
        assetDefinitionId:
          result.asset_id.trim() || result.asset_definition_id.trim(),
      });
    }
    faucetMessage.value = t("Testnet XOR requested: {hash}", {
      hash: result.tx_hash_hex,
    });
    await refresh();
  } catch (error) {
    faucetError.value =
      error instanceof Error
        ? error.message
        : t("Failed to request faucet funds.");
  } finally {
    faucetLoading.value = false;
  }
};

const primaryAsset = computed(() => {
  const items = assets.value;
  if (!items.length) {
    return null;
  }
  const target = session.connection.assetDefinitionId.trim();
  if (!target) {
    return items[0] ?? null;
  }
  const normalizedTarget = target.toLowerCase();
  return (
    items.find((asset) => asset.asset_id === target) ??
    items.find((asset) => asset.asset_id.startsWith(target)) ??
    items.find((asset) =>
      asset.asset_id.toLowerCase().includes(normalizedTarget),
    ) ??
    (items.length === 1 ? items[0] : null)
  );
});

const primaryAssetLabel = computed(() => {
  const fallback = session.connection.assetDefinitionId || t("—");
  return primaryAsset.value?.asset_id ?? fallback;
});
const primaryAssetQuantity = computed(
  () => primaryAsset.value?.quantity ?? "0",
);

const transactions = computed<TransactionView[]>(() =>
  transactionsRaw.value.map((tx) => {
    const insight = extractTransferInsight(
      tx,
      activeAccount.value?.accountId ?? "",
    );
    return {
      ...tx,
      direction: insight?.direction ?? t("—"),
      amount: insight?.amount ?? null,
      counterparty: insight?.counterparty ?? null,
    };
  }),
);

watch(
  [() => session.connection.toriiUrl, () => activeAccount.value?.accountId],
  () => {
    refresh();
  },
  { immediate: true },
);
</script>

<style scoped>
.wallet-layout {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.wallet-summary-card,
.wallet-transactions-card {
  min-height: 100%;
}

.wallet-summary-header {
  align-items: flex-start;
}

.wallet-balance-band {
  display: grid;
  gap: 6px;
  padding: 18px 20px;
  border-radius: 22px;
  border: 1px solid var(--glass-border);
  background:
    linear-gradient(135deg, var(--glass-veil), transparent 70%),
    linear-gradient(135deg, var(--menu-highlight), transparent 52%),
    var(--surface-soft);
  box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    var(--shadow-soft);
}

.wallet-balance-label {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.72rem;
  color: var(--iroha-muted);
}

.wallet-balance-value {
  margin: 0;
  font-size: clamp(2rem, 5vw, 2.7rem);
  line-height: 0.95;
  font-weight: 700;
}

.wallet-balance-asset {
  margin: 0;
  color: var(--iroha-muted);
  word-break: break-word;
  unicode-bidi: plaintext;
}

.wallet-quick-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.wallet-action-link {
  flex: 1 1 180px;
}

.wallet-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.wallet-faucet-panel {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding: 16px 18px;
  border-radius: 20px;
  border: 1px solid var(--glass-border);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--menu-highlight) 16%, transparent),
    color-mix(in srgb, var(--glass-veil) 78%, transparent)
  );
}

.wallet-faucet-panel .helper {
  margin: 4px 0 0;
}

.wallet-faucet-label {
  margin: 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--iroha-muted);
}

.wallet-faucet-message {
  margin: 12px 0 0;
  color: var(--iroha-text);
}

.wallet-faucet-error {
  color: var(--accent-danger);
}

.wallet-kpi-account .kv-value {
  word-break: break-all;
  unicode-bidi: plaintext;
}

.wallet-account-copy {
  margin-top: 4px;
  word-break: break-all;
  unicode-bidi: plaintext;
}

.wallet-table-wrap {
  margin-top: 18px;
}

.wallet-empty {
  min-height: 136px;
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 8px;
  padding: 8px 0;
  text-align: center;
}

.wallet-empty-title {
  margin: 0;
  font-weight: 700;
}

.wallet-ledger-empty {
  justify-items: center;
}

.wallet-transactions-card .table td:last-child,
.wallet-transactions-card .table th:last-child {
  white-space: nowrap;
}

@media (max-width: 1080px) {
  .wallet-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .wallet-balance-band {
    padding: 16px;
  }

  .wallet-quick-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .wallet-action-link {
    min-width: 0;
    padding-inline: 12px;
  }

  .wallet-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
