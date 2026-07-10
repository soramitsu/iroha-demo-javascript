<template>
  <div class="wallet-layout">
    <RouteHeaderAction>
      <AppButton variant="secondary" :disabled="loading" @click="refresh">
        {{ loading ? t("Refreshing…") : t("Refresh") }}
      </AppButton>
    </RouteHeaderAction>

    <section class="wallet-summary-card">
      <header class="wallet-summary-header">
        <div>
          <h2>{{ t("Balances") }}</h2>
          <p class="helper wallet-account-copy">{{ activeAccountLabel }}</p>
        </div>
      </header>
      <div class="wallet-balance-band">
        <div>
          <p class="wallet-balance-label">{{ t("Available balance") }}</p>
          <p class="wallet-balance-value">{{ primaryAssetQuantity }}</p>
          <p class="wallet-balance-asset">{{ primaryAssetLabel }}</p>
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
      </div>

      <div class="wallet-next-step" aria-live="polite">
        <InlineAlert
          v-if="
            !faucetDisabled &&
            (showFundingPriority || faucetUnavailableOnActiveNetwork)
          "
          class="wallet-faucet-panel"
          tone="accent"
          :title="t('Starter funds')"
        >
          <p class="helper wallet-context-copy">
            {{
              faucetUnavailableOnActiveNetwork
                ? t(
                    "Minamoto mainnet has no faucet. Use TAIRA testnet to request starter XOR.",
                  )
                : t("Request starter XOR from the active network faucet.")
            }}
          </p>
          <template #action>
            <AppButton
              class="wallet-faucet-button"
              :disabled="faucetLoading || !canUseFaucetAction"
              @click="requestStarterFundsFromAvailableFaucet"
            >
              {{
                faucetLoading
                  ? t("Requesting…")
                  : faucetUnavailableOnActiveNetwork
                    ? t("Use TAIRA faucet")
                    : t("Request XOR")
              }}
            </AppButton>
          </template>
        </InlineAlert>

        <InlineAlert
          v-else
          class="wallet-citizenship-panel"
          :class="{
            'wallet-citizenship-panel-positive': walletIsCitizen,
          }"
          :tone="walletIsCitizen ? 'success' : 'neutral'"
          :title="walletCitizenshipHeadline"
        >
          <p class="helper wallet-context-copy">
            {{ walletCitizenshipDetail }}
          </p>
          <template #action>
            <div class="wallet-context-actions">
              <AppButton
                v-if="!faucetDisabled"
                class="wallet-faucet-button"
                variant="secondary"
                :disabled="faucetLoading || !canUseFaucetAction"
                @click="requestStarterFundsFromAvailableFaucet"
              >
                {{ faucetLoading ? t("Requesting…") : t("Request XOR") }}
              </AppButton>
              <a
                class="ui-button ui-button-secondary ui-button-md"
                href="#/governance"
              >
                {{ t("Governance") }}
              </a>
            </div>
          </template>
        </InlineAlert>
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
        <p class="transaction-fee-note">
          <span>{{ t("Fee") }}</span>
          <strong>{{
            formatTransactionFee(
              transactionFeeHintForEndpoint(session.connection.toriiUrl),
              t,
            )
          }}</strong>
        </p>
        <div class="wallet-shield-recovery-row">
          <p class="helper wallet-shield-note">
            {{ shieldedXorRecoveryMessage }}
          </p>
          <AppButton
            class="secondary"
            variant="secondary"
            :disabled="shieldScanLoading || !canScanShieldedXor"
            @click="rescanShieldedXor"
          >
            {{
              shieldScanLoading
                ? t("Scanning shielded notes…")
                : t("Rescan private balance")
            }}
          </AppButton>
        </div>
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
      <TechnicalDisclosure
        v-if="assets.length || visibleAccountId"
        class="wallet-details-section"
        :summary="t('Wallet technical details')"
      >
        <p
          v-if="shieldedXorCapabilityMessage"
          class="helper wallet-shield-note"
        >
          {{ shieldedXorCapabilityMessage }}
        </p>
        <p v-else-if="shieldedXorPolicyMode" class="helper wallet-shield-note">
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
        <div
          v-if="assets.length"
          class="table-wrap wallet-table-wrap"
          tabindex="0"
          role="region"
          :aria-label="t('Assets')"
        >
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
      </TechnicalDisclosure>
      <div v-else class="wallet-empty">
        <p class="wallet-empty-title">
          {{ t("No assets found for this account.") }}
        </p>
        <p class="helper">
          {{ t("Share QR or Account ID") }} ·
          {{ t("Transfer assets via Torii") }}
        </p>
      </div>
      <ProgressDialog
        :open="faucetLoading"
        :title="faucetStatusMessage"
        :description="t('Faucet request in progress')"
        :detail="faucetStatusDetail"
        :cancelable="!faucetCanceling"
        :cancel-label="t('Cancel')"
        :close-label="t('Cancel')"
        @cancel="cancelStarterFundsRequest"
      />
    </section>

    <section class="wallet-transactions-card">
      <header class="wallet-transactions-header">
        <h2>{{ t("Latest Transactions") }}</h2>
      </header>
      <div
        v-if="transactions.length"
        class="table-wrap"
        tabindex="0"
        role="region"
        :aria-label="t('Latest Transactions')"
      >
        <table class="table">
          <thead>
            <tr>
              <th>{{ t("Time") }}</th>
              <th>{{ t("Direction") }}</th>
              <th>{{ t("Amount") }}</th>
              <th>{{ t("Counterparty") }}</th>
              <th>{{ t("Fee") }}</th>
              <th>{{ t("Status") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tx in transactions" :key="tx.entrypoint_hash">
              <td>{{ formatDate(tx.timestamp_ms) }}</td>
              <td>{{ tx.direction }}</td>
              <td>{{ tx.amount ?? t("—") }}</td>
              <td>{{ tx.counterparty ?? t("—") }}</td>
              <td>{{ formatTransactionFeeInline(tx, t) }}</td>
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
  AppButton,
  InlineAlert,
  ProgressDialog,
  RouteHeaderAction,
  TechnicalDisclosure,
} from "@/components/ui";
import { MINAMOTO_CHAIN_PRESET, TAIRA_CHAIN_PRESET } from "@/constants/chains";
import {
  cancelFaucetRequest,
  fetchAccountAssets,
  fetchAccountTransactions,
  getConfidentialAssetBalance,
  getGovernanceCitizenStatus,
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
  GovernanceCitizenStatusResponse,
} from "@/types/iroha";
import {
  extractTransferInsight,
  type AccountTransactionLike,
} from "@/utils/transactions";
import { isPositiveWholeAmount } from "@/utils/confidential";
import { getAccountDisplayLabel, getPublicAccountId } from "@/utils/accountId";
import {
  areAssetDefinitionIdsEquivalent,
  extractAssetDefinitionId,
  formatAssetDefinitionLabel,
  formatAssetReferenceLabel,
  resolveToriiXorAsset,
  shouldReplaceConfiguredAssetDefinitionId,
} from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import {
  appendTransactionFee,
  formatTransactionFee,
  formatTransactionFeeInline,
  transactionFeeHintForEndpoint,
} from "@/utils/transactionFee";
import { normalizeEndpointUrl } from "@/utils/endpoint";
import { isRegisteredGovernanceCitizen } from "@/utils/parliament";

const SHIELDED_XOR_ASSET_DEFINITION_ID = "xor#universal";
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
const citizenshipStatus = ref<GovernanceCitizenStatusResponse | null>(null);
const citizenshipStatusLoaded = ref(false);
const governanceStatusError = ref("");
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
const faucetCanceling = ref(false);
const faucetCancelRequested = ref(false);
const faucetRequestId = ref("");
const walletError = ref("");
const requestGeneration = ref(0);
const faucetStatusPhase = ref<WalletFaucetPhase>("requestingPuzzle");
let activeFaucetAbortController: AbortController | null = null;
let faucetRequestSequence = 0;

const readEndpointHost = (value: string) => {
  try {
    return new URL(normalizeEndpointUrl(value)).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const MINAMOTO_TORII_HOST = readEndpointHost(
  MINAMOTO_CHAIN_PRESET.connection.toriiUrl,
);
const TAIRA_TORII_HOST = readEndpointHost(
  TAIRA_CHAIN_PRESET.connection.toriiUrl,
);
const activeToriiHost = computed(() =>
  readEndpointHost(session.connection.toriiUrl),
);
const activeNetworkIsKnownTaira = computed(
  () => activeToriiHost.value === TAIRA_TORII_HOST,
);
const activeNetworkIsKnownMinamoto = computed(() => {
  const chainId = session.connection.chainId.trim().toLowerCase();
  return (
    activeToriiHost.value === MINAMOTO_TORII_HOST ||
    (chainId === MINAMOTO_CHAIN_PRESET.connection.chainId.toLowerCase() &&
      session.connection.networkPrefix ===
        MINAMOTO_CHAIN_PRESET.connection.networkPrefix)
  );
});
const activeNetworkXorAssetDefinitionIds = computed(() => [
  shieldedXorResolvedAssetId.value,
  configuredShieldAssetDefinitionId.value,
  ...(activeNetworkIsKnownMinamoto.value
    ? [MINAMOTO_CHAIN_PRESET.connection.assetDefinitionId]
    : []),
  SHIELDED_XOR_ASSET_DEFINITION_ID,
]);
const fastBalanceAssetDefinitionId = computed(() => {
  const candidate = activeNetworkIsKnownMinamoto.value
    ? MINAMOTO_CHAIN_PRESET.connection.assetDefinitionId
    : shieldedXorResolvedAssetId.value ||
      configuredShieldAssetDefinitionId.value;
  const assetDefinitionId = extractAssetDefinitionId(candidate).trim();
  if (
    !assetDefinitionId ||
    assetDefinitionId.toLowerCase().startsWith("norito:")
  ) {
    return "";
  }
  return assetDefinitionId;
});

const createFaucetCancelError = () => {
  const error = new Error("Faucet request canceled.");
  error.name = "AbortError";
  return error;
};

const readFaucetAbortReason = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : createFaucetCancelError();

const throwIfFaucetCanceled = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw readFaucetAbortReason(signal);
  }
};

const isFaucetCanceledError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AbortError" ||
    /faucet request canceled|operation was aborted/i.test(error.message)
  );
};

