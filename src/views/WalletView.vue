<template>
  <div class="wallet-layout">
    <section class="card wallet-summary-card">
      <header class="card-header wallet-summary-header">
        <div>
          <h2>{{ t("Balances") }}</h2>
          <p class="helper wallet-account-copy">{{ activeAccountLabel }}</p>
        </div>
        <button class="secondary" :disabled="loading" @click="refresh">
          {{ loading ? t("Refreshing…") : t("Refresh") }}
        </button>
      </header>
      <div class="wallet-balance-band">
        <p class="wallet-balance-label">{{ t("Available balance") }}</p>
        <p class="wallet-balance-value">{{ primaryAssetQuantity }}</p>
        <p class="wallet-balance-asset">{{ primaryAssetLabel }}</p>
      </div>
      <div
        v-if="!faucetDisabled"
        class="wallet-faucet-panel"
        :class="{ 'wallet-faucet-panel-priority': showFundingPriority }"
      >
        <div>
          <p class="wallet-faucet-label">{{ t("Starter funds") }}</p>
          <p
            class="helper"
            :class="{ 'wallet-faucet-copy-priority': showFundingPriority }"
          >
            {{ t("Request starter XOR from the active network faucet.") }}
          </p>
        </div>
        <button
          :class="
            showFundingPriority
              ? 'wallet-faucet-button'
              : 'secondary wallet-faucet-button'
          "
          :disabled="faucetLoading || !canRequestFaucet"
          @click="requestStarterFunds"
        >
          {{ faucetLoading ? t("Requesting…") : t("Request XOR") }}
        </button>
      </div>
      <div class="wallet-quick-actions">
        <a class="secondary wallet-action-link" href="#/receive">
          {{ t("Receive") }}
        </a>
        <a
          class="secondary wallet-action-link"
          :class="{ 'wallet-action-link-disabled': !canSendAssets }"
          :href="canSendAssets ? '#/send' : undefined"
          :aria-disabled="!canSendAssets"
          :tabindex="canSendAssets ? undefined : -1"
        >
          {{ t("Send") }}
        </a>
      </div>
      <div v-if="showShieldSection" class="wallet-shield-panel">
        <div class="wallet-shield-header">
          <div>
            <p class="wallet-faucet-label">{{ t("Private balance") }}</p>
            <p class="wallet-shield-balance">
              {{ shieldedXorBalanceDisplay }}
            </p>
            <p class="wallet-shield-asset">
              {{ shieldedXorAssetLabel }}
            </p>
          </div>
          <div class="wallet-shield-kpi">
            <span class="kv-label">{{ t("Standard balance") }}</span>
            <span class="kv-value">{{ transparentXorBalance }}</span>
          </div>
        </div>
        <div class="wallet-shield-actions">
          <label class="wallet-shield-input">
            <span>{{ t("Amount") }}</span>
            <input
              v-model="shieldForm.quantity"
              type="number"
              min="0"
              step="1"
            />
          </label>
          <button
            class="secondary"
            :disabled="shieldLoading || !canCreateShieldedXor"
            @click="createShieldedXor"
          >
            {{
              shieldLoading ? t("Submitting…") : t("Move to private balance")
            }}
          </button>
        </div>
        <details class="technical-details compact wallet-shield-details">
          <summary>{{ t("Private balance details") }}</summary>
          <div class="wallet-shield-recovery-row">
            <p class="helper wallet-shield-note">
              {{ shieldedXorRecoveryMessage }}
            </p>
            <button
              class="secondary"
              :disabled="shieldScanLoading || !canScanShieldedXor"
              @click="rescanShieldedXor"
            >
              {{
                shieldScanLoading
                  ? t("Scanning shielded notes…")
                  : t("Rescan private balance")
              }}
            </button>
          </div>
          <p
            v-if="shieldedXorCapabilityMessage"
            class="helper wallet-shield-note"
          >
            {{ shieldedXorCapabilityMessage }}
          </p>
          <p
            v-else-if="shieldedXorPolicyMode"
            class="helper wallet-shield-note"
          >
            {{
              t("Shield policy mode: {mode}.", {
                mode: shieldedXorPolicyMode,
              })
            }}
          </p>
          <p v-if="!shieldedXorBalanceExact" class="helper wallet-shield-note">
            {{
              t(
                "Showing spendable shielded balance from this wallet. Older or foreign confidential outputs may still be missing.",
              )
            }}
          </p>
        </details>
        <p v-if="shieldMessage" class="wallet-faucet-message">
          {{ shieldMessage }}
        </p>
        <p
          v-else-if="shieldError"
          class="wallet-faucet-message wallet-faucet-error"
        >
          {{ shieldError }}
        </p>
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
      <p
        v-if="activeAccount?.localOnly"
        class="helper wallet-local-account-note"
      >
        {{
          t(
            "This wallet is saved locally. If the account is not live on-chain yet, balances and transfers can stay empty until it is funded or otherwise created on-chain.",
          )
        }}
      </p>
      <p v-if="walletError" class="wallet-faucet-message wallet-faucet-error">
        {{ walletError }}
      </p>
      <details
        v-if="assets.length || visibleAccountId"
        class="technical-details wallet-details-section"
      >
        <summary>{{ t("Asset and account details") }}</summary>
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
                <td>{{ formatAssetReferenceLabel(asset.asset_id, t("—")) }}</td>
                <td>{{ asset.quantity }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="visibleAccountId" class="helper wallet-account-id-note">
          <span class="wallet-account-id-label">
            {{ t("I105 Account ID") }}
          </span>
          <span class="wallet-account-id-value">{{ visibleAccountId }}</span>
        </p>
      </details>
      <div v-else class="wallet-empty">
        <p class="wallet-empty-title">
          {{ t("No assets found for this account.") }}
        </p>
        <p class="helper">
          {{ t("Share QR or Account ID") }} ·
          {{ t("Transfer assets via Torii") }}
        </p>
      </div>
      <div v-if="faucetLoading" class="wallet-faucet-modal-backdrop">
        <div
          class="card wallet-faucet-modal"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy="true"
        >
          <span class="wallet-faucet-spinner" aria-hidden="true"></span>
          <p class="wallet-faucet-modal-label">
            {{ t("Faucet request in progress") }}
          </p>
          <h2 id="wallet-faucet-modal-title" class="wallet-faucet-modal-title">
            {{ faucetStatusMessage }}
          </h2>
          <p
            id="wallet-faucet-modal-detail"
            class="helper wallet-faucet-modal-detail"
          >
            {{ faucetStatusDetail }}
          </p>
        </div>
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
import { computed, reactive, ref, toRef, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  fetchAccountAssets,
  fetchAccountTransactions,
  getConfidentialAssetBalance,
  requestFaucetFunds,
  scanConfidentialWallet,
  transferAsset,
} from "@/services/iroha";
import { useShieldCapability } from "@/composables/useShieldCapability";
import { useSessionStore } from "@/stores/session";
import type {
  AccountAssetsResponse,
  AccountTransactionsResponse,
  ConfidentialAssetBalanceView,
  FaucetRequestProgress,
} from "@/types/iroha";
import {
  extractTransferInsight,
  type AccountTransactionLike,
} from "@/utils/transactions";
import { isPositiveWholeAmount } from "@/utils/confidential";
import { getAccountDisplayLabel, getPublicAccountId } from "@/utils/accountId";
import {
  extractAssetDefinitionId,
  formatAssetDefinitionLabel,
  formatAssetReferenceLabel,
  resolveToriiXorAsset,
  shouldReplaceConfiguredAssetDefinitionId,
} from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";

const SHIELDED_XOR_ASSET_DEFINITION_ID = "xor#universal";
const ACCOUNT_TRANSACTION_PAGE_SIZE = 200;
const WALLET_TRANSACTION_DISPLAY_LIMIT = 25;

const session = useSessionStore();
const activeAccount = computed(() => session.activeAccount);
const { localeStore, t } = useAppI18n();
const visibleAccountId = computed(() =>
  getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
);
const requestAccountId = computed(
  () => visibleAccountId.value || activeAccount.value?.accountId || "",
);
const activeAccountLabel = computed(() =>
  getAccountDisplayLabel(
    activeAccount.value,
    t("—"),
    session.connection.networkPrefix,
  ),
);
const configuredShieldAssetDefinitionId = computed(() =>
  extractAssetDefinitionId(session.connection.assetDefinitionId).trim(),
);
const shieldForm = reactive({
  quantity: "0",
});
const shieldLoading = ref(false);
const shieldScanLoading = ref(false);
const shieldMessage = ref("");
const shieldError = ref("");
const walletShieldEnabled = ref(true);
const {
  shieldCapabilityReady: shieldedXorCapabilityReady,
  shieldSupported: shieldedXorSupported,
  shieldCapabilityMessage: shieldedXorCapabilityMessage,
  shieldPolicyMode: shieldedXorPolicyMode,
  shieldResolvedAssetId: shieldedXorResolvedAssetId,
} = useShieldCapability({
  toriiUrl: toRef(session.connection, "toriiUrl"),
  accountId: requestAccountId,
  assetDefinitionId: configuredShieldAssetDefinitionId,
  shielded: walletShieldEnabled,
  operation: "selfShield",
  translate: t,
  onResolvedAssetDefinitionId: (resolvedAssetDefinitionId) => {
    updateConfiguredAssetDefinitionIdFromLiveEvidence(
      resolvedAssetDefinitionId,
      [resolvedAssetDefinitionId],
    );
  },
});

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

type WalletFaucetPhase = FaucetRequestProgress["phase"] | "refreshingWallet";

const FAUCET_REFRESH_MAX_ATTEMPTS = 4;
const FAUCET_REFRESH_DELAY_MS = 1_500;

const assets = ref<AccountAssetsResponse["items"]>([]);
const transactionsRaw = ref<AccountTx[]>([]);
const emptyConfidentialBalance = (
  resolvedAssetId = configuredShieldAssetDefinitionId.value,
): ConfidentialAssetBalanceView => ({
  resolvedAssetId,
  quantity: "0",
  onChainQuantity: "0",
  spendableQuantity: "0",
  exact: true,
  scanSource: "account-transactions",
  scanStatus: "complete",
  scanWatermarkBlock: null,
  recoveredNoteCount: 0,
  trackedAssetIds: resolvedAssetId ? [resolvedAssetId] : [],
});
const shieldedXorBalanceState = ref<ConfidentialAssetBalanceView>(
  emptyConfidentialBalance(),
);
const loading = ref(false);
const faucetLoading = ref(false);
const faucetMessage = ref("");
const faucetError = ref("");
const walletError = ref("");
const requestGeneration = ref(0);
const faucetStatusPhase = ref<WalletFaucetPhase>("requestingPuzzle");

const formatDate = (timestamp?: number) => {
  if (!timestamp) return t("—");
  return new Intl.DateTimeFormat(localeStore.current, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(timestamp));
};

function updateConfiguredAssetDefinitionIdFromLiveEvidence(
  detectedAssetDefinitionId: string | null | undefined,
  knownAssetIds: Array<string | null | undefined> = [],
) {
  const normalizedDetectedAssetDefinitionId = extractAssetDefinitionId(
    detectedAssetDefinitionId,
  ).trim();
  if (
    !normalizedDetectedAssetDefinitionId ||
    !shouldReplaceConfiguredAssetDefinitionId({
      configuredAssetDefinitionId: session.connection.assetDefinitionId,
      detectedAssetDefinitionId: normalizedDetectedAssetDefinitionId,
      knownAssetIds,
    })
  ) {
    return false;
  }
  session.$patch({
    connection: {
      ...session.connection,
      assetDefinitionId: normalizedDetectedAssetDefinitionId,
    },
  });
  return true;
}

const resetWalletState = () => {
  assets.value = [];
  transactionsRaw.value = [];
  faucetMessage.value = "";
  faucetError.value = "";
  walletError.value = "";
};

const faucetStatusMessage = computed(() => {
  switch (faucetStatusPhase.value) {
    case "requestingPuzzle":
      return t("Requesting faucet puzzle…");
    case "waitingForPuzzleRetry":
      return t("Waiting for finalized faucet seed data…");
    case "solvingPuzzle":
      return t("Solving faucet proof-of-work…");
    case "submittingClaim":
      return t("Submitting faucet claim…");
    case "waitingForClaimRetry":
      return t("Retrying faucet claim after queue expiry…");
    case "claimAccepted":
      return t("Faucet claim accepted. Waiting for finality…");
    case "waitingForCommit":
      return t("Waiting for faucet transaction finality…");
    case "claimCommitted":
      return t("Faucet transaction committed. Updating wallet…");
    case "refreshingWallet":
      return t("Refreshing wallet balance…");
    default:
      return t("Requesting…");
  }
});

const faucetStatusDetail = computed(() => {
  if (faucetStatusPhase.value === "refreshingWallet") {
    return t(
      "Waiting for the network to expose the funded asset in account balances.",
    );
  }
  if (faucetStatusPhase.value === "waitingForClaimRetry") {
    return t(
      "The network dropped the previous queued faucet claim before commit. Retrying automatically with backoff.",
    );
  }
  return t("Your faucet request is in flight. This can take a few seconds.");
});

const fetchAllAccountTransactions = async (input: {
  toriiUrl: string;
  accountId: string;
  privateKeyHex?: string;
}): Promise<AccountTx[]> => {
  const items: AccountTx[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const response = await fetchAccountTransactions({
      toriiUrl: input.toriiUrl,
      accountId: input.accountId,
      privateKeyHex: input.privateKeyHex,
      limit: ACCOUNT_TRANSACTION_PAGE_SIZE,
      offset,
    });
    const pageItems = (response.items ?? []) as AccountTx[];
    items.push(...pageItems);
    total = Number(response.total ?? items.length);
    offset += pageItems.length;
    if (
      pageItems.length === 0 ||
      pageItems.length < ACCOUNT_TRANSACTION_PAGE_SIZE
    ) {
      break;
    }
  }

  return items;
};

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = requestAccountId.value;
  const privateKeyHex = activeAccount.value?.privateKeyHex;
  const accountWasLocalOnly = Boolean(activeAccount.value?.localOnly);
  if (!session.hasAccount || !toriiUrl || !accountId) {
    requestGeneration.value += 1;
    loading.value = false;
    resetWalletState();
    shieldedXorBalanceState.value = emptyConfidentialBalance();
    return;
  }
  const currentGeneration = requestGeneration.value + 1;
  requestGeneration.value = currentGeneration;
  loading.value = true;
  walletError.value = "";
  try {
    const [{ items: assetItems }, txItems] = await Promise.all([
      fetchAccountAssets({
        toriiUrl,
        accountId,
        limit: 50,
      }),
      fetchAllAccountTransactions({
        toriiUrl,
        accountId,
        privateKeyHex,
      }),
    ]);
    const configuredAssetDefinitionId = extractAssetDefinitionId(
      session.connection.assetDefinitionId,
    ).trim();
    const detectedShieldAsset = resolveToriiXorAsset(assetItems, [
      shieldedXorResolvedAssetId.value,
      configuredShieldAssetDefinitionId.value,
      configuredAssetDefinitionId,
      SHIELDED_XOR_ASSET_DEFINITION_ID,
    ]);
    const confidentialAssetDefinitionId = extractAssetDefinitionId(
      detectedShieldAsset?.asset_id ?? configuredAssetDefinitionId,
    ).trim();
    updateConfiguredAssetDefinitionIdFromLiveEvidence(
      confidentialAssetDefinitionId,
      assetItems.map((asset) => asset.asset_id),
    );
    const shouldFetchConfidentialBalance = Boolean(
      confidentialAssetDefinitionId &&
        (!accountWasLocalOnly || assetItems.length || txItems.length),
    );
    let confidentialBalance = emptyConfidentialBalance(
      confidentialAssetDefinitionId || configuredShieldAssetDefinitionId.value,
    );
    if (shouldFetchConfidentialBalance) {
      try {
        confidentialBalance = await getConfidentialAssetBalance({
          toriiUrl,
          chainId: session.connection.chainId,
          accountId,
          privateKeyHex,
          assetDefinitionId: confidentialAssetDefinitionId,
        });
      } catch (error) {
        console.warn("Failed to refresh confidential balance", error);
      }
    }
    if (
      currentGeneration !== requestGeneration.value ||
      session.connection.toriiUrl !== toriiUrl ||
      requestAccountId.value !== accountId
    ) {
      return;
    }
    assets.value = assetItems;
    transactionsRaw.value = txItems as AccountTx[];
    shieldedXorBalanceState.value = confidentialBalance;
    if (activeAccount.value?.localOnly) {
      session.updateActiveAccount({ localOnly: false });
    }
  } catch (error) {
    if (
      currentGeneration !== requestGeneration.value ||
      session.connection.toriiUrl !== toriiUrl ||
      requestAccountId.value !== accountId
    ) {
      return;
    }
    assets.value = [];
    transactionsRaw.value = [];
    shieldedXorBalanceState.value = emptyConfidentialBalance();
    walletError.value = toUserFacingErrorMessage(
      error,
      t("Wallet data is unavailable until this account exists on-chain."),
    );
  } finally {
    if (currentGeneration === requestGeneration.value) {
      loading.value = false;
    }
  }
};

