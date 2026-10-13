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
                v-if="
                  !faucetDisabled &&
                  !showFundingPriority &&
                  !faucetUnavailableOnActiveNetwork
                "
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
                ? t("Scanning private notes…")
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
      <div
        v-if="assetsState === 'loading'"
        class="wallet-empty"
        data-testid="wallet-assets-loading"
        role="status"
      >
        <p class="wallet-empty-title">{{ t("Refreshing…") }}</p>
      </div>
      <div
        v-else-if="assetsState === 'ready' && !assets.length"
        class="wallet-empty"
        data-testid="wallet-assets-empty"
      >
        <p class="wallet-empty-title">
          {{ t("No assets found for this account.") }}
        </p>
        <p class="helper">
          {{ t("Share QR or Account ID") }} ·
          {{ t("Transfer assets via Torii") }}
        </p>
      </div>
      <TechnicalDisclosure
        v-if="assets.length || visibleAccountId"
        class="wallet-details-section"
        :summary="t('Wallet technical details')"
      >
        <p
          v-if="
            confidentialBalanceState === 'ready' && !shieldedXorBalanceExact
          "
          class="helper wallet-shield-note"
        >
          {{
            t(
              "Showing private notes recognized by this wallet. Older or foreign confidential outputs may be missing, so this total is not guaranteed complete or spendable in this release.",
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
              <td>{{ formatTransactionFeeInline(null, t) }}</td>
              <td
                :class="tx.result_ok ? 'status-pill ok' : 'status-pill error'"
              >
                {{ tx.result_ok ? t("Committed") : t("Rejected") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        v-if="transactionsState === 'loading'"
        class="wallet-empty wallet-ledger-empty"
        data-testid="wallet-transactions-loading"
        role="status"
      >
        <p class="wallet-empty-title">{{ t("Refreshing…") }}</p>
        <p class="helper">{{ t("Latest Transactions") }}</p>
      </div>
      <div
        v-else-if="transactionsState === 'error'"
        class="wallet-empty wallet-ledger-empty wallet-ledger-error"
        data-testid="wallet-transactions-error"
        role="alert"
      >
        <p class="wallet-empty-title">{{ t("Unavailable") }}</p>
        <p class="helper">{{ transactionsError }}</p>
      </div>
      <div
        v-else-if="transactionsState === 'ready' && !transactions.length"
        class="wallet-empty wallet-ledger-empty"
        data-testid="wallet-transactions-empty"
      >
        <p class="wallet-empty-title">{{ t("No transfers recorded yet.") }}</p>
        <p class="helper">{{ t("Latest Transactions") }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
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
} from "@/services/iroha";
import { useEndpointStore } from "@/stores/endpoint";
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
  formatTransactionFeeInline,
} from "@/utils/transactionFee";
import { assertAppliedFaucetResult } from "@/utils/transactionFinality";
import { normalizeEndpointUrl } from "@/utils/endpoint";
import { canAttemptFaucetIdentityChallenge } from "@/utils/endpointFeatures";
import { isRegisteredGovernanceCitizen } from "@/utils/parliament";

const WALLET_TRANSACTION_DISPLAY_LIMIT = 25;

const session = useSessionStore();
const endpointStatus = useEndpointStore();
const activeAccount = computed(() => session.activeAccount);
const { localeStore, t } = useAppI18n();
const visibleAccountId = computed(() =>
  getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
);
const requestAccountId = computed(() => visibleAccountId.value);
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
const shieldScanLoading = ref(false);
const shieldMessage = ref("");
const shieldError = ref("");

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
type LiveReadState = "unknown" | "loading" | "ready" | "error";

type WalletMutationContext = {
  generation: number;
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  storedAccountId: string;
};

const FAUCET_REFRESH_MAX_ATTEMPTS = 4;
const FAUCET_REFRESH_DELAY_MS = 1_500;

const assets = ref<AccountAssetsResponse["items"]>([]);
const transactionsRaw = ref<AccountTx[]>([]);
const assetsState = ref<LiveReadState>("unknown");
const transactionsState = ref<LiveReadState>("unknown");
const confidentialBalanceState = ref<LiveReadState>("unknown");
const transactionsError = ref("");
const confidentialBalanceError = ref("");
const citizenshipStatus = ref<GovernanceCitizenStatusResponse | null>(null);
const citizenshipStatusLoaded = ref(false);
const governanceStatusError = ref("");
const unknownConfidentialBalance = (
  resolvedAssetId = configuredShieldAssetDefinitionId.value,
): ConfidentialAssetBalanceView => ({
  resolvedAssetId,
  quantity: null,
  onChainQuantity: null,
  spendableQuantity: "0",
  exact: false,
  scanSource: "account-transactions",
  scanStatus: "incomplete",
  scanWatermarkBlock: null,
  recoveredNoteCount: 0,
  trackedAssetIds: resolvedAssetId ? [resolvedAssetId] : [],
});
const shieldedXorBalanceState = ref<ConfidentialAssetBalanceView>(
  unknownConfidentialBalance(),
);
const hasConfidentialBalanceSnapshot = ref(false);
const loading = computed(() => assetsState.value === "loading");
const faucetLoading = ref(false);
const faucetMessage = ref("");
const faucetError = ref("");
const faucetCanceling = ref(false);
const faucetCancelRequested = ref(false);
const faucetRequestId = ref("");
const walletError = ref("");
const requestGeneration = ref(0);
const walletMutationGeneration = ref(0);
const faucetStatusPhase = ref<WalletFaucetPhase>("requestingPuzzle");
let activeFaucetAbortController: AbortController | null = null;
let faucetRequestSequence = 0;

const captureWalletMutationContext = (): WalletMutationContext | null => {
  const account = activeAccount.value;
  const accountId = requestAccountId.value;
  const { toriiUrl, chainId, networkPrefix } = session.connection;
  if (!account || !toriiUrl || !chainId || !accountId) {
    return null;
  }
  return {
    generation: walletMutationGeneration.value,
    toriiUrl,
    chainId,
    networkPrefix,
    accountId,
    storedAccountId: account.accountId,
  };
};

const walletMutationContextStillCurrent = (context: WalletMutationContext) =>
  context.generation === walletMutationGeneration.value &&
  session.connection.toriiUrl === context.toriiUrl &&
  session.connection.chainId === context.chainId &&
  session.connection.networkPrefix === context.networkPrefix &&
  requestAccountId.value === context.accountId &&
  activeAccount.value?.accountId === context.storedAccountId;

const activeConnectionMatchesPreset = (preset: typeof TAIRA_CHAIN_PRESET) =>
  (() => {
    try {
      return (
        normalizeEndpointUrl(session.connection.toriiUrl) ===
          normalizeEndpointUrl(preset.connection.toriiUrl) &&
        session.connection.chainId.trim().toLowerCase() ===
          preset.connection.chainId.trim().toLowerCase() &&
        session.connection.networkPrefix === preset.connection.networkPrefix
      );
    } catch {
      return false;
    }
  })();
const activeNetworkIsKnownTaira = computed(() =>
  activeConnectionMatchesPreset(TAIRA_CHAIN_PRESET),
);
const activeNetworkIsKnownMinamoto = computed(() =>
  activeConnectionMatchesPreset(MINAMOTO_CHAIN_PRESET),
);
const activeNetworkXorAssetDefinitionIds = computed(() => [
  configuredShieldAssetDefinitionId.value,
  ...(activeNetworkIsKnownMinamoto.value
    ? [MINAMOTO_CHAIN_PRESET.connection.assetDefinitionId]
    : []),
]);
const fastBalanceAssetDefinitionId = computed(() => {
  const candidate = activeNetworkIsKnownMinamoto.value
    ? MINAMOTO_CHAIN_PRESET.connection.assetDefinitionId
    : configuredShieldAssetDefinitionId.value;
  const assetDefinitionId = extractAssetDefinitionId(candidate).trim();
  if (!assetDefinitionId) {
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
  assetsState.value = "unknown";
  transactionsState.value = "unknown";
  confidentialBalanceState.value = "unknown";
  transactionsError.value = "";
  confidentialBalanceError.value = "";
  shieldedXorBalanceState.value = unknownConfidentialBalance();
  hasConfidentialBalanceSnapshot.value = false;
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
    case "waitingForFinality":
      return t("Waiting for faucet transaction finality…");
    case "claimFinalized":
      return t("Faucet transaction finalized. Updating wallet…");
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
      "The network dropped the previous queued faucet claim before finality. Retrying automatically with backoff.",
    );
  }
  return t("Your faucet request is in flight. This can take a few seconds.");
});

const fetchWalletTransactionPreview = async (input: {
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
}): Promise<AccountTx[]> => {
  const response = await fetchAccountTransactions({
    toriiUrl: input.toriiUrl,
    accountId: input.accountId,
    networkPrefix: input.networkPrefix,
    limit: WALLET_TRANSACTION_DISPLAY_LIMIT,
    offset: 0,
  });
  return (response.items ?? []) as AccountTx[];
};

const fetchWalletAssets = async (input: {
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
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
  networkPrefix: number,
) =>
  currentGeneration === requestGeneration.value &&
  session.connection.toriiUrl === toriiUrl &&
  requestAccountId.value === accountId &&
  session.connection.networkPrefix === networkPrefix;

const refreshCitizenshipStatus = async (input: {
  currentGeneration: number;
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
  request: Promise<GovernanceCitizenStatusResponse>;
}) => {
  try {
    const status = await input.request;
    if (
      !walletRefreshStillCurrent(
        input.currentGeneration,
        input.toriiUrl,
        input.accountId,
        input.networkPrefix,
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
        input.networkPrefix,
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

const refreshWalletTransactions = async (input: {
  currentGeneration: number;
  toriiUrl: string;
  accountId: string;
  networkPrefix: number;
}) => {
  try {
    const txItems = await fetchWalletTransactionPreview(input);
    if (
      !walletRefreshStillCurrent(
        input.currentGeneration,
        input.toriiUrl,
        input.accountId,
        input.networkPrefix,
      )
    ) {
      return;
    }
    transactionsRaw.value = txItems;
    transactionsState.value = "ready";
    transactionsError.value = "";
  } catch (error) {
    if (
      !walletRefreshStillCurrent(
        input.currentGeneration,
        input.toriiUrl,
        input.accountId,
        input.networkPrefix,
      )
    ) {
      return;
    }
    console.warn("Failed to refresh wallet transactions", error);
    transactionsState.value = "error";
    transactionsError.value = toUserFacingErrorMessage(error, t("Unavailable"));
  }
};

const refreshWalletConfidentialBalance = async (input: {
  currentGeneration: number;
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
  assetDefinitionId: string;
}) => {
  confidentialBalanceState.value = "loading";
  confidentialBalanceError.value = "";
  try {
    const confidentialBalance = await getConfidentialAssetBalance({
      toriiUrl: input.toriiUrl,
      chainId: input.chainId,
      networkPrefix: input.networkPrefix,
      accountId: input.accountId,
      assetDefinitionId: input.assetDefinitionId,
    });
    if (
      !walletRefreshStillCurrent(
        input.currentGeneration,
        input.toriiUrl,
        input.accountId,
        input.networkPrefix,
      )
    ) {
      return;
    }
    shieldedXorBalanceState.value = confidentialBalance;
    hasConfidentialBalanceSnapshot.value = true;
    confidentialBalanceState.value = "ready";
    confidentialBalanceError.value = "";
  } catch (error) {
    if (
      !walletRefreshStillCurrent(
        input.currentGeneration,
        input.toriiUrl,
        input.accountId,
        input.networkPrefix,
      )
    ) {
      return;
    }
    console.warn("Failed to refresh confidential balance", error);
    confidentialBalanceState.value = "error";
    confidentialBalanceError.value = toUserFacingErrorMessage(
      error,
      t("Unavailable"),
    );
  }
};

const refresh = async () => {
  const toriiUrl = session.connection.toriiUrl;
  const chainId = session.connection.chainId;
  const accountId = requestAccountId.value;
  const networkPrefix = session.connection.networkPrefix;
  const accountWasLocalOnly = Boolean(activeAccount.value?.localOnly);
  const assetDefinitionId = fastBalanceAssetDefinitionId.value;
  if (!session.hasAccount || !toriiUrl || !accountId) {
    requestGeneration.value += 1;
    resetWalletState();
    return;
  }
  const currentGeneration = requestGeneration.value + 1;
  requestGeneration.value = currentGeneration;
  assetsState.value = "loading";
  transactionsState.value = "loading";
  confidentialBalanceState.value = hasConfidentialBalanceSnapshot.value
    ? "loading"
    : "unknown";
  transactionsError.value = "";
  confidentialBalanceError.value = "";
  walletError.value = "";
  citizenshipStatus.value = null;
  citizenshipStatusLoaded.value = false;
  governanceStatusError.value = "";
  const citizenshipRequest = Promise.resolve().then(() =>
    getGovernanceCitizenStatus({
      toriiUrl,
      accountId,
      networkPrefix,
    }),
  );
  void refreshCitizenshipStatus({
    currentGeneration,
    toriiUrl,
    accountId,
    networkPrefix,
    request: citizenshipRequest,
  });
  void refreshWalletTransactions({
    currentGeneration,
    toriiUrl,
    accountId,
    networkPrefix,
  });
  try {
    const assetsResponse = await fetchWalletAssets({
      toriiUrl,
      accountId,
      networkPrefix,
      assetDefinitionId,
    });
    if (
      !walletRefreshStillCurrent(
        currentGeneration,
        toriiUrl,
        accountId,
        networkPrefix,
      )
    ) {
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
    if (
      !walletRefreshStillCurrent(
        currentGeneration,
        toriiUrl,
        accountId,
        networkPrefix,
      )
    ) {
      return;
    }
    assets.value = assetItems;
    assetsState.value = "ready";
    walletError.value = "";
    if (activeAccount.value?.localOnly) {
      session.updateActiveAccount({ localOnly: false });
    }
    const shouldFetchConfidentialBalance = Boolean(
      confidentialAssetDefinitionId &&
        (!accountWasLocalOnly || assetItems.length > 0),
    );
    if (shouldFetchConfidentialBalance) {
      void refreshWalletConfidentialBalance({
        currentGeneration,
        toriiUrl,
        chainId,
        accountId,
        networkPrefix,
        assetDefinitionId: confidentialAssetDefinitionId,
      });
    }
  } catch (error) {
    if (
      !walletRefreshStillCurrent(
        currentGeneration,
        toriiUrl,
        accountId,
        networkPrefix,
      )
    ) {
      return;
    }
    if (accountWasLocalOnly && isLikelyMissingLiveAccountError(error)) {
      assets.value = [];
      assetsState.value = "ready";
      walletError.value = "";
      return;
    }
    assetsState.value = "error";
    walletError.value = toUserFacingErrorMessage(
      error,
      t("Wallet data is unavailable until this account exists on-chain."),
    );
    if (hasConfidentialBalanceSnapshot.value) {
      confidentialBalanceState.value = "error";
      confidentialBalanceError.value = walletError.value;
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
  context: WalletMutationContext,
  requestId: string,
  signal?: AbortSignal,
) => {
  const requestStillCurrent = () =>
    faucetRequestId.value === requestId &&
    walletMutationContextStillCurrent(context);
  if (!requestStillCurrent()) {
    return false;
  }
  const requestedAssetId = input.assetId.trim();
  const requestedAssetDefinitionId =
    extractAssetDefinitionId(input.assetDefinitionId).trim() ||
    extractAssetDefinitionId(input.assetId).trim();
  faucetStatusPhase.value = "refreshingWallet";
  for (let attempt = 1; attempt <= FAUCET_REFRESH_MAX_ATTEMPTS; attempt += 1) {
    throwIfFaucetCanceled(signal);
    if (!requestStillCurrent()) {
      return false;
    }
    await refresh();
    throwIfFaucetCanceled(signal);
    if (!requestStillCurrent()) {
      return false;
    }
    if (
      assets.value.some((asset) => {
        const assetId = asset.asset_id.trim();
        const assetDefinitionId =
          extractAssetDefinitionId(asset.asset_definition_id).trim() ||
          extractAssetDefinitionId(assetId).trim();
        return Boolean(
          (requestedAssetId && assetId === requestedAssetId) ||
            (requestedAssetDefinitionId &&
              areAssetDefinitionIdsEquivalent(
                assetDefinitionId,
                requestedAssetDefinitionId,
              )),
        );
      })
    ) {
      return true;
    }
    if (attempt < FAUCET_REFRESH_MAX_ATTEMPTS) {
      await waitFor(FAUCET_REFRESH_DELAY_MS, signal);
      if (!requestStillCurrent()) {
        return false;
      }
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
  if (faucetRequestId.value !== requestId) {
    return;
  }
  faucetError.value = "";
  faucetMessage.value = t("Faucet request canceled.");
};

const requestStarterFunds = async () => {
  const context = captureWalletMutationContext();
  if (!context || !canRequestFaucet.value) {
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
        toriiUrl: context.toriiUrl,
        chainId: context.chainId,
        accountId: context.accountId,
        networkPrefix: context.networkPrefix,
        requestId,
      },
      (progress) => {
        if (
          faucetRequestId.value === requestId &&
          walletMutationContextStillCurrent(context)
        ) {
          faucetStatusPhase.value = progress.phase;
        }
      },
    );
    throwIfFaucetCanceled(abortController.signal);
    if (
      faucetRequestId.value !== requestId ||
      !walletMutationContextStillCurrent(context)
    ) {
      return;
    }
    const applied = assertAppliedFaucetResult(result);
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
    faucetStatusPhase.value = "claimFinalized";
    faucetMessage.value = appendTransactionFee(
      `${t("XOR requested: {hash}", {
        hash: applied.hash,
      })} · ${t("Block {height}", {
        height: applied.blockHeight,
      })}`,
      null,
      t,
    );
    const balanceVisible = await refreshAfterFaucetClaim(
      {
        assetId: result.asset_id,
        assetDefinitionId: result.asset_definition_id,
      },
      context,
      requestId,
      abortController.signal,
    );
    if (
      faucetRequestId.value !== requestId ||
      !walletMutationContextStillCurrent(context)
    ) {
      return;
    }
    if (!balanceVisible) {
      faucetError.value = "";
      faucetMessage.value = t(
        "Faucet transaction finalized, but wallet balances are still indexing. Refresh again in a few seconds.",
      );
    }
  } catch (error) {
    if (
      faucetRequestId.value !== requestId ||
      !walletMutationContextStillCurrent(context)
    ) {
      return;
    }
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
    const ownsCurrentRequest =
      faucetRequestId.value === requestId &&
      walletMutationContextStillCurrent(context);
    if (ownsCurrentRequest) {
      faucetRequestId.value = "";
    }
    if (activeFaucetAbortController === abortController) {
      activeFaucetAbortController = null;
    }
    if (ownsCurrentRequest) {
      faucetCancelRequested.value = false;
      faucetCanceling.value = false;
      faucetLoading.value = false;
    }
  }
};

const requestStarterFundsFromAvailableFaucet = async () => {
  if (!canUseFaucetAction.value) {
    return;
  }
  if (faucetUnavailableOnActiveNetwork.value) {
    session.useChainProfile(TAIRA_CHAIN_PRESET.connection);
    await nextTick();
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
    configuredShieldAssetDefinitionId.value ||
    (activeNetworkIsKnownMinamoto.value
      ? MINAMOTO_CHAIN_PRESET.connection.assetDefinitionId
      : ""),
);

const primaryAssetLabel = computed(() => {
  return formatAssetDefinitionLabel(
    primaryAsset.value?.asset_id ?? primaryAssetFallback.value,
    t("—"),
  );
});
const primaryAssetQuantity = computed(() => {
  if (primaryAsset.value) {
    return primaryAsset.value.quantity;
  }
  if (assetsState.value === "loading" || assetsState.value === "unknown") {
    return t("—");
  }
  return assetsState.value === "error" ? t("Unavailable") : "0";
});
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
      ((canRequestFaucet.value &&
        canAttemptFaucetIdentityChallenge(endpointStatus.inspection)) ||
        faucetUnavailableOnActiveNetwork.value),
  ),
);
const walletIsCitizen = computed(() =>
  isRegisteredGovernanceCitizen(citizenshipStatus.value),
);
const walletCitizenshipHeadline = computed(() => {
  if (!session.hasAccount || !session.connection.toriiUrl) {
    return t("Set up network and wallet first.");
  }
  if (!citizenshipStatusLoaded.value) {
    return t("Checking citizenship…");
  }
  if (walletIsCitizen.value) {
    return t("You are a citizen");
  }
  if (
    governanceStatusError.value ||
    citizenshipStatus.value?.state === "unavailable"
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
      : t("Citizenship status detected. Bonding is no longer required.");
  }
  if (!citizenshipStatusLoaded.value) {
    return t("Checking citizenship…");
  }
  if (
    governanceStatusError.value ||
    citizenshipStatus.value?.state === "unavailable"
  ) {
    return governanceStatusError.value || t("Citizen status unavailable");
  }
  if (!endpointStatus.writeAllowed) {
    return (
      endpointStatus.diagnostic ||
      t("Endpoint identity could not be verified. Reads remain available.")
    );
  }
  return t("Bond citizenship to participate in governance.");
});
const showFundingPriority = computed(() =>
  Boolean(
    activeAccount.value?.localOnly ||
      (assetsState.value === "ready" &&
        (!primaryAsset.value || Number(primaryAsset.value.quantity) <= 0)),
  ),
);
const canSendAssets = computed(
  () =>
    assetsState.value === "ready" &&
    Boolean(primaryAsset.value && Number(primaryAsset.value.quantity) > 0),
);
const hasRecoveredConfidentialBalance = computed(
  () =>
    confidentialBalanceState.value === "ready" &&
    (Number(shieldedXorBalanceState.value.quantity ?? "0") > 0 ||
      shieldedXorBalanceState.value.recoveredNoteCount > 0),
);
const showShieldSection = computed(() =>
  Boolean(
    (assetsState.value === "ready" && primaryAsset.value) ||
      confidentialBalanceState.value === "loading" ||
      hasRecoveredConfidentialBalance.value ||
      confidentialBalanceState.value === "error" ||
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
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
});
const shieldedXorAssetId = computed(
  () =>
    shieldedXorBalanceState.value.resolvedAssetId ||
    configuredShieldAssetDefinitionId.value ||
    (activeNetworkIsKnownMinamoto.value
      ? MINAMOTO_CHAIN_PRESET.connection.assetDefinitionId
      : ""),
);
const shieldedXorAssetLabel = computed(() =>
  formatAssetDefinitionLabel(
    shieldedXorAssetId.value,
    configuredShieldAssetDefinitionId.value ||
      (activeNetworkIsKnownMinamoto.value
        ? MINAMOTO_CHAIN_PRESET.connection.assetDefinitionId
        : t("—")),
  ),
);
const transparentXorAsset = computed(() => {
  if (assetsState.value === "unknown") {
    return null;
  }
  return resolveToriiXorAsset(assets.value, shieldedXorTrackedAssetIds.value);
});
const transparentXorBalance = computed(() => {
  if (transparentXorAsset.value) {
    return transparentXorAsset.value.quantity;
  }
  if (assetsState.value === "loading" || assetsState.value === "unknown") {
    return t("—");
  }
  return assetsState.value === "error" ? t("Unavailable") : "0";
});
const shieldedXorBalanceExact = computed(
  () =>
    confidentialBalanceState.value === "ready" &&
    shieldedXorBalanceState.value.exact,
);
const shieldedXorBalanceDisplay = computed(() => {
  if (hasConfidentialBalanceSnapshot.value) {
    return shieldedXorBalanceState.value.quantity ?? t("—");
  }
  if (
    confidentialBalanceState.value === "loading" ||
    confidentialBalanceState.value === "unknown"
  ) {
    return t("—");
  }
  return t("Unavailable");
});
const canScanShieldedXor = computed(() =>
  Boolean(
    session.hasAccount &&
      session.connection.toriiUrl &&
      shieldedXorAssetId.value,
  ),
);
const shieldedXorRecoveryMessage = computed(() => {
  if (confidentialBalanceState.value === "error") {
    return confidentialBalanceError.value || t("Unavailable");
  }
  if (confidentialBalanceState.value === "loading") {
    return t("Refreshing…");
  }
  if (confidentialBalanceState.value !== "ready") {
    return t("—");
  }
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
      "Recovered {count} private note(s) from {source} through {watermark}.",
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
const rescanShieldedXor = async () => {
  if (!canScanShieldedXor.value || !activeAccount.value) {
    return;
  }
  shieldScanLoading.value = true;
  shieldError.value = "";
  confidentialBalanceState.value = "loading";
  confidentialBalanceError.value = "";
  try {
    const shieldAssetDefinitionId =
      extractAssetDefinitionId(shieldedXorAssetId.value).trim() ||
      shieldedXorAssetId.value;
    shieldedXorBalanceState.value = await scanConfidentialWallet({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      networkPrefix: session.connection.networkPrefix,
      accountId: requestAccountId.value,
      assetDefinitionId: shieldAssetDefinitionId,
    });
    hasConfidentialBalanceSnapshot.value = true;
    confidentialBalanceState.value = "ready";
    confidentialBalanceError.value = "";
    shieldMessage.value = t("Private note scan complete.");
  } catch (error) {
    shieldError.value = toUserFacingErrorMessage(
      error,
      t("Private note scan failed."),
    );
    confidentialBalanceState.value = "error";
    confidentialBalanceError.value = shieldError.value;
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

watch(
  () =>
    JSON.stringify([
      session.connection.toriiUrl,
      session.connection.chainId,
      session.connection.networkPrefix,
      requestAccountId.value,
      activeAccount.value?.accountId ?? "",
    ]),
  () => {
    walletMutationGeneration.value += 1;
    resetWalletState();
    activeFaucetAbortController?.abort(createFaucetCancelError());
    activeFaucetAbortController = null;
    faucetRequestId.value = "";
    faucetCancelRequested.value = false;
    faucetCanceling.value = false;
    faucetLoading.value = false;
    faucetMessage.value = "";
    faucetError.value = "";
    shieldMessage.value = "";
    shieldError.value = "";
    void refresh();
  },
  { immediate: true, flush: "sync" },
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
  display: grid;
  gap: var(--space-3);
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