const isLikelyMissingLiveAccountError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b404\b|not found|does not exist|missing account/i.test(message);
};

const isLikelyMissingAssetSelectorError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const detail = message.replace(
    /^account assets request failed(?: because)?[^:]*:?\s*/i,
    "",
  );
  return (
    isLikelyMissingLiveAccountError(error) &&
    /\basset|definition|selector|bucket/i.test(detail)
  );
};

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
  citizenshipStatus.value = null;
  citizenshipStatusLoaded.value = false;
  governanceStatusError.value = "";
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

const fetchWalletTransactionPreview = async (input: {
  toriiUrl: string;
  accountId: string;
  networkPrefix?: number;
  privateKeyHex?: string;
}): Promise<AccountTx[]> => {
  const response = await fetchAccountTransactions({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    networkPrefix: input.networkPrefix,
    privateKeyHex: input.privateKeyHex,
    limit: WALLET_TRANSACTION_DISPLAY_LIMIT,
    offset: 0,
  });
  return (response.items ?? []) as AccountTx[];
};

const fetchWalletAssets = async (input: {
  toriiUrl: string;
  accountId: string;
  networkPrefix?: number;
  assetDefinitionId?: string;
}): Promise<AccountAssetsResponse> => {
  const assetDefinitionId = extractAssetDefinitionId(
    input.assetDefinitionId,
  ).trim();
  if (!assetDefinitionId) {
    return fetchAccountAssets({
      toriiUrl: input.toriiUrl,
      accountId: input.accountId,
      networkPrefix: input.networkPrefix,
      limit: 50,
    });
  }

  try {
    const filteredAssets = await fetchAccountAssets({
      toriiUrl: input.toriiUrl,
      accountId: input.accountId,
      networkPrefix: input.networkPrefix,
      assetDefinitionId,
      limit: 8,
    });
    if (filteredAssets.items.length > 0) {
      return filteredAssets;
    }
    return fetchAccountAssets({
      toriiUrl: input.toriiUrl,
      accountId: input.accountId,
      networkPrefix: input.networkPrefix,
      limit: 50,
    });
  } catch (error) {
    if (!isLikelyMissingAssetSelectorError(error)) {
      throw error;
    }
    return fetchAccountAssets({
      toriiUrl: input.toriiUrl,
      accountId: input.accountId,
      networkPrefix: input.networkPrefix,
      limit: 50,
    });
  }
};