const waitFor = (delayMs: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

const refreshAfterFaucetClaim = async (assetId: string) => {
  const normalizedAssetId = assetId.trim().toLowerCase();
  faucetStatusPhase.value = "refreshingWallet";
  for (let attempt = 1; attempt <= FAUCET_REFRESH_MAX_ATTEMPTS; attempt += 1) {
    await refresh();
    if (
      assets.value.some(
        (asset) => asset.asset_id.trim().toLowerCase() === normalizedAssetId,
      )
    ) {
      return true;
    }
    if (attempt < FAUCET_REFRESH_MAX_ATTEMPTS) {
      await waitFor(FAUCET_REFRESH_DELAY_MS);
    }
  }
  return false;
};

const requestStarterFunds = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = requestAccountId.value;
  if (!toriiUrl || !accountId || !canRequestFaucet.value) {
    return;
  }
  const shouldConfigureAsset = !session.connection.assetDefinitionId.trim();
  faucetLoading.value = true;
  faucetMessage.value = "";
  faucetError.value = "";
  faucetStatusPhase.value = "requestingPuzzle";
  try {
    const result = await requestFaucetFunds(
      {
        toriiUrl,
        accountId,
        networkPrefix: session.connection.networkPrefix,
      },
      (progress) => {
        faucetStatusPhase.value = progress.phase;
      },
    );
    const fundedAssetDefinitionId =
      result.asset_definition_id.trim() ||
      extractAssetDefinitionId(result.asset_id).trim() ||
      result.asset_id.trim();
    if (shouldConfigureAsset) {
      session.$patch({
        connection: {
          ...session.connection,
          assetDefinitionId: fundedAssetDefinitionId,
        },
      });
    } else {
      updateConfiguredAssetDefinitionIdFromLiveEvidence(
        fundedAssetDefinitionId,
        [result.asset_definition_id, result.asset_id],
      );
    }
    session.updateActiveAccount({ localOnly: false });
    faucetStatusPhase.value = "claimCommitted";
    faucetMessage.value = t("XOR requested: {hash}", {
      hash: result.tx_hash_hex,
    });
    const balanceVisible = await refreshAfterFaucetClaim(result.asset_id);
    if (!balanceVisible) {
      faucetError.value = "";
      faucetMessage.value = t(
        "Faucet accepted, but wallet balances are still indexing. Refresh again in a few seconds.",
      );
    }
  } catch (error) {
    faucetError.value = toUserFacingErrorMessage(
      error,
      t("Failed to request faucet funds."),
    );
  } finally {
    faucetLoading.value = false;
  }
};

const primaryAsset = computed(() => {
  return resolveToriiXorAsset(assets.value, [
    shieldedXorResolvedAssetId.value,
    configuredShieldAssetDefinitionId.value,
    SHIELDED_XOR_ASSET_DEFINITION_ID,
  ]);
});

const primaryAssetFallback = computed(
  () =>
    shieldedXorResolvedAssetId.value ||
    configuredShieldAssetDefinitionId.value ||
    SHIELDED_XOR_ASSET_DEFINITION_ID,
);

const primaryAssetLabel = computed(() => {
  return formatAssetDefinitionLabel(
    primaryAsset.value?.asset_id ?? primaryAssetFallback.value,
    t("—"),
  );
});
const primaryAssetQuantity = computed(
  () => primaryAsset.value?.quantity ?? "0",
);
const faucetDisabled = import.meta.env.VITE_DISABLE_FAUCET === "true";
const canRequestFaucet = computed(() =>
  Boolean(
    !faucetDisabled &&
      session.hasAccount &&
      session.connection.toriiUrl &&
      requestAccountId.value,
  ),
);
const showFundingPriority = computed(() =>
  Boolean(activeAccount.value?.localOnly || !assets.value.length),
);
const canSendAssets = computed(() =>
  assets.value.some((asset) => Number(asset.quantity) > 0),
);
const showShieldSection = computed(() =>
  Boolean(
    assets.value.length ||
      transactionsRaw.value.length ||
      shieldMessage.value ||
      shieldError.value,
  ),
);
const shieldedXorTrackedAssetIds = computed(() => {
  const seen = new Set<string>();
  return [
    SHIELDED_XOR_ASSET_DEFINITION_ID,
    configuredShieldAssetDefinitionId.value,
    shieldedXorBalanceState.value.resolvedAssetId,
    shieldedXorResolvedAssetId.value,
  ]
    .map((value) => String(value ?? "").trim())
    .filter((value) => {
      const normalized = value.toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
});
const shieldedXorAssetId = computed(
  () =>
    shieldedXorBalanceState.value.resolvedAssetId ||
    shieldedXorResolvedAssetId.value ||
    configuredShieldAssetDefinitionId.value ||
    SHIELDED_XOR_ASSET_DEFINITION_ID,
);
const shieldedXorAssetLabel = computed(() =>
  formatAssetDefinitionLabel(
    shieldedXorAssetId.value,
    configuredShieldAssetDefinitionId.value || SHIELDED_XOR_ASSET_DEFINITION_ID,
  ),
);
const transparentXorAsset = computed(() => {
  const targets = shieldedXorTrackedAssetIds.value.map((value) =>
    value.toLowerCase(),
  );
  if (!targets.length) {
    return null;
  }
  return (
    assets.value.find((asset) => {
      const assetId = asset.asset_id.toLowerCase();
      return targets.some(
        (target) =>
          assetId === target ||
          assetId.startsWith(`${target}##`) ||
          assetId.includes(target),
      );
    }) ?? null
  );
});
const transparentXorBalance = computed(
  () => transparentXorAsset.value?.quantity ?? "0",
);
const shieldedXorBalanceExact = computed(
  () => shieldedXorBalanceState.value.exact,
);
const shieldedXorBalanceDisplay = computed(
  () => shieldedXorBalanceState.value.quantity ?? t("—"),
);
const canScanShieldedXor = computed(() =>
  Boolean(
    session.hasAccount &&
      session.connection.toriiUrl &&
      shieldedXorAssetId.value,
  ),
);
const shieldedXorRecoveryMessage = computed(() => {
  const state = shieldedXorBalanceState.value;
  const source =
    state.scanSource === "global-note-index"
      ? t("global note index")
      : t("account history fallback");
  const watermark =
    state.scanWatermarkBlock === null
      ? t("current available history")
      : t("block {block}", { block: state.scanWatermarkBlock });
  if (state.scanStatus === "complete") {
    return t(
      "Recovered {count} shielded note(s) from {source} through {watermark}.",
      {
        count: state.recoveredNoteCount,
        source,
        watermark,
      },
    );
  }
  if (state.scanStatus === "limited") {
    return t(
      "Global note index is unavailable, so recovery is limited to this account history through {watermark}.",
      { watermark },
    );
  }
  return t(
    "Some confidential activity could not be decrypted from on-chain note envelopes; balance may be incomplete.",
  );
});
const canCreateShieldedXor = computed(() =>
  Boolean(
    session.hasAccount &&
      session.connection.toriiUrl &&
      activeAccount.value &&
      shieldedXorCapabilityReady.value &&
      shieldedXorSupported.value &&
      isPositiveWholeAmount(shieldForm.quantity),
  ),
);

const rescanShieldedXor = async () => {
  if (!canScanShieldedXor.value || !activeAccount.value) {
    return;
  }
  shieldScanLoading.value = true;
  shieldError.value = "";
  try {
    const shieldAssetDefinitionId =
      extractAssetDefinitionId(shieldedXorAssetId.value).trim() ||
      shieldedXorAssetId.value;
    shieldedXorBalanceState.value = await scanConfidentialWallet({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      accountId: requestAccountId.value || activeAccount.value.accountId,
      privateKeyHex: activeAccount.value.privateKeyHex,
      assetDefinitionId: shieldAssetDefinitionId,
      force: true,
    });
    shieldMessage.value = t("Shielded note scan complete.");
  } catch (error) {
    shieldError.value = toUserFacingErrorMessage(
      error,
      t("Shielded note scan failed."),
    );
  } finally {
    shieldScanLoading.value = false;
  }
};

const transactions = computed<TransactionView[]>(() =>
  transactionsRaw.value.slice(0, WALLET_TRANSACTION_DISPLAY_LIMIT).map((tx) => {
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

const createShieldedXor = async () => {
  if (!session.connection.toriiUrl || !activeAccount.value) {
    shieldError.value = t("Configure Torii + account first.");
    shieldMessage.value = "";
    return;
  }
  if (!shieldedXorSupported.value) {
    shieldError.value =
      shieldedXorCapabilityMessage.value || t("Shield mode is unavailable.");
    shieldMessage.value = "";
    return;
  }
  const amount = String(shieldForm.quantity).trim();
  if (!isPositiveWholeAmount(amount)) {
    shieldError.value = t("Enter a whole-number shield amount.");
    shieldMessage.value = "";
    return;
  }
  shieldLoading.value = true;
  shieldMessage.value = "";
  shieldError.value = "";
  try {
    const shieldAssetDefinitionId =
      extractAssetDefinitionId(shieldedXorAssetId.value).trim() ||
      shieldedXorAssetId.value;
    const result = await transferAsset({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      assetDefinitionId: shieldAssetDefinitionId,
      accountId: activeAccount.value.accountId,
      destinationAccountId:
        visibleAccountId.value || activeAccount.value.accountId,
      quantity: amount,
      privateKeyHex: activeAccount.value.privateKeyHex,
      shielded: true,
    });
    session.updateActiveAccount({ localOnly: false });
    shieldForm.quantity = "0";
    shieldMessage.value = t("Shield transaction committed: {hash}", {
      hash: result.hash,
    });
    await refresh();
  } catch (error) {
    shieldError.value = toUserFacingErrorMessage(
      error,
      t("Shield mode is unavailable."),
    );
  } finally {
    shieldLoading.value = false;
  }
};

watch(
  [() => session.connection.toriiUrl, () => activeAccount.value?.accountId],
  () => {
    shieldMessage.value = "";
    shieldError.value = "";
    refresh();
  },
  { immediate: true },
);
</script>

<style scoped>
.wallet-layout {
  position: relative;
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

.wallet-shield-panel {
  display: grid;
  gap: 14px;
  margin-top: 18px;
  padding: 18px 20px;
  border-radius: 22px;
  border: 1px solid var(--glass-border);
  background:
    linear-gradient(145deg, var(--glass-veil), transparent 78%),
    linear-gradient(135deg, rgba(255, 198, 112, 0.16), transparent 55%),
    var(--surface-soft);
  box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    var(--shadow-soft);
}

.wallet-shield-header {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
}

.wallet-shield-recovery-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}

.wallet-shield-recovery-row .wallet-shield-note {
  flex: 1 1 260px;
}

.wallet-shield-balance {
  margin: 6px 0 0;
  font-size: clamp(1.35rem, 3vw, 1.8rem);
  font-weight: 700;
  line-height: 1;
}

.wallet-shield-asset {
  margin: 4px 0 0;
  font-weight: 600;
  word-break: break-word;
  unicode-bidi: plaintext;
}

.wallet-shield-kpi {
  display: grid;
  gap: 4px;
  min-width: 150px;
}

.wallet-shield-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: end;
}

.wallet-shield-input {
  display: grid;
  gap: 6px;
  flex: 1 1 200px;
}

.wallet-shield-input input {
  width: 100%;
}

.wallet-shield-note {
  margin: 0;
}

.wallet-action-link {
  flex: 1 1 180px;
}

.wallet-action-link-disabled {
  pointer-events: none;
}

.wallet-faucet-panel {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
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

.wallet-faucet-panel-priority {
  padding: 20px 22px;
  background:
    radial-gradient(
      circle at 0% 50%,
      color-mix(in srgb, var(--iroha-accent) 18%, transparent),
      transparent 48%
    ),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--glass-veil) 90%, transparent),
      color-mix(in srgb, var(--menu-highlight) 42%, transparent)
    );
  box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    0 18px 40px color-mix(in srgb, var(--iroha-accent) 12%, transparent);
}

.wallet-faucet-panel > :first-child {
  flex: 1 1 260px;
}

.wallet-faucet-button {
  flex: 0 0 auto;
}

.wallet-faucet-copy-priority {
  font-size: 0.98rem;
  color: inherit;
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
  color: inherit;
}

.wallet-local-account-note {
  margin: 12px 0 0;
}

.wallet-faucet-error {
  color: var(--accent-danger);
}

.wallet-account-id-note {
  margin: 18px 0 0;
  display: grid;
  gap: 4px;
}

.wallet-account-id-label {
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  color: var(--iroha-muted);
}

.wallet-account-id-value {
  display: block;
  color: inherit;
  word-break: break-all;
  unicode-bidi: plaintext;
}

.wallet-faucet-modal-backdrop {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  padding: 24px;
  border-radius: inherit;
  pointer-events: none;
  background: color-mix(in srgb, var(--surface-base) 40%, transparent);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
}

.wallet-faucet-modal {
  width: min(100%, 420px);
  display: grid;
  justify-items: center;
  gap: 14px;
  padding: 28px 24px;
  text-align: center;
  z-index: 1;
  pointer-events: none;
}

.wallet-faucet-spinner {
  width: 54px;
  height: 54px;
  border-radius: 999px;
  border: 3px solid color-mix(in srgb, var(--glass-border) 88%, transparent);
  border-top-color: var(--accent-primary);
  box-shadow: 0 0 24px
    color-mix(in srgb, var(--accent-primary) 24%, transparent);
  animation: wallet-faucet-spin 0.85s linear infinite;
}

.wallet-faucet-modal-label {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.72rem;
  color: var(--iroha-muted);
}

.wallet-faucet-modal-title {
  margin: 0;
  font-size: clamp(1.2rem, 3vw, 1.5rem);
}

.wallet-faucet-modal-detail {
  margin: 0;
  max-width: 32ch;
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

@keyframes wallet-faucet-spin {
  to {
    transform: rotate(360deg);
  }
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

  .wallet-faucet-panel {
    align-items: stretch;
  }

  .wallet-faucet-button {
    width: 100%;
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
}
</style>