const walletRefreshStillCurrent = (
  currentGeneration: number,
  toriiUrl: string,
  accountId: string,
) =>
  currentGeneration === requestGeneration.value &&
  session.connection.toriiUrl === toriiUrl &&
  requestAccountId.value === accountId;

const refreshCitizenshipStatus = async (input: {
  currentGeneration: number;
  toriiUrl: string;
  accountId: string;
  request: Promise<GovernanceCitizenStatusResponse>;
}) => {
  try {
    const status = await input.request;
    if (
      !walletRefreshStillCurrent(
        input.currentGeneration,
        input.toriiUrl,
        input.accountId,
      )
    ) {
      return;
    }
    citizenshipStatusLoaded.value = true;
    citizenshipStatus.value = status;
    governanceStatusError.value = "";
  } catch (error) {
    if (
      !walletRefreshStillCurrent(
        input.currentGeneration,
        input.toriiUrl,
        input.accountId,
      )
    ) {
      return;
    }
    citizenshipStatusLoaded.value = true;
    citizenshipStatus.value = null;
    governanceStatusError.value = toUserFacingErrorMessage(
      error,
      t("Citizen status unavailable"),
    );
  }
};

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const chainId = session.connection.chainId;
  const accountId = requestAccountId.value;
  const networkPrefix = session.connection.networkPrefix;
  const privateKeyHex = activeAccount.value?.privateKeyHex;
  const accountWasLocalOnly = Boolean(activeAccount.value?.localOnly);
  const assetDefinitionId = fastBalanceAssetDefinitionId.value;
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
  citizenshipStatus.value = null;
  citizenshipStatusLoaded.value = false;
  governanceStatusError.value = "";
  const citizenshipRequest = Promise.resolve().then(() =>
    getGovernanceCitizenStatus({
      toriiUrl,
      accountId,
    }),
  );
  void refreshCitizenshipStatus({
    currentGeneration,
    toriiUrl,
    accountId,
    request: citizenshipRequest,
  });
  try {
    const assetsResponse = await fetchWalletAssets({
      toriiUrl,
      accountId,
      networkPrefix,
      assetDefinitionId,
    });
    if (!walletRefreshStillCurrent(currentGeneration, toriiUrl, accountId)) {
      return;
    }
    const assetItems = assetsResponse.items;
    const configuredAssetDefinitionId = extractAssetDefinitionId(
      session.connection.assetDefinitionId,
    ).trim();
    const detectedShieldAsset = resolveToriiXorAsset(assetItems, [
      ...activeNetworkXorAssetDefinitionIds.value,
      configuredAssetDefinitionId,
    ]);
    const confidentialAssetDefinitionId = extractAssetDefinitionId(
      detectedShieldAsset?.asset_id ?? configuredAssetDefinitionId,
    ).trim();
    updateConfiguredAssetDefinitionIdFromLiveEvidence(
      confidentialAssetDefinitionId,
      assetItems.map((asset) => asset.asset_id),
    );
    if (!walletRefreshStillCurrent(currentGeneration, toriiUrl, accountId)) {
      return;
    }
    assets.value = assetItems;
    transactionsRaw.value = [];
    shieldedXorBalanceState.value = emptyConfidentialBalance(
      confidentialAssetDefinitionId || configuredShieldAssetDefinitionId.value,
    );
    if (activeAccount.value?.localOnly) {
      session.updateActiveAccount({ localOnly: false });
    }
    void (async () => {
      let txItems: AccountTx[] = [];
      try {
        txItems = await fetchWalletTransactionPreview({
          toriiUrl,
          accountId,
          networkPrefix,
          privateKeyHex,
        });
      } catch (error) {
        console.warn("Failed to refresh wallet transactions", error);
      }
      if (!walletRefreshStillCurrent(currentGeneration, toriiUrl, accountId)) {
        return;
      }
      transactionsRaw.value = txItems;
      const shouldFetchConfidentialBalance = Boolean(
        confidentialAssetDefinitionId &&
          (!accountWasLocalOnly || assetItems.length || txItems.length),
      );
      if (!shouldFetchConfidentialBalance) {
        shieldedXorBalanceState.value = emptyConfidentialBalance(
          confidentialAssetDefinitionId ||
            configuredShieldAssetDefinitionId.value,
        );
        return;
      }
      try {
        const confidentialBalance = await getConfidentialAssetBalance({
          toriiUrl,
          chainId,
          accountId,
          privateKeyHex,
          assetDefinitionId: confidentialAssetDefinitionId,
        });
        if (
          !walletRefreshStillCurrent(currentGeneration, toriiUrl, accountId)
        ) {
          return;
        }
        shieldedXorBalanceState.value = confidentialBalance;
      } catch (error) {
        console.warn("Failed to refresh confidential balance", error);
      }
    })();
  } catch (error) {
    if (!walletRefreshStillCurrent(currentGeneration, toriiUrl, accountId)) {
      return;
    }
    assets.value = [];
    transactionsRaw.value = [];
    shieldedXorBalanceState.value = emptyConfidentialBalance();
    if (accountWasLocalOnly && isLikelyMissingLiveAccountError(error)) {
      walletError.value = "";
      return;
    }
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

const waitFor = (delayMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(readFaucetAbortReason(signal));
      return;
    }
    let timeoutId: number | null = null;
    let onAbort: (() => void) | null = null;
    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (onAbort) {
        signal?.removeEventListener("abort", onAbort);
      }
    };
    onAbort = () => {
      cleanup();
      reject(
        signal ? readFaucetAbortReason(signal) : createFaucetCancelError(),
      );
    };
    timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const refreshAfterFaucetClaim = async (
  input: {
    assetId: string;
    assetDefinitionId: string;
  },
  signal?: AbortSignal,
) => {
  const normalizedAssetId = input.assetId.trim().toLowerCase();
  const normalizedAssetDefinitionId =
    extractAssetDefinitionId(input.assetDefinitionId).trim() ||
    extractAssetDefinitionId(input.assetId).trim();
  faucetStatusPhase.value = "refreshingWallet";
  for (let attempt = 1; attempt <= FAUCET_REFRESH_MAX_ATTEMPTS; attempt += 1) {
    throwIfFaucetCanceled(signal);
    await refresh();
    throwIfFaucetCanceled(signal);
    if (
      assets.value.some((asset) => {
        const assetId = asset.asset_id.trim();
        const assetDefinitionId =
          extractAssetDefinitionId(asset.asset_definition_id).trim() ||
          extractAssetDefinitionId(assetId).trim();
        return Boolean(
          (normalizedAssetId && assetId.toLowerCase() === normalizedAssetId) ||
            (normalizedAssetDefinitionId &&
              areAssetDefinitionIdsEquivalent(
                assetDefinitionId,
                normalizedAssetDefinitionId,
              )),
        );
      })
    ) {
      return true;
    }
    if (attempt < FAUCET_REFRESH_MAX_ATTEMPTS) {
      await waitFor(FAUCET_REFRESH_DELAY_MS, signal);
    }
  }
  return false;
};

const cancelStarterFundsRequest = async () => {
  if (!faucetLoading.value) {
    return;
  }
  faucetCancelRequested.value = true;
  faucetCanceling.value = true;
  activeFaucetAbortController?.abort(createFaucetCancelError());
  const requestId = faucetRequestId.value;
  if (requestId) {
    try {
      await cancelFaucetRequest({ requestId });
    } catch {
      // The local abort still stops UI-side waiting when bridge cancel fails.
    }
  }
  faucetError.value = "";
  faucetMessage.value = t("Faucet request canceled.");
};

const requestStarterFunds = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const accountId = requestAccountId.value;
  if (!toriiUrl || !accountId || !canRequestFaucet.value) {
    return;
  }
  const shouldConfigureAsset = !session.connection.assetDefinitionId.trim();
  faucetLoading.value = true;
  faucetCanceling.value = false;
  faucetCancelRequested.value = false;
  faucetMessage.value = "";
  faucetError.value = "";
  faucetStatusPhase.value = "requestingPuzzle";
  faucetRequestSequence += 1;
  const requestId = `wallet-faucet-${Date.now()}-${faucetRequestSequence}`;
  const abortController = new AbortController();
  faucetRequestId.value = requestId;
  activeFaucetAbortController = abortController;
  try {
    const result = await requestFaucetFunds(
      {
        toriiUrl,
        accountId,
        networkPrefix: session.connection.networkPrefix,
        requestId,
      },
      (progress) => {
        faucetStatusPhase.value = progress.phase;
      },
    );
    throwIfFaucetCanceled(abortController.signal);
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
    faucetMessage.value = appendTransactionFee(
      t("XOR requested: {hash}", {
        hash: result.tx_hash_hex,
      }),
      result,
      t,
      transactionFeeHintForEndpoint(session.connection.toriiUrl),
    );
    const balanceVisible = await refreshAfterFaucetClaim(
      {
        assetId: result.asset_id,
        assetDefinitionId: result.asset_definition_id,
      },
      abortController.signal,
    );
    if (!balanceVisible) {
      faucetError.value = "";
      faucetMessage.value = t(
        "Faucet accepted, but wallet balances are still indexing. Refresh again in a few seconds.",
      );
    }
  } catch (error) {
    if (faucetCancelRequested.value || isFaucetCanceledError(error)) {
      faucetError.value = "";
      faucetMessage.value = t("Faucet request canceled.");
      return;
    }
    faucetError.value = toUserFacingErrorMessage(
      error,
      t("Failed to request faucet funds."),
    );
  } finally {
    if (faucetRequestId.value === requestId) {
      faucetRequestId.value = "";
    }
    if (activeFaucetAbortController === abortController) {
      activeFaucetAbortController = null;
    }
    faucetCancelRequested.value = false;
    faucetCanceling.value = false;
    faucetLoading.value = false;
  }
};

const requestStarterFundsFromAvailableFaucet = async () => {
  if (!canUseFaucetAction.value) {
    return;
  }
  if (faucetUnavailableOnActiveNetwork.value) {
    session.useChainProfile(TAIRA_CHAIN_PRESET.connection);
  }
  await requestStarterFunds();
};

const primaryAsset = computed(() => {
  return resolveToriiXorAsset(
    assets.value,
    activeNetworkXorAssetDefinitionIds.value,
  );
});

const primaryAssetFallback = computed(
  () =>
    shieldedXorResolvedAssetId.value ||
    configuredShieldAssetDefinitionId.value ||
    (activeNetworkIsKnownMinamoto.value
      ? MINAMOTO_CHAIN_PRESET.connection.assetDefinitionId
      : "") ||
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
const faucetUnavailableOnActiveNetwork = computed(() => {
  if (activeNetworkIsKnownTaira.value) {
    return false;
  }
  return activeNetworkIsKnownMinamoto.value;
});
const canRequestFaucet = computed(() =>
  Boolean(
    !faucetDisabled &&
      session.hasAccount &&
      session.connection.toriiUrl &&
      requestAccountId.value &&
      !faucetUnavailableOnActiveNetwork.value,
  ),
);
const canUseFaucetAction = computed(() =>
  Boolean(
    !faucetDisabled &&
      session.hasAccount &&
      requestAccountId.value &&
      (canRequestFaucet.value || faucetUnavailableOnActiveNetwork.value),
  ),
);
const walletIsCitizen = computed(() =>
  isRegisteredGovernanceCitizen(citizenshipStatus.value),
);
const walletCitizenshipHeadline = computed(() => {
  if (!session.hasAccount || !session.connection.toriiUrl) {
    return t("Set up network and wallet first.");
  }
  if (loading.value && !citizenshipStatusLoaded.value) {
    return t("Checking citizenship…");
  }
  if (walletIsCitizen.value) {
    return t("You are a citizen");
  }
  if (
    governanceStatusError.value ||
    citizenshipStatus.value?.endpointAvailable === false
  ) {
    return t("Citizen status unavailable");
  }
  return t("Not a citizen yet");
});
const walletCitizenshipDetail = computed(() => {
  if (!session.hasAccount || !session.connection.toriiUrl) {
    return t("Set up network and wallet first.");
  }
  if (walletIsCitizen.value) {
    const bondedAmount = citizenshipStatus.value?.amount?.trim();
    return bondedAmount
      ? t("Bonded {amount} XOR", { amount: bondedAmount })
      : t(
          "Citizenship voting permission detected. Bonding is no longer required.",
        );
  }
  if (governanceStatusError.value) {
    return governanceStatusError.value;
  }
  return t("Bond citizenship and vote in governance referenda");
});
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
    ...activeNetworkXorAssetDefinitionIds.value,
    shieldedXorBalanceState.value.resolvedAssetId,
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
    shieldMessage.value = appendTransactionFee(
      t("Shield transaction committed: {hash}", {
        hash: result.hash,
      }),
      result,
      t,
      transactionFeeHintForEndpoint(session.connection.toriiUrl),
    );
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
  display: grid;
  gap: var(--space-6);
  max-width: 1180px;
  margin-inline: auto;
}

.wallet-summary-card,
.wallet-transactions-card {
  min-width: 0;
  padding: clamp(var(--space-4), 3vw, var(--space-6));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.wallet-summary-header,
.wallet-transactions-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.wallet-summary-header h2,
.wallet-transactions-header h2 {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.wallet-account-copy {
  margin: var(--space-1) 0 0;
  overflow-wrap: anywhere;
  unicode-bidi: plaintext;
}

.wallet-balance-band {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--space-5);
  padding: clamp(var(--space-5), 4vw, var(--space-7));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-inset);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.wallet-balance-label,
.wallet-faucet-label,
.wallet-account-id-label {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.wallet-balance-value {
  margin: var(--space-3) 0 0;
  color: var(--color-text-strong);
  font-size: clamp(3.4rem, 9vw, 6.5rem);
  font-weight: 650;
  letter-spacing: -0.07em;
  line-height: 0.86;
}

.wallet-balance-asset,
.wallet-shield-asset {
  margin: var(--space-3) 0 0;
  color: var(--color-text-muted);
  font-size: 0.86rem;
  overflow-wrap: anywhere;
}

.wallet-quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(116px, 1fr));
  gap: var(--space-2);
}

.wallet-action-link {
  min-height: 46px;
  padding: 0 var(--space-4);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-control);
  text-decoration: none;
  transition:
    color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}

.wallet-action-link:hover,
.wallet-action-link:focus-visible {
  color: var(--color-accent);
  border-color: var(--color-accent);
  transform: translateY(-1px);
}

.wallet-action-link-disabled {
  color: var(--color-text-muted);
  background: var(--color-surface-soft);
  box-shadow: var(--shadow-inset);
  cursor: not-allowed;
  pointer-events: none;
}

.wallet-next-step {
  margin-top: var(--space-5);
}

.wallet-faucet-panel,
.wallet-citizenship-panel {
  margin: 0;
}

.wallet-context-copy {
  margin: 0;
}

.wallet-context-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.wallet-next-step :deep(.ui-alert-action) {
  align-self: center;
}

.wallet-faucet-button {
  flex: 0 0 auto;
}

.wallet-shield-panel {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-5);
  padding: clamp(var(--space-4), 3vw, var(--space-5));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel-soft);
  box-shadow: var(--shadow-inset);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.wallet-shield-header {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.wallet-shield-kpi {
  min-width: 0;
  padding-inline-start: var(--space-5);
  border-inline-start: 1px solid var(--color-border);
}

.wallet-shield-balance,
.wallet-shield-kpi .kv-value {
  margin: var(--space-2) 0 0;
  color: var(--color-text-strong);
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  font-weight: 650;
  letter-spacing: -0.045em;
  line-height: 1;
}

.wallet-shield-actions {
  display: grid;
  grid-template-columns: minmax(150px, 220px) auto;
  align-items: end;
  gap: var(--space-3);
}

.wallet-shield-input {
  display: grid;
  gap: 6px;
  color: var(--color-text);
  font-size: 0.8rem;
  font-weight: 650;
}

.wallet-shield-input input {
  width: 100%;
}

.wallet-shield-recovery-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.wallet-shield-recovery-row .wallet-shield-note {
  flex: 1;
}

.wallet-shield-note {
  margin: 0;
}

.wallet-faucet-message,
.wallet-local-account-note {
  margin: var(--space-3) 0 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface-soft);
  box-shadow: var(--shadow-inset);
  overflow-wrap: anywhere;
}

.wallet-faucet-error {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: var(--color-danger-soft);
}

.wallet-details-section {
  margin-top: var(--space-4);
}

.wallet-table-wrap {
  margin-top: var(--space-3);
}

.wallet-account-id-note {
  margin: var(--space-4) 0 0;
  display: grid;
  gap: var(--space-1);
}

.wallet-account-id-value {
  color: var(--color-text);
  overflow-wrap: anywhere;
  unicode-bidi: plaintext;
}

.wallet-empty {
  min-height: 116px;
  padding: var(--space-5) 0 var(--space-1);
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  text-align: center;
}

.wallet-empty-title {
  margin: 0;
  color: var(--color-text-strong);
  font-weight: 700;
}

.wallet-ledger-empty {
  min-height: 180px;
}

.wallet-transactions-card {
  min-height: 240px;
}

.wallet-transactions-card .table-wrap {
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
}

.wallet-transactions-card .table td:last-child,
.wallet-transactions-card .table th:last-child {
  white-space: nowrap;
}

@media (max-width: 720px) {
  .wallet-layout {
    gap: var(--space-5);
  }

  .wallet-summary-card,
  .wallet-transactions-card {
    padding: var(--space-4);
  }

  .wallet-balance-band {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    padding: var(--space-5) var(--space-4);
  }

  .wallet-balance-value {
    font-size: clamp(3.2rem, 20vw, 5.4rem);
  }

  .wallet-quick-actions {
    width: 100%;
  }

  .wallet-faucet-panel,
  .wallet-citizenship-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .wallet-next-step :deep(.ui-alert-action) {
    width: 100%;
  }

  .wallet-context-actions {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .wallet-context-actions > *,
  .wallet-faucet-button {
    width: 100%;
  }

  .wallet-shield-header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }

  .wallet-shield-kpi {
    padding: var(--space-4) 0 0;
    border-inline-start: 0;
    border-top: 1px solid var(--color-border);
  }

  .wallet-shield-actions {
    grid-template-columns: minmax(0, 1fr);
  }

  .wallet-shield-actions > button {
    width: 100%;
  }

  .wallet-shield-recovery-row {
    align-items: stretch;
    flex-direction: column;
  }

  .wallet-shield-recovery-row :deep(.ui-button) {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .wallet-action-link {
    transition: none;
  }
}
</style>
