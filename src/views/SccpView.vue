<template>
  <div class="sccp-shell">
    <section class="card sccp-command-card">
      <header class="card-header sccp-command-header">
        <div>
          <h2>{{ t("SCCP Bridge") }}</h2>
          <p class="helper">
            {{
              t("Bridge XOR between TAIRA and {network}.", {
                network: routeNetworkLabel,
              })
            }}
          </p>
        </div>
        <div class="sccp-command-actions">
          <div
            class="sccp-route-toggle"
            role="tablist"
            :aria-label="t('SCCP route')"
          >
            <button
              type="button"
              class="secondary"
              :class="{ active: selectedCounterparty === 'tron' }"
              @click="selectCounterparty('tron')"
            >
              {{ t("TRON") }}
            </button>
            <button
              type="button"
              class="secondary"
              :class="{ active: selectedCounterparty === 'bsc' }"
              @click="selectCounterparty('bsc')"
            >
              {{ routeBscNetworkLabel }}
            </button>
          </div>
          <button
            type="button"
            class="secondary"
            :disabled="bridge.loading.value"
            @click="refreshAll"
          >
            {{ bridge.loading.value ? t("Refreshing") : t("Refresh route") }}
          </button>
          <button
            v-if="activeWalletConnected"
            type="button"
            class="secondary"
            :disabled="activeWalletDisconnecting"
            @click="disconnectCounterparty"
          >
            {{
              activeWalletDisconnecting
                ? t("Disconnecting")
                : isBscRoute
                  ? t("Disconnect BSC")
                  : t("Disconnect TRON")
            }}
          </button>
          <button
            v-else
            type="button"
            :disabled="tronConnectDisabled"
            @click="connectCounterparty"
          >
            {{
              activeWalletConnecting
                ? t("Connecting")
                : isBscRoute
                  ? t("Connect BSC wallet")
                  : t("Connect TRON wallet")
            }}
          </button>
        </div>
      </header>

      <div class="sccp-status-grid">
        <div class="kv">
          <span class="kv-label">{{ t("TAIRA account") }}</span>
          <span class="kv-value mono">{{ activeAccountLabel }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ activeWalletLabel }}</span>
          <span class="kv-value mono">{{
            activeWalletShortAddress || t("Not connected")
          }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Route") }}</span>
          <span class="kv-value">{{ bridge.snapshot.value.route.label }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("XOR balance") }}</span>
          <span class="kv-value">{{ xorBalanceLabel }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ counterpartyGasSymbol }}</span>
          <span class="kv-value">{{ counterpartyGasBalanceLabel }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ counterpartyTokenSymbol }}</span>
          <span class="kv-value">{{ counterpartyXorBalanceLabel }}</span>
        </div>
      </div>

      <div class="sccp-route-strip">
        <span class="pill" :class="routeTone">{{ routeStatusLabel }}</span>
        <span class="pill" :class="{ positive: activeProjectConfigured }">
          {{
            activeProjectConfigurationError
              ? t("WalletConnect misconfigured")
              : activeProjectConfigured
                ? t("WalletConnect ready")
                : t("WalletConnect not configured")
          }}
        </span>
        <span class="pill" :class="{ positive: isTairaRoute }">
          {{ isTairaRoute ? t("TAIRA enabled") : t("TAIRA only") }}
        </span>
      </div>

      <div v-if="routeMessages.length" class="sccp-reasons">
        <p v-for="message in routeMessages" :key="message" class="helper">
          {{ t(message) }}
        </p>
      </div>
      <p v-if="activeWalletError" class="helper error-text">
        {{ activeWalletError }}
      </p>
      <p v-if="bridge.error.value" class="helper error-text">
        {{ bridge.error.value }}
      </p>
      <p v-if="counterpartyBalanceError" class="helper error-text">
        {{ counterpartyBalanceError }}
      </p>
    </section>

    <section class="card sccp-bridge-card">
      <div
        class="sccp-direction-tabs"
        role="tablist"
        :aria-label="t('Bridge direction')"
      >
        <button
          type="button"
          :class="{ active: isForwardDirection }"
          @click="setForwardDirection"
        >
          {{ t(forwardDirectionLabel) }}
        </button>
        <button
          type="button"
          :class="{ active: isReturnDirection }"
          @click="setReturnDirection"
        >
          {{ t(returnDirectionLabel) }}
        </button>
      </div>

      <form class="sccp-form" @submit.prevent="prepareBridge">
        <label>
          <span>{{ t("Amount (XOR)") }}</span>
          <input
            v-model.trim="amount"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            :placeholder="t('0.0001')"
          />
        </label>
        <label v-if="isForwardDirection">
          <span>{{ t(counterpartyRecipientLabel) }}</span>
          <input
            v-if="isTronRoute"
            v-model.trim="tronRecipient"
            type="text"
            autocomplete="off"
            :placeholder="t('TRON Base58Check address')"
          />
          <input
            v-else
            v-model.trim="bscRecipient"
            type="text"
            autocomplete="off"
            :placeholder="t('0x... BSC address')"
          />
        </label>
        <label v-else>
          <span>{{ t("TAIRA recipient") }}</span>
          <input
            v-model.trim="tairaRecipient"
            type="text"
            autocomplete="off"
            :placeholder="t('testu... account')"
          />
        </label>
        <label>
          <span>{{ t("Message ID") }}</span>
          <input
            v-model.trim="messageId"
            type="text"
            autocomplete="off"
            :placeholder="t('Optional 32-byte SCCP message id')"
          />
        </label>
        <label v-if="isReturnDirection">
          <span>{{ t(counterpartyTransactionIdLabel) }}</span>
          <input
            v-model.trim="tronTxId"
            type="text"
            autocomplete="off"
            :placeholder="t(counterpartyTransactionIdPlaceholder)"
          />
        </label>

        <div class="sccp-form-actions">
          <button type="submit" :disabled="submitDisabled">
            {{ t(primaryActionLabel) }}
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="proofFetchDisabled"
            @click="fetchMessageJob"
          >
            {{ proofLoading ? t("Loading proof job") : t("Fetch proof job") }}
          </button>
        </div>
      </form>

      <p v-if="formError" class="helper error-text">{{ formError }}</p>
      <p v-else class="helper">{{ actionHint }}</p>
    </section>

    <section class="sccp-lower-grid">
      <section class="card sccp-progress-card">
        <header class="card-header">
          <div>
            <h2>{{ t("Proof progress") }}</h2>
            <p class="helper">{{ t("Frontend proof orchestration status") }}</p>
          </div>
          <span class="pill" :class="{ positive: proofReady }">
            {{ proofReady ? t("Proof package ready") : t("Waiting") }}
          </span>
        </header>
        <ol class="sccp-progress-list">
          <li
            v-for="phase in proofPhases"
            :key="phase.label"
            :class="phase.state"
          >
            <span>{{ t(phase.label) }}</span>
            <small>{{ t(phase.detail) }}</small>
          </li>
        </ol>
      </section>

      <section class="card sccp-activity-card">
        <header class="card-header">
          <div>
            <h2>{{ t("Route activity") }}</h2>
            <p class="helper">{{ t("Recent SCCP messages from Torii") }}</p>
          </div>
          <span class="pill">{{ n(bridge.recentMessages.value.length) }}</span>
        </header>
        <div
          v-if="bridge.recentMessages.value.length"
          class="sccp-activity-list"
        >
          <div
            v-for="(item, index) in bridge.recentMessages.value"
            :key="String(item.message_id ?? item.messageId ?? index)"
            class="sccp-activity-item"
          >
            <span class="mono">{{
              shortValue(
                String(item.message_id ?? item.messageId ?? t("Unknown")),
              )
            }}</span>
            <small>{{
              String(item.kind ?? item.payload_kind ?? t("Message"))
            }}</small>
          </div>
        </div>
        <p v-else class="helper">{{ t("No recent SCCP messages found.") }}</p>
      </section>
    </section>

    <section class="card sccp-links-card">
      <header class="card-header">
        <div>
          <h2>{{ t("Transaction links") }}</h2>
          <p class="helper">
            {{ t("Links appear after a bridge leg is submitted.") }}
          </p>
        </div>
      </header>
      <div v-if="transactionLinks.length" class="sccp-link-list">
        <a
          v-for="link in transactionLinks"
          :key="link.href"
          :href="link.href"
          target="_blank"
          rel="noreferrer"
        >
          {{ link.label }}
        </a>
      </div>
      <p v-else class="helper">{{ t("No transaction links yet.") }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useSessionStore } from "@/stores/session";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSccpBridge } from "@/composables/useSccpBridge";
import { useBscWalletConnect } from "@/composables/useBscWalletConnect";
import { useTronWalletConnect } from "@/composables/useTronWalletConnect";
import { TAIRA_EXPLORER_URL } from "@/constants/chains";
import {
  broadcastTronTransaction,
  callEvmContract,
  getEvmBalance,
  getEvmBlockByHash,
  getEvmChainId,
  getEvmLogs,
  getEvmTransaction,
  getEvmTransactionReceipt,
  getSccpMessageProofBundle,
  getSccpMessageProofJob,
  getTronAccount,
  getTronFinalityData,
  getTronTransaction,
  getTronTransactionEvents,
  getTronTransactionReceipt,
  getZkIvmProveJob,
  startZkIvmProveJob,
  submitSccpBridgeMessage,
  submitZkIvmProvedTransaction,
  triggerTronConstantContract,
  triggerTronSmartContract,
  waitForSccpTransactionCommit,
} from "@/services/iroha";
import { formatAssetDefinitionLabel } from "@/utils/assetId";
import { getAccountDisplayLabel } from "@/utils/accountId";
import {
  isLikelyTairaAccount,
  isTairaSccpNetwork,
  normalizeBscAddress,
  normalizeTronAddress,
  isValidBscAddress,
  isValidTronBase58CheckAddress,
  bindTronFinalitySnapshot,
  bindSignedTronTransactionForBroadcast,
  bindTronBroadcastResult,
  bindTronSourceDataForProof,
  bindTronToTairaSourceProofPackage,
  bindBscSourceDataForProof,
  bindBscToTairaSourceProofPackage,
  readBscSourceProverMaterialBinding,
  bindUnsignedTronSmartContractTransaction,
  buildSccpMessageBundleSubmitPayload,
  buildTairaExplorerTransactionUrl,
  buildTairaXorBurnTriggerRequest,
  buildTairaXorBscBurnTransactionRequest,
  buildTairaXorBscFinalizeProofBinding,
  buildTairaXorBscFinalizeTransactionRequest,
  buildTairaXorBscMessageProofJobQueryMaterial,
  buildTairaXorBscOutboundBurnRecordRequest,
  buildTairaXorOutboundBurnRecordRequest,
  buildTairaXorTokenBalanceRequest,
  evmFunctionSelector,
  buildTairaXorFinalizeProofBinding,
  buildTairaXorFinalizeTriggerRequest,
  buildTairaXorMessageProofJobQueryMaterial,
  cloneSccpJsonRouteManifest,
  formatBaseUnitAmount,
  formatTronSunBalance,
  normalizeBridgeAmount,
  normalizeBscTransactionHash,
  normalizeSccpMessageId,
  normalizeTairaTransactionHash,
  normalizeTronTransactionId,
  readTronAccountBalanceSun,
  readTronConstantUint256,
  readSccpTronBridgeAddress,
  readSccpBscBridgeAddress,
  readSccpBscRpcEndpoint,
  readSccpBscSourceBridgeAddress,
  readSccpBscTokenAddress,
  readSccpTronGatewayEndpoint,
  SCCP_EVM_SOURCE_EVENT_TOPIC,
  SCCP_BSC_NETWORK,
  SCCP_BSC_TOKEN_SYMBOL,
  SCCP_ROUTE_PROFILES,
  SCCP_TRON_NETWORK,
  SCCP_XOR_ASSET_KEY,
  SCCP_TRON_TOKEN_SYMBOL,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  type SccpCounterpartyKey,
  type SccpBridgeDirection,
  type BscToTairaSourceProofPackage,
  type BscToTairaSourceProofPackageInput,
  type TronToTairaSourceProofPackage,
  type TronToTairaSourceProofPackageInput,
} from "@/utils/sccp";
import type {
  BscSccpProofPackage,
  BscSccpProofPackageInput,
  TronSccpProofPackage,
  TronSccpProofPackageInput,
} from "@/utils/sccpProofPackage";

const session = useSessionStore();
const { t, n } = useAppI18n();
const selectedCounterparty = ref<SccpCounterpartyKey>("tron");
const activeRoute = computed(
  () => SCCP_ROUTE_PROFILES[selectedCounterparty.value],
);
const bridge = useSccpBridge(activeRoute);
const tron = useTronWalletConnect();
const bsc = useBscWalletConnect();

const direction = ref<SccpBridgeDirection>("taira-to-tron");
const amount = ref("");
const tronRecipient = ref("");
const bscRecipient = ref("");
const tairaRecipient = ref(session.activeAccount?.accountId ?? "");
const messageId = ref("");
const tronTxId = ref("");
const formError = ref("");
const proofLoading = ref(false);
const proofReady = ref(false);
const tronBalanceLoading = ref(false);
const tronTrxBalanceSun = ref<string | null>(null);
const tronXorBalanceBaseUnits = ref<string | null>(null);
const tronBalanceError = ref("");
const bscBalanceLoading = ref(false);
const bscBnbBalanceWei = ref<string | null>(null);
const bscXorBalanceBaseUnits = ref<string | null>(null);
const bscBalanceError = ref("");
const transactionLinks = ref<Array<{ label: string; href: string }>>([]);
const proofPhases = ref([
  {
    label: "Validate route",
    detail: "Waiting for route readiness",
    state: "pending",
  },
  {
    label: "Gather chain data",
    detail: "Waiting for source transaction data",
    state: "pending",
  },
  {
    label: "Generate proof",
    detail: "Worker idle",
    state: "pending",
  },
  {
    label: "Submit target leg",
    detail: "Waiting for wallet approval",
    state: "pending",
  },
]);
const SCCP_PROOF_WORKER_TIMEOUT_MS = 120_000;
const SCCP_PROOF_JOB_INDEXING_POLL_ATTEMPTS = 10;
const SCCP_PROOF_JOB_INDEXING_POLL_MS = 3_000;
const SCCP_TRON_SOURCE_DATA_POLL_ATTEMPTS = 40;
const SCCP_TRON_SOURCE_DATA_POLL_MS = 3_000;
const SCCP_BSC_CONFIRMATION_POLL_ATTEMPTS = 40;
const SCCP_BSC_CONFIRMATION_POLL_MS = 3_000;
const SCCP_BSC_SOURCE_DATA_POLL_ATTEMPTS = 40;
const SCCP_BSC_SOURCE_DATA_POLL_MS = 3_000;

const isTairaRoute = computed(() => isTairaSccpNetwork(session.connection));
const isTronRoute = computed(() => selectedCounterparty.value === "tron");
const isBscRoute = computed(() => selectedCounterparty.value === "bsc");
const routeBscNetworkLabel = computed(() => t(SCCP_BSC_NETWORK.label));
const routeNetworkLabel = computed(() =>
  isBscRoute.value ? SCCP_BSC_NETWORK.label : SCCP_TRON_NETWORK.label,
);
const activeWalletLabel = computed(() =>
  isBscRoute.value ? t("BSC wallet") : t("TRON wallet"),
);
const activeWalletShortAddress = computed(() =>
  isBscRoute.value ? bsc.shortAddress.value : tron.shortAddress.value,
);
const activeProjectConfigured = computed(() =>
  isBscRoute.value ? bsc.projectConfigured.value : tron.projectConfigured.value,
);
const activeProjectConfigurationError = computed(() =>
  isBscRoute.value
    ? bsc.projectConfigurationError.value
    : tron.projectConfigurationError.value,
);
const activeWalletConnected = computed(() =>
  isBscRoute.value ? bsc.connected.value : tron.connected.value,
);
const activeWalletConnecting = computed(() =>
  isBscRoute.value ? bsc.connecting.value : tron.connecting.value,
);
const activeWalletDisconnecting = computed(() =>
  isBscRoute.value ? bsc.disconnecting.value : tron.disconnecting.value,
);
const activeWalletError = computed(() =>
  isBscRoute.value ? bsc.error.value : tron.error.value,
);
const activeAccountLabel = computed(() =>
  getAccountDisplayLabel(
    session.activeAccount,
    t("No active wallet"),
    session.connection.networkPrefix,
  ),
);
const routeStatusLabel = computed(() => {
  if (!isTairaRoute.value) {
    return t("Unavailable on this network");
  }
  if (bridge.readiness.value.ready) {
    return t("Route ready");
  }
  if (bridge.loading.value) {
    return t("Checking route");
  }
  return t("Route not ready");
});
const routeTone = computed(() => ({
  positive: bridge.readiness.value.ready,
  warning: !bridge.readiness.value.ready && isTairaRoute.value,
}));
const routeMessages = computed(() => {
  if (!isTairaRoute.value) {
    return ["SCCP bridging is enabled only on TAIRA testnet."];
  }
  return bridge.readiness.value.reasons;
});
const xorBalanceLabel = computed(() => {
  const balance = bridge.balances.value.find((item) =>
    [
      item.asset_alias,
      item.asset_name,
      item.asset_definition_id,
      item.asset_id,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(SCCP_XOR_ASSET_KEY),
    ),
  );
  if (!balance) {
    return t("Not loaded");
  }
  return `${balance.quantity} ${formatAssetDefinitionLabel(
    balance.asset_definition_id || balance.asset_id,
    "XOR",
  )}`;
});
const tronTrxBalanceLabel = computed(() => {
  if (!tron.connected.value) {
    return t("Not connected");
  }
  if (tronTrxBalanceSun.value === null || tronBalanceLoading.value) {
    return t("Not loaded");
  }
  return `${formatTronSunBalance(tronTrxBalanceSun.value)} TRX`;
});
const tronXorBalanceLabel = computed(() => {
  if (!tron.connected.value) {
    return t("Not connected");
  }
  if (tronXorBalanceBaseUnits.value === null || tronBalanceLoading.value) {
    return t("Not loaded");
  }
  return `${formatBaseUnitAmount(tronXorBalanceBaseUnits.value)} ${SCCP_TRON_TOKEN_SYMBOL}`;
});
const bscBnbBalanceLabel = computed(() => {
  if (!bsc.connected.value) {
    return t("Not connected");
  }
  if (bscBnbBalanceWei.value === null || bscBalanceLoading.value) {
    return t("Not loaded");
  }
  return `${formatBaseUnitAmount(bscBnbBalanceWei.value)} BNB`;
});
const bscXorBalanceLabel = computed(() => {
  if (!bsc.connected.value) {
    return t("Not connected");
  }
  if (bscXorBalanceBaseUnits.value === null || bscBalanceLoading.value) {
    return t("Not loaded");
  }
  return `${formatBaseUnitAmount(bscXorBalanceBaseUnits.value)} ${SCCP_BSC_TOKEN_SYMBOL}`;
});
const counterpartyGasBalanceLabel = computed(() =>
  isBscRoute.value ? bscBnbBalanceLabel.value : tronTrxBalanceLabel.value,
);
const counterpartyXorBalanceLabel = computed(() =>
  isBscRoute.value ? bscXorBalanceLabel.value : tronXorBalanceLabel.value,
);
const counterpartyGasSymbol = computed(() =>
  isBscRoute.value ? "BNB" : "TRX",
);
const counterpartyTokenSymbol = computed(() =>
  isBscRoute.value ? SCCP_BSC_TOKEN_SYMBOL : SCCP_TRON_TOKEN_SYMBOL,
);
const counterpartyBalanceError = computed(() =>
  isBscRoute.value ? bscBalanceError.value : tronBalanceError.value,
);
const isForwardDirection = computed(
  () =>
    direction.value === "taira-to-tron" || direction.value === "taira-to-bsc",
);
const isReturnDirection = computed(
  () =>
    direction.value === "tron-to-taira" || direction.value === "bsc-to-taira",
);
const forwardDirectionLabel = computed(() =>
  isBscRoute.value ? "TAIRA -> BSC" : "TAIRA -> TRON",
);
const returnDirectionLabel = computed(() =>
  isBscRoute.value ? "BSC -> TAIRA" : "TRON -> TAIRA",
);
const counterpartyRecipientLabel = computed(() =>
  isBscRoute.value ? "BSC recipient" : "TRON recipient",
);
const counterpartyTransactionIdLabel = computed(() =>
  isBscRoute.value ? "BSC transaction hash" : "TRON transaction ID",
);
const counterpartyTransactionIdPlaceholder = computed(() =>
  isBscRoute.value
    ? "Optional BSC burn transaction hash"
    : "Optional TRON burn transaction id",
);
const amountValid = computed(() => {
  try {
    return Boolean(normalizeBridgeAmount(amount.value));
  } catch (_error) {
    return false;
  }
});
const destinationValid = computed(() =>
  direction.value === "taira-to-tron"
    ? isValidTronBase58CheckAddress(tronRecipient.value)
    : direction.value === "taira-to-bsc"
      ? isValidBscAddress(bscRecipient.value)
      : isLikelyTairaAccount(tairaRecipient.value),
);
const submitDisabled = computed(
  () =>
    !bridge.readiness.value.ready ||
    !activeProjectConfigured.value ||
    !activeWalletConnected.value ||
    !amountValid.value ||
    !destinationValid.value ||
    proofLoading.value,
);
const tronConnectDisabled = computed(
  () =>
    !isTairaRoute.value ||
    !activeProjectConfigured.value ||
    activeWalletConnecting.value,
);
const proofFetchDisabled = computed(
  () =>
    (direction.value === "taira-to-tron" || direction.value === "taira-to-bsc"
      ? !messageId.value
      : !tronTxId.value) ||
    !bridge.readiness.value.ready ||
    !activeProjectConfigured.value ||
    !activeWalletConnected.value ||
    !amountValid.value ||
    !destinationValid.value ||
    proofLoading.value,
);
const primaryActionLabel = computed(() =>
  direction.value === "taira-to-tron"
    ? "Prepare TAIRA -> TRON"
    : direction.value === "tron-to-taira"
      ? "Prepare TRON -> TAIRA"
      : direction.value === "taira-to-bsc"
        ? "Prepare TAIRA -> BSC"
        : "Prepare BSC -> TAIRA",
);
const walletConnectMissingMessage = computed(() =>
  isBscRoute.value
    ? "WalletConnect project ID is missing, so wallet connection is disabled."
    : "WalletConnect project ID is missing, so TRON wallet connection is disabled.",
);
const walletConnectInvalidMessage = computed(() =>
  isBscRoute.value
    ? "WalletConnect project ID is invalid, so wallet connection is disabled."
    : "WalletConnect project ID is invalid, so TRON wallet connection is disabled.",
);
const actionHint = computed(() => {
  if (!isTairaRoute.value) {
    return t("Switch to the TAIRA testnet profile to use this bridge.");
  }
  if (activeProjectConfigurationError.value) {
    return t(walletConnectInvalidMessage.value);
  }
  if (!activeProjectConfigured.value) {
    return t(walletConnectMissingMessage.value);
  }
  if (!activeWalletConnected.value) {
    return isBscRoute.value
      ? t("Connect a BSC wallet to continue.")
      : t("Connect a TRON wallet to continue.");
  }
  if (!bridge.readiness.value.ready) {
    return t("Route readiness must be true before bridge actions are enabled.");
  }
  return t(
    "Bridge actions will request explicit wallet approval before signing.",
  );
});

const setForwardDirection = () => {
  direction.value = isBscRoute.value ? "taira-to-bsc" : "taira-to-tron";
};

const setReturnDirection = () => {
  direction.value = isBscRoute.value ? "bsc-to-taira" : "tron-to-taira";
};

const selectCounterparty = (counterparty: SccpCounterpartyKey) => {
  if (selectedCounterparty.value === counterparty) {
    return;
  }
  selectedCounterparty.value = counterparty;
  setForwardDirection();
  resetProofPhases();
  bridge.resetState();
  void refreshAll();
};

const shortValue = (value: string): string =>
  value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`${label} must be an object.`);
};

const readJobId = (value: Record<string, unknown>): string => {
  const jobId = String(value.job_id ?? value.jobId ?? "").trim();
  if (!/^[0-9a-f]{32}$/iu.test(jobId)) {
    throw new Error("Torii did not return a valid ZK IVM prove job id.");
  }
  return jobId.toLowerCase();
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const isRetryableSccpProofJobError = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error))
    .trim()
    .toLowerCase();
  return /(?:404|not found|not ready|not indexed|indexing|pending|timeout|timed out|fetch failed|network|unavailable)/u.test(
    message,
  );
};

const retryableChainReadErrorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).trim().toLowerCase();

const isRetryableChainReadErrorMessage = (message: string): boolean =>
  /(?:404|not found|not ready|not indexed|indexing|pending|timeout|timed out|fetch failed|network|unavailable)/u.test(
    message,
  );

const isRetryableTronSourceDataError = (error: unknown): boolean => {
  const message = retryableChainReadErrorMessage(error);
  return (
    isRetryableChainReadErrorMessage(message) ||
    /(?:solid block has not finalized|must include at least one event|receipt .*tx id|32-byte tron transaction id)/u.test(
      message,
    )
  );
};

const isRetryableBscConfirmationError = (error: unknown): boolean => {
  const message = retryableChainReadErrorMessage(error);
  return (
    isRetryableChainReadErrorMessage(message) ||
    /(?:receipt is not finalized yet)/u.test(message)
  );
};

const isRetryableBscSourceDataError = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error))
    .trim()
    .toLowerCase();
  return (
    isRetryableChainReadErrorMessage(message) ||
    /(?:receipt is not finalized yet)/u.test(message)
  );
};

const readTronReceiptStatusText = (
  receipt: Record<string, unknown>,
): string | null => {
  const nested =
    typeof receipt.receipt === "object" &&
    receipt.receipt !== null &&
    !Array.isArray(receipt.receipt)
      ? (receipt.receipt as Record<string, unknown>)
      : null;
  for (const candidate of [
    receipt.result,
    receipt.contractRet,
    receipt.contract_ret,
    nested?.result,
    nested?.contractRet,
    nested?.contract_ret,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().toUpperCase();
    }
  }
  return null;
};

const readTronReceiptTxIdText = (
  receipt: Record<string, unknown>,
): string | null => {
  for (const candidate of [
    receipt.id,
    receipt.txID,
    receipt.txid,
    receipt.txId,
    receipt.transactionId,
    receipt.transaction_id,
    receipt.transaction_id_hex,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return normalizeTronTransactionId(candidate);
    }
  }
  return null;
};

const waitForTronTransactionSuccess = async (
  context: SccpOperationContext,
  txId: string,
  label: string,
): Promise<Record<string, unknown>> => {
  let lastError: unknown = null;
  for (
    let attempt = 0;
    attempt < SCCP_TRON_SOURCE_DATA_POLL_ATTEMPTS;
    attempt += 1
  ) {
    try {
      assertSccpOperationContextCurrent(context);
      const receipt = asRecord(
        await getTronTransactionReceipt({
          endpoint: context.tronGatewayEndpoint,
          txId,
        }),
        `${label} receipt`,
      );
      const receiptTxId = readTronReceiptTxIdText(receipt);
      if (receiptTxId && receiptTxId !== txId) {
        throw new Error(`${label} receipt id does not match the broadcast.`);
      }
      const status = readTronReceiptStatusText(receipt);
      if (status === "SUCCESS") {
        return receipt;
      }
      if (!status) {
        throw new Error(`${label} receipt is not indexed yet.`);
      }
      throw new Error(`${label} failed with ${status}.`);
    } catch (error) {
      lastError = error;
      if (
        !isRetryableTronSourceDataError(error) ||
        attempt >= SCCP_TRON_SOURCE_DATA_POLL_ATTEMPTS - 1
      ) {
        break;
      }
      markPhase(3, "active", `Waiting for ${label} confirmation`);
      await wait(SCCP_TRON_SOURCE_DATA_POLL_MS);
    }
  }
  if (lastError && !isRetryableTronSourceDataError(lastError)) {
    throw lastError;
  }
  throw new Error(`Timed out waiting for ${label} confirmation.`);
};

const readEvmReceiptStatusOk = (
  receipt: Record<string, unknown>,
): boolean | null => {
  const status = receipt.status;
  if (typeof status === "string" && status.trim()) {
    const normalized = status.trim().toLowerCase();
    if (normalized === "0x1" || normalized === "1") {
      return true;
    }
    if (normalized === "0x0" || normalized === "0") {
      return false;
    }
  }
  if (typeof status === "number") {
    if (status === 1) {
      return true;
    }
    if (status === 0) {
      return false;
    }
  }
  return null;
};

const waitForBscTransactionSuccess = async (
  context: SccpOperationContext,
  txHash: string,
  label: string,
): Promise<Record<string, unknown>> => {
  const normalizedTxHash = normalizeBscTransactionHash(txHash);
  let lastError: unknown = null;
  for (
    let attempt = 0;
    attempt < SCCP_BSC_CONFIRMATION_POLL_ATTEMPTS;
    attempt += 1
  ) {
    try {
      assertSccpOperationContextCurrent(context);
      const receipt = await getEvmTransactionReceipt({
        endpoint: context.bscRpcEndpoint,
        txHash: normalizedTxHash,
      });
      if (!receipt) {
        throw new Error(`${label} receipt is not indexed yet.`);
      }
      const receiptHashText = String(
        receipt.transactionHash ?? receipt.transaction_hash ?? "",
      ).trim();
      if (!receiptHashText) {
        throw new Error(`${label} receipt is missing transaction hash.`);
      }
      const receiptHash = normalizeBscTransactionHash(receiptHashText);
      if (receiptHash !== normalizedTxHash) {
        throw new Error(`${label} receipt hash does not match the broadcast.`);
      }
      const status = readEvmReceiptStatusOk(receipt);
      if (status === true) {
        return receipt;
      }
      if (status === null) {
        throw new Error(`${label} receipt is not finalized yet.`);
      }
      throw new Error(`${label} failed on BSC.`);
    } catch (error) {
      lastError = error;
      if (
        !isRetryableBscConfirmationError(error) ||
        attempt >= SCCP_BSC_CONFIRMATION_POLL_ATTEMPTS - 1
      ) {
        break;
      }
      markPhase(3, "active", `Waiting for ${label} confirmation`);
      await wait(SCCP_BSC_CONFIRMATION_POLL_MS);
    }
  }
  if (lastError && !isRetryableBscConfirmationError(lastError)) {
    throw lastError;
  }
  throw new Error(`Timed out waiting for ${label} confirmation.`);
};

const readBscWalletTransactionHash = (
  sendResult: unknown,
  label: string,
): string => {
  try {
    if (typeof sendResult === "string") {
      return normalizeBscTransactionHash(sendResult);
    }
    const record =
      typeof sendResult === "object" &&
      sendResult !== null &&
      !Array.isArray(sendResult)
        ? (sendResult as Record<string, unknown>)
        : null;
    return normalizeBscTransactionHash(
      String(
        record?.hash ?? record?.txHash ?? record?.transactionHash ?? "",
      ).trim(),
    );
  } catch (_error) {
    throw new Error(`${label} did not return a 32-byte BSC transaction hash.`);
  }
};

type SccpProofWorkerRequest =
  | {
      kind: "prove-bsc-proof-package";
      input: BscSccpProofPackageInput;
    }
  | {
      kind: "build-tron-proof-package" | "prove-tron-proof-package";
      input: TronSccpProofPackageInput;
    }
  | {
      kind: "prove-tron-source-package";
      input: TronToTairaSourceProofPackageInput;
    }
  | {
      kind: "prove-bsc-source-package";
      input: BscSourceProofWorkerInput;
    };

type BscSourceProofWorkerInput = Omit<
  BscToTairaSourceProofPackageInput,
  "proofArtifactHash" | "provingKeyHash" | "nativeEvmProverBundleHash"
>;

type SccpOperationContext = {
  direction: SccpBridgeDirection;
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  tronAddress: string;
  bscAddress: string;
  amountDecimal: string;
  tronRecipient: string;
  bscRecipient: string;
  tairaRecipient: string;
  manifest: Record<string, unknown>;
  tronGatewayEndpoint: string;
  bscRpcEndpoint: string;
  manifestFingerprint: string;
  messageId?: string;
  tronTxId?: string;
  bscTxId?: string;
};

const SCCP_CONTEXT_CHANGED_ERROR =
  "SCCP bridge context changed; restart the bridge action after route, wallet, account, or form changes.";

function runSccpProofWorker<Result>(
  request: SccpProofWorkerRequest,
): Promise<Result> {
  if (typeof Worker === "undefined") {
    throw new Error("Browser proof worker is unavailable in this environment.");
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/sccpProver.worker.ts", import.meta.url),
      { type: "module" },
    );
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "SCCP proof worker timed out before returning a bound proof package.",
        ),
      );
    }, SCCP_PROOF_WORKER_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };
    worker.onmessage = (
      event: MessageEvent<{
        id: string;
        ok: boolean;
        result?: Result;
        error?: string;
      }>,
    ) => {
      if (event.data.id !== id) {
        return;
      }
      cleanup();
      if (event.data.ok) {
        if (
          event.data.result &&
          typeof event.data.result === "object" &&
          !Array.isArray(event.data.result)
        ) {
          resolve(event.data.result);
          return;
        }
        reject(
          new Error("SCCP proof worker returned an invalid proof package."),
        );
        return;
      }
      reject(new Error(event.data.error || "SCCP proof worker failed."));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "SCCP proof worker failed."));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("SCCP proof worker returned an unreadable response."));
    };
    worker.postMessage({ id, ...request });
  });
}

const runTronProofWorker = (
  kind: "build-tron-proof-package" | "prove-tron-proof-package",
  input: TronSccpProofPackageInput,
): Promise<TronSccpProofPackage> =>
  runSccpProofWorker<TronSccpProofPackage>({ kind, input });

const runBscProofWorker = (
  kind: "prove-bsc-proof-package",
  input: BscSccpProofPackageInput,
): Promise<BscSccpProofPackage> =>
  runSccpProofWorker<BscSccpProofPackage>({ kind, input });

const runTronSourceProofWorker = (
  input: TronToTairaSourceProofPackageInput,
): Promise<TronToTairaSourceProofPackage> =>
  runSccpProofWorker<TronToTairaSourceProofPackage>({
    kind: "prove-tron-source-package",
    input,
  });

const runBscSourceProofWorker = (
  input: BscSourceProofWorkerInput,
): Promise<BscToTairaSourceProofPackage> =>
  runSccpProofWorker<BscToTairaSourceProofPackage>({
    kind: "prove-bsc-source-package",
    input,
  });

const cloneSccpManifestSnapshot = (
  manifest: Record<string, unknown>,
): Record<string, unknown> => cloneSccpJsonRouteManifest(manifest);

const fingerprintSccpManifest = (manifest: Record<string, unknown>): string =>
  JSON.stringify(cloneSccpManifestSnapshot(manifest));

const readCurrentBscAddress = (): string => {
  try {
    return normalizeBscAddress(bsc.address.value);
  } catch (_error) {
    return "";
  }
};

const readCurrentBscRecipient = (): string => {
  try {
    return normalizeBscAddress(bscRecipient.value);
  } catch (_error) {
    return bscRecipient.value.trim();
  }
};

const readCurrentBscTransactionHash = (): string => {
  try {
    return normalizeBscTransactionHash(tronTxId.value);
  } catch (_error) {
    return "";
  }
};

const createSccpOperationContext = (
  ids: Pick<SccpOperationContext, "messageId" | "tronTxId" | "bscTxId"> = {},
): SccpOperationContext => {
  const manifest = isBscRoute.value
    ? bridge.readiness.value.bscManifest
    : bridge.readiness.value.tronManifest;
  if (!bridge.readiness.value.ready || !manifest) {
    throw new Error(
      routeMessages.value[0] ||
        "Route readiness must be true before bridge actions are enabled.",
    );
  }
  const manifestSnapshot = cloneSccpManifestSnapshot(manifest);
  const activeBscRoute = isBscRoute.value;
  return {
    direction: direction.value,
    toriiUrl: session.connection.toriiUrl,
    chainId: session.connection.chainId,
    networkPrefix: session.connection.networkPrefix,
    accountId: session.activeAccount?.accountId ?? "",
    tronAddress: activeBscRoute ? "" : normalizeTronAddress(tron.address.value),
    bscAddress: activeBscRoute ? normalizeBscAddress(bsc.address.value) : "",
    amountDecimal: normalizeBridgeAmount(amount.value),
    tronRecipient: tronRecipient.value.trim(),
    bscRecipient:
      activeBscRoute && direction.value === "taira-to-bsc"
        ? normalizeBscAddress(bscRecipient.value)
        : bscRecipient.value.trim(),
    tairaRecipient: tairaRecipient.value.trim(),
    manifest: manifestSnapshot,
    tronGatewayEndpoint: activeBscRoute
      ? ""
      : readSccpTronGatewayEndpoint(manifestSnapshot, SCCP_TRON_NETWORK.key),
    bscRpcEndpoint: activeBscRoute
      ? readSccpBscRpcEndpoint(manifestSnapshot, SCCP_BSC_NETWORK.key)
      : "",
    manifestFingerprint: fingerprintSccpManifest(manifestSnapshot),
    ...ids,
  };
};

const assertSccpOperationContextCurrent = (
  context: SccpOperationContext,
): void => {
  const contextIsBsc =
    context.direction === "taira-to-bsc" ||
    context.direction === "bsc-to-taira";
  const currentManifest = contextIsBsc
    ? bridge.readiness.value.bscManifest
    : bridge.readiness.value.tronManifest;
  if (
    !bridge.readiness.value.ready ||
    !currentManifest ||
    context.direction !== direction.value ||
    context.toriiUrl !== session.connection.toriiUrl ||
    context.chainId !== session.connection.chainId ||
    context.networkPrefix !== session.connection.networkPrefix ||
    context.accountId !== (session.activeAccount?.accountId ?? "") ||
    (!contextIsBsc && context.tronAddress !== tron.address.value) ||
    (contextIsBsc && context.bscAddress !== readCurrentBscAddress()) ||
    context.amountDecimal !== normalizeBridgeAmount(amount.value) ||
    (!contextIsBsc && context.tronRecipient !== tronRecipient.value.trim()) ||
    (contextIsBsc &&
      context.direction === "taira-to-bsc" &&
      context.bscRecipient !== readCurrentBscRecipient()) ||
    (contextIsBsc &&
      context.direction !== "taira-to-bsc" &&
      context.bscRecipient !== bscRecipient.value.trim()) ||
    context.tairaRecipient !== tairaRecipient.value.trim() ||
    (!contextIsBsc &&
      context.tronGatewayEndpoint !==
        readSccpTronGatewayEndpoint(currentManifest, SCCP_TRON_NETWORK.key)) ||
    (contextIsBsc &&
      context.bscRpcEndpoint !==
        readSccpBscRpcEndpoint(currentManifest, SCCP_BSC_NETWORK.key)) ||
    context.manifestFingerprint !== fingerprintSccpManifest(currentManifest) ||
    (context.messageId !== undefined &&
      context.messageId !== messageId.value.trim().toLowerCase()) ||
    (context.tronTxId !== undefined &&
      context.tronTxId !== tronTxId.value.trim().toLowerCase()) ||
    (context.bscTxId !== undefined &&
      context.bscTxId !== readCurrentBscTransactionHash())
  ) {
    throw new Error(SCCP_CONTEXT_CHANGED_ERROR);
  }
};

const loadTairaMessageProofJob = async (
  context: SccpOperationContext,
  input: { pollForIndexing?: boolean } = {},
): Promise<Record<string, unknown>> => {
  const baseRequest = {
    toriiUrl: context.toriiUrl,
    messageId: context.messageId ?? messageId.value,
  };
  const buildRequest = async () => {
    const messageBundle = await getSccpMessageProofBundle(baseRequest);
    assertSccpOperationContextCurrent(context);
    return {
      ...baseRequest,
      ...(context.direction === "taira-to-bsc"
        ? buildTairaXorBscMessageProofJobQueryMaterial({
            manifest: context.manifest,
            messageBundle,
            messageId: baseRequest.messageId,
            bscNetwork: SCCP_BSC_NETWORK.key,
          })
        : buildTairaXorMessageProofJobQueryMaterial({
            manifest: context.manifest,
            messageBundle,
            messageId: baseRequest.messageId,
            tronNetwork: SCCP_TRON_NETWORK.key,
          })),
    };
  };
  if (!input.pollForIndexing) {
    assertSccpOperationContextCurrent(context);
    const request = await buildRequest();
    assertSccpOperationContextCurrent(context);
    return getSccpMessageProofJob(request);
  }
  let lastError: unknown = null;
  for (
    let attempt = 0;
    attempt < SCCP_PROOF_JOB_INDEXING_POLL_ATTEMPTS;
    attempt += 1
  ) {
    try {
      assertSccpOperationContextCurrent(context);
      const request = await buildRequest();
      assertSccpOperationContextCurrent(context);
      return await getSccpMessageProofJob(request);
    } catch (error) {
      lastError = error;
      if (
        !isRetryableSccpProofJobError(error) ||
        attempt >= SCCP_PROOF_JOB_INDEXING_POLL_ATTEMPTS - 1
      ) {
        break;
      }
      markPhase(1, "active", "Waiting for SCCP proof job indexing");
      await wait(SCCP_PROOF_JOB_INDEXING_POLL_MS);
    }
  }
  if (lastError && !isRetryableSccpProofJobError(lastError)) {
    throw lastError;
  }
  throw new Error("Timed out waiting for Torii to index the SCCP proof job.");
};

const loadTronSourceDataForProof = async (input: {
  context: SccpOperationContext;
  txId: string;
  pollForFinality?: boolean;
}) => {
  const readSourceData = async () => {
    assertSccpOperationContextCurrent(input.context);
    const [transaction, receipt, events, finality] = await Promise.all([
      getTronTransaction({
        endpoint: input.context.tronGatewayEndpoint,
        txId: input.txId,
      }),
      getTronTransactionReceipt({
        endpoint: input.context.tronGatewayEndpoint,
        txId: input.txId,
      }),
      getTronTransactionEvents({
        endpoint: input.context.tronGatewayEndpoint,
        txId: input.txId,
      }),
      getTronFinalityData({
        endpoint: input.context.tronGatewayEndpoint,
      }),
    ]);
    return bindTronSourceDataForProof({
      txId: input.txId,
      transaction,
      receipt,
      events,
      finality,
      bridgeAddress: readSccpTronBridgeAddress(input.context.manifest),
      tronSender: input.context.tronAddress,
      tairaRecipient: input.context.tairaRecipient,
      amountDecimal: input.context.amountDecimal,
    });
  };
  if (!input.pollForFinality) {
    return readSourceData();
  }
  let lastError: unknown = null;
  for (
    let attempt = 0;
    attempt < SCCP_TRON_SOURCE_DATA_POLL_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await readSourceData();
    } catch (error) {
      lastError = error;
      if (
        !isRetryableTronSourceDataError(error) ||
        attempt >= SCCP_TRON_SOURCE_DATA_POLL_ATTEMPTS - 1
      ) {
        break;
      }
      markPhase(1, "active", "Waiting for TRON finality and event indexing");
      await wait(SCCP_TRON_SOURCE_DATA_POLL_MS);
    }
  }
  if (lastError && !isRetryableTronSourceDataError(lastError)) {
    throw lastError;
  }
  throw new Error(
    "Timed out waiting for TRON finality and bridge event indexing.",
  );
};

const loadBscSourceDataForProof = async (input: {
  context: SccpOperationContext;
  txId: string;
  pollForFinality?: boolean;
}) => {
  const txHash = normalizeBscTransactionHash(input.txId);
  const readSourceData = async () => {
    assertSccpOperationContextCurrent(input.context);
    const [transaction, receipt] = await Promise.all([
      getEvmTransaction({
        endpoint: input.context.bscRpcEndpoint,
        txHash,
      }),
      getEvmTransactionReceipt({
        endpoint: input.context.bscRpcEndpoint,
        txHash,
      }),
    ]);
    if (!transaction) {
      throw new Error("BSC source transaction is not indexed yet.");
    }
    if (!receipt) {
      throw new Error("BSC source transaction receipt is not indexed yet.");
    }
    const receiptRecord = asRecord(receipt, "BSC source transaction receipt");
    const receiptBlockNumber = String(receiptRecord.blockNumber ?? "").trim();
    const blockHash = String(
      receiptRecord.blockHash ?? receiptRecord.block_hash ?? "",
    ).trim();
    if (!receiptBlockNumber) {
      throw new Error(
        "BSC source transaction receipt block number is not indexed yet.",
      );
    }
    if (!blockHash) {
      throw new Error(
        "BSC source transaction receipt block hash is not indexed yet.",
      );
    }
    const sourceBridgeAddress = readSccpBscSourceBridgeAddress(
      input.context.manifest,
    );
    const [block, indexedLogs] = await Promise.all([
      getEvmBlockByHash({
        endpoint: input.context.bscRpcEndpoint,
        blockHash,
        fullTransactions: false,
      }),
      getEvmLogs({
        endpoint: input.context.bscRpcEndpoint,
        address: sourceBridgeAddress,
        blockHash,
        topics: [SCCP_EVM_SOURCE_EVENT_TOPIC],
      }),
    ]);
    if (!block) {
      throw new Error("BSC source block is not indexed yet.");
    }
    return bindBscSourceDataForProof({
      txId: txHash,
      transaction,
      receipt: receiptRecord,
      indexedLogs,
      block,
      bridgeAddress: readSccpBscBridgeAddress(input.context.manifest),
      sourceBridgeAddress,
      bscSender: input.context.bscAddress,
      tairaRecipient: input.context.tairaRecipient,
      amountDecimal: input.context.amountDecimal,
    });
  };
  if (!input.pollForFinality) {
    return readSourceData();
  }
  let lastError: unknown = null;
  for (
    let attempt = 0;
    attempt < SCCP_BSC_SOURCE_DATA_POLL_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await readSourceData();
    } catch (error) {
      lastError = error;
      if (
        !isRetryableBscSourceDataError(error) ||
        attempt >= SCCP_BSC_SOURCE_DATA_POLL_ATTEMPTS - 1
      ) {
        break;
      }
      markPhase(1, "active", "Waiting for BSC receipt and block indexing");
      await wait(SCCP_BSC_SOURCE_DATA_POLL_MS);
    }
  }
  if (lastError && !isRetryableBscSourceDataError(lastError)) {
    throw lastError;
  }
  throw new Error(
    "Timed out waiting for BSC receipt and bridge event indexing.",
  );
};

const waitForZkIvmProof = async (
  context: SccpOperationContext,
  jobId: string,
): Promise<{
  proved: Record<string, unknown>;
  attachment: Record<string, unknown>;
}> => {
  const maxAttempts = 600;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    assertSccpOperationContextCurrent(context);
    let job: Record<string, unknown>;
    try {
      job = await getZkIvmProveJob({
        toriiUrl: context.toriiUrl,
        jobId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt < maxAttempts - 1 &&
        /ZK IVM prove job .*404 .*prove job not found/iu.test(message)
      ) {
        markPhase(2, "active", "Waiting for TAIRA burn-record proof job");
        await wait(1000);
        continue;
      }
      throw error;
    }
    const status = String(job.status ?? "").toLowerCase();
    if (status === "done") {
      return {
        proved: asRecord(job.proved, "ZK IVM proved payload"),
        attachment: asRecord(job.attachment, "ZK IVM proof attachment"),
      };
    }
    if (status === "error") {
      throw new Error(
        String(job.error ?? "").trim() || "ZK IVM prove job failed.",
      );
    }
    if (attempt < maxAttempts - 1) {
      await wait(1000);
    }
  }
  throw new Error("Timed out waiting for the ZK IVM proof job.");
};

const clearTronBalances = () => {
  tronTrxBalanceSun.value = null;
  tronXorBalanceBaseUnits.value = null;
  tronBalanceError.value = "";
};

const clearBscBalances = () => {
  bscBnbBalanceWei.value = null;
  bscXorBalanceBaseUnits.value = null;
  bscBalanceError.value = "";
};

const refreshTronBalances = async () => {
  clearTronBalances();
  if (!tron.connected.value) {
    return;
  }
  tronBalanceLoading.value = true;
  try {
    const endpoint = bridge.readiness.value.tronManifest
      ? readSccpTronGatewayEndpoint(
          bridge.readiness.value.tronManifest,
          SCCP_TRON_NETWORK.key,
        )
      : SCCP_TRON_NETWORK.rpcUrl;
    const [account, tokenBalance] = await Promise.all([
      getTronAccount({ endpoint, address: tron.address.value }),
      bridge.readiness.value.ready
        ? triggerTronConstantContract(
            buildTairaXorTokenBalanceRequest({
              manifest: bridge.readiness.value.tronManifest,
              ownerAddress: tron.address.value,
            }),
          )
        : Promise.resolve(null),
    ]);
    tronTrxBalanceSun.value = readTronAccountBalanceSun(account);
    tronXorBalanceBaseUnits.value = tokenBalance
      ? readTronConstantUint256(tokenBalance, "TRON TairaXOR balance response")
      : null;
  } catch (error) {
    tronTrxBalanceSun.value = null;
    tronXorBalanceBaseUnits.value = null;
    tronBalanceError.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    tronBalanceLoading.value = false;
  }
};

const evmQuantityHexToDecimal = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(normalized)) {
    throw new Error(`${label} must be an EVM quantity.`);
  }
  return BigInt(normalized).toString(10);
};

const evmUint256ResultToDecimal = (value: string, label: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a uint256 ABI result.`);
  }
  return BigInt(normalized).toString(10);
};

const erc20BalanceOfCallData = (ownerAddress: string): string =>
  `0x70a08231${"0".repeat(24)}${normalizeBscAddress(ownerAddress).slice(2)}`;

const refreshBscBalances = async () => {
  clearBscBalances();
  if (!bsc.connected.value) {
    return;
  }
  bscBalanceLoading.value = true;
  try {
    const manifest = bridge.readiness.value.bscManifest;
    const endpoint = manifest
      ? readSccpBscRpcEndpoint(manifest, SCCP_BSC_NETWORK.key)
      : SCCP_BSC_NETWORK.rpcUrl;
    const chainId = await getEvmChainId({ endpoint });
    if (chainId.toLowerCase() !== SCCP_BSC_NETWORK.chainIdHex) {
      throw new Error(
        `Connected BSC RPC endpoint is not ${SCCP_BSC_NETWORK.label}.`,
      );
    }
    const tokenAddress = manifest ? readSccpBscTokenAddress(manifest) : "";
    const [nativeBalance, tokenBalance] = await Promise.all([
      getEvmBalance({ endpoint, address: bsc.address.value }),
      bridge.readiness.value.ready && tokenAddress
        ? callEvmContract({
            endpoint,
            to: tokenAddress,
            data: erc20BalanceOfCallData(bsc.address.value),
          })
        : Promise.resolve(null),
    ]);
    bscBnbBalanceWei.value = evmQuantityHexToDecimal(
      nativeBalance,
      "BSC BNB balance",
    );
    bscXorBalanceBaseUnits.value = tokenBalance
      ? evmUint256ResultToDecimal(tokenBalance, "BSC TairaXOR balance")
      : null;
  } catch (error) {
    bscBnbBalanceWei.value = null;
    bscXorBalanceBaseUnits.value = null;
    bscBalanceError.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    bscBalanceLoading.value = false;
  }
};

const refreshAll = async () => {
  if (!isTairaRoute.value) {
    bridge.resetState();
    clearTronBalances();
    clearBscBalances();
    return;
  }
  await Promise.all([bridge.refreshRoute(), bridge.refreshBalances()]);
  if (isBscRoute.value) {
    await refreshBscBalances();
  } else {
    await refreshTronBalances();
  }
};

const connectCounterparty = async () => {
  if (!isTairaRoute.value) {
    formError.value = t("SCCP bridging is enabled only on TAIRA testnet.");
    return;
  }
  if (isBscRoute.value) {
    await bsc.connect();
    await refreshBscBalances();
  } else {
    await tron.connect();
    await refreshTronBalances();
  }
};

const disconnectCounterparty = async () => {
  if (isBscRoute.value) {
    await bsc.disconnect();
    await refreshBscBalances();
  } else {
    await tron.disconnect();
    await refreshTronBalances();
  }
};

const resetProofPhases = () => {
  proofReady.value = false;
  proofPhases.value = proofPhases.value.map((phase) => ({
    ...phase,
    state: "pending",
  }));
};

const markPhase = (index: number, state: string, detail: string) => {
  proofPhases.value[index] = {
    ...proofPhases.value[index],
    state,
    detail,
  };
};

const validateForm = () => {
  if (!bridge.readiness.value.ready) {
    throw new Error(
      routeMessages.value[0] ||
        t("Route readiness must be true before bridge actions are enabled."),
    );
  }
  if (activeProjectConfigurationError.value) {
    throw new Error(t(walletConnectInvalidMessage.value));
  }
  if (!activeProjectConfigured.value) {
    throw new Error(t(walletConnectMissingMessage.value));
  }
  if (!activeWalletConnected.value) {
    throw new Error(
      isBscRoute.value
        ? t("Connect a BSC wallet to continue.")
        : t("Connect a TRON wallet to continue."),
    );
  }
  try {
    normalizeBridgeAmount(amount.value);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
  if (!destinationValid.value) {
    throw new Error(
      direction.value === "taira-to-tron" || direction.value === "taira-to-bsc"
        ? isBscRoute.value
          ? t("Enter a valid BSC recipient address.")
          : t("Enter a valid TRON Base58Check recipient.")
        : t("Enter a TAIRA testnet account."),
    );
  }
};

const finalizeTairaMessageToTron = async (
  context: SccpOperationContext,
  input: { pollForIndexing?: boolean } = {},
) => {
  const job = await loadTairaMessageProofJob(context, input);
  markPhase(0, "complete", "Route and message id accepted");
  markPhase(1, "complete", "Torii returned an SCCP proof job");
  const binding = buildTairaXorFinalizeProofBinding({
    manifest: context.manifest,
    job,
    messageId: context.messageId ?? messageId.value,
    tairaSender: context.accountId,
    tronRecipient: context.tronRecipient,
    amountDecimal: context.amountDecimal,
  });
  markPhase(2, "active", "Generating TRON finalize proof");
  assertSccpOperationContextCurrent(context);
  const proofPackage = await runTronProofWorker("prove-tron-proof-package", {
    witness: binding.witness,
  });
  assertSccpOperationContextCurrent(context);
  const finalizeRequest = buildTairaXorFinalizeTriggerRequest({
    manifest: context.manifest,
    proofPackage: proofPackage as unknown as Record<string, unknown>,
    ownerAddress: context.tronAddress,
    tronRecipient: context.tronRecipient,
    amountBaseUnits: binding.amountBaseUnits,
    messageId: binding.messageId,
    canonicalPayloadHex: binding.canonicalPayloadHex,
  });
  markPhase(2, "complete", "TRON finalize proof package is ready");
  markPhase(3, "active", "Requesting TRON wallet approval");
  assertSccpOperationContextCurrent(context);
  const triggerResponse = await triggerTronSmartContract(
    finalizeRequest.trigger,
  );
  assertSccpOperationContextCurrent(context);
  const gatewayUnsignedTransaction =
    typeof triggerResponse.transaction === "object" &&
    triggerResponse.transaction !== null &&
    !Array.isArray(triggerResponse.transaction)
      ? (triggerResponse.transaction as Record<string, unknown>)
      : null;
  if (!gatewayUnsignedTransaction) {
    throw new Error("TRON gateway did not return an unsigned transaction.");
  }
  const unsignedTransaction = bindUnsignedTronSmartContractTransaction({
    transaction: gatewayUnsignedTransaction,
    trigger: finalizeRequest.trigger,
  }).transaction;
  assertSccpOperationContextCurrent(context);
  const signedTransaction = bindSignedTronTransactionForBroadcast({
    unsignedTransaction,
    signedTransaction: await tron.signTransaction(unsignedTransaction),
    ownerAddress: context.tronAddress,
  });
  assertSccpOperationContextCurrent(context);
  const broadcast = bindTronBroadcastResult({
    response: await broadcastTronTransaction({
      endpoint: context.tronGatewayEndpoint,
      transaction: signedTransaction.transaction,
    }),
    expectedTxId: signedTransaction.txId,
  });
  const txId = broadcast.txId;
  if (txId) {
    const finalizeLink = {
      label: t("TRON finalize transaction"),
      href: `${SCCP_TRON_NETWORK.tronscanUrl}/#/transaction/${txId}`,
    };
    transactionLinks.value = [
      ...transactionLinks.value.filter(
        (link) => link.href !== finalizeLink.href,
      ),
      finalizeLink,
    ];
    markPhase(3, "active", "Waiting for TRON finalize confirmation");
    await waitForTronTransactionSuccess(
      context,
      txId,
      "TRON finalize transaction",
    );
    assertSccpOperationContextCurrent(context);
  }
  proofReady.value = true;
  markPhase(3, "complete", "TRON finalize transaction confirmed");
};

const finalizeTairaMessageToBsc = async (
  context: SccpOperationContext,
  input: { pollForIndexing?: boolean } = {},
) => {
  const job = await loadTairaMessageProofJob(context, input);
  markPhase(0, "complete", "Route and message id accepted");
  markPhase(1, "complete", "Torii returned an SCCP proof job");
  const binding = buildTairaXorBscFinalizeProofBinding({
    manifest: context.manifest,
    job,
    messageId: context.messageId ?? messageId.value,
    tairaSender: context.accountId,
    bscRecipient: context.bscRecipient,
    amountDecimal: context.amountDecimal,
  });
  markPhase(2, "active", "Generating BSC finalize proof");
  assertSccpOperationContextCurrent(context);
  const proofPackage = await runBscProofWorker("prove-bsc-proof-package", {
    witness: binding.witness,
    authority: context.bscAddress,
    messageBundle: binding.messageBundle,
    destinationBinding: binding.destinationBinding,
    canonicalPayloadHex: binding.canonicalPayloadHex,
  });
  assertSccpOperationContextCurrent(context);
  const finalizeRequest = buildTairaXorBscFinalizeTransactionRequest({
    manifest: context.manifest,
    proofPackage: proofPackage as unknown as Record<string, unknown>,
    ownerAddress: context.bscAddress,
    bscRecipient: context.bscRecipient,
    amountBaseUnits: binding.amountBaseUnits,
    messageId: binding.messageId,
    canonicalPayloadHex: binding.canonicalPayloadHex,
  });
  markPhase(2, "complete", "BSC finalize proof package is ready");
  markPhase(3, "active", "Requesting BSC wallet approval");
  assertSccpOperationContextCurrent(context);
  const sendResult = await bsc.sendTransaction(finalizeRequest.transaction, {
    allowedToAddresses: [readSccpBscBridgeAddress(context.manifest)],
    allowedToAddressLabel: "the active BSC SCCP bridge contract",
    allowedCallDataSelectors: [
      evmFunctionSelector(TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1),
    ],
    allowedCallDataSelectorLabel: "the BSC finalizeFromTaira SCCP method",
  });
  assertSccpOperationContextCurrent(context);
  const txHash = readBscWalletTransactionHash(
    sendResult,
    "BSC finalize transaction",
  );
  const finalizeLink = {
    label: t("BSC finalize transaction"),
    href: `${SCCP_BSC_NETWORK.explorerUrl}/tx/${txHash}`,
  };
  transactionLinks.value = [
    ...transactionLinks.value.filter((link) => link.href !== finalizeLink.href),
    finalizeLink,
  ];
  markPhase(3, "active", "Waiting for BSC finalize confirmation");
  await waitForBscTransactionSuccess(
    context,
    txHash,
    "BSC finalize transaction",
  );
  assertSccpOperationContextCurrent(context);
  proofReady.value = true;
  markPhase(3, "complete", "BSC finalize transaction confirmed");
};

const finalizeTronBurnToTaira = async (
  context: SccpOperationContext,
  input: { pollForFinality?: boolean } = {},
) => {
  markPhase(
    1,
    "active",
    input.pollForFinality
      ? "Waiting for TRON finality and event indexing"
      : "Collecting TRON transaction and finality data",
  );
  const sourceData = await loadTronSourceDataForProof({
    context,
    txId: context.tronTxId ?? tronTxId.value,
    pollForFinality: input.pollForFinality,
  });
  markPhase(1, "complete", "TRON source transaction data collected");
  markPhase(2, "active", "Generating TRON source proof package");
  assertSccpOperationContextCurrent(context);
  const proofPackage = await runTronSourceProofWorker({
    manifest: context.manifest,
    txId: sourceData.txId,
    transaction: sourceData.transaction,
    receipt: sourceData.receipt,
    events: sourceData.events,
    finality: sourceData.finality,
    tronSender: context.tronAddress,
    tairaRecipient: context.tairaRecipient,
    amountDecimal: context.amountDecimal,
  });
  assertSccpOperationContextCurrent(context);
  const boundProofPackage = bindTronToTairaSourceProofPackage({
    manifest: context.manifest,
    proofPackage,
    txId: sourceData.txId,
    events: sourceData.events,
    tronSender: context.tronAddress,
    tairaRecipient: context.tairaRecipient,
    amountDecimal: context.amountDecimal,
  });
  messageId.value = boundProofPackage.messageId;
  markPhase(2, "complete", "TRON source proof package is ready");
  markPhase(3, "active", "Submitting TAIRA settlement");
  assertSccpOperationContextCurrent(context);
  const response = await submitSccpBridgeMessage({
    toriiUrl: context.toriiUrl,
    accountId: context.accountId,
    messageBundle: buildSccpMessageBundleSubmitPayload(
      boundProofPackage.messageBundle,
    ),
    settlement: boundProofPackage.settlement,
  });
  const tairaTxHash = String(
    response.tx_hash_hex ?? response.txHashHex ?? response.hash ?? "",
  ).trim();
  const normalizedTairaTxHash = normalizeTairaTransactionHash(tairaTxHash);
  const tairaTxHref = buildTairaExplorerTransactionUrl(
    TAIRA_EXPLORER_URL,
    normalizedTairaTxHash,
  );
  if (tairaTxHref) {
    transactionLinks.value = [
      ...transactionLinks.value,
      {
        label: t("TAIRA settlement transaction"),
        href: tairaTxHref,
      },
    ];
  }
  markPhase(3, "active", "Waiting for TAIRA settlement confirmation");
  await waitForSccpTransactionCommit({
    toriiUrl: context.toriiUrl,
    hashHex: normalizedTairaTxHash,
  });
  assertSccpOperationContextCurrent(context);
  proofReady.value = true;
  markPhase(3, "complete", "TAIRA settlement confirmed");
};

const finalizeBscBurnToTaira = async (
  context: SccpOperationContext,
  input: { pollForFinality?: boolean } = {},
) => {
  markPhase(
    1,
    "active",
    input.pollForFinality
      ? "Waiting for BSC receipt and block indexing"
      : "Collecting BSC transaction and receipt data",
  );
  const sourceData = await loadBscSourceDataForProof({
    context,
    txId: context.bscTxId ?? tronTxId.value,
    pollForFinality: input.pollForFinality,
  });
  markPhase(1, "complete", "BSC source transaction data collected");
  markPhase(2, "active", "Generating BSC source proof package");
  assertSccpOperationContextCurrent(context);
  const sourceMaterialBinding = readBscSourceProverMaterialBinding(
    context.manifest,
  );
  const proofPackage = await runBscSourceProofWorker({
    manifest: context.manifest,
    txId: sourceData.txId,
    transaction: sourceData.transaction,
    receipt: sourceData.receipt,
    block: sourceData.block,
    bscSender: context.bscAddress,
    tairaRecipient: context.tairaRecipient,
    amountDecimal: context.amountDecimal,
  });
  assertSccpOperationContextCurrent(context);
  const boundProofPackage = bindBscToTairaSourceProofPackage({
    manifest: context.manifest,
    ...sourceMaterialBinding,
    proofPackage,
    txId: sourceData.txId,
    receipt: sourceData.receipt,
    bscSender: context.bscAddress,
    tairaRecipient: context.tairaRecipient,
    amountDecimal: context.amountDecimal,
  });
  messageId.value = boundProofPackage.messageId;
  markPhase(2, "complete", "BSC source proof package is ready");
  markPhase(3, "active", "Submitting TAIRA settlement");
  assertSccpOperationContextCurrent(context);
  const response = await submitSccpBridgeMessage({
    toriiUrl: context.toriiUrl,
    accountId: context.accountId,
    messageBundle: buildSccpMessageBundleSubmitPayload(
      boundProofPackage.messageBundle,
    ),
    settlement: boundProofPackage.settlement,
  });
  const tairaTxHash = String(
    response.tx_hash_hex ?? response.txHashHex ?? response.hash ?? "",
  ).trim();
  const normalizedTairaTxHash = normalizeTairaTransactionHash(tairaTxHash);
  const tairaTxHref = buildTairaExplorerTransactionUrl(
    TAIRA_EXPLORER_URL,
    normalizedTairaTxHash,
  );
  if (tairaTxHref) {
    transactionLinks.value = [
      ...transactionLinks.value,
      {
        label: t("TAIRA settlement transaction"),
        href: tairaTxHref,
      },
    ];
  }
  markPhase(3, "active", "Waiting for TAIRA settlement confirmation");
  await waitForSccpTransactionCommit({
    toriiUrl: context.toriiUrl,
    hashHex: normalizedTairaTxHash,
  });
  assertSccpOperationContextCurrent(context);
  proofReady.value = true;
  markPhase(3, "complete", "TAIRA settlement confirmed");
};

const prepareBridge = async () => {
  formError.value = "";
  resetProofPhases();
  proofLoading.value = true;
  try {
    validateForm();
    const operationContext = createSccpOperationContext();
    markPhase(0, "complete", "Route and wallet are ready");
    if (
      direction.value === "taira-to-tron" ||
      direction.value === "taira-to-bsc"
    ) {
      const nonce = Date.now().toString();
      const request =
        direction.value === "taira-to-bsc"
          ? buildTairaXorBscOutboundBurnRecordRequest({
              manifest: operationContext.manifest,
              tairaSender: operationContext.accountId,
              bscRecipient: operationContext.bscRecipient,
              amountDecimal: operationContext.amountDecimal,
              nonce,
            })
          : buildTairaXorOutboundBurnRecordRequest({
              manifest: operationContext.manifest,
              tairaSender: operationContext.accountId,
              tronRecipient: operationContext.tronRecipient,
              amountDecimal: operationContext.amountDecimal,
              nonce,
            });
      messageId.value = request.outbound.messageId;
      const tairaSourceContext = {
        ...operationContext,
        messageId: request.outbound.messageId,
      };
      markPhase(1, "active", "Queueing TAIRA burn-record proof request");
      markPhase(2, "active", "Generating TAIRA burn-record proof");
      const proveJob = await startZkIvmProveJob({
        toriiUrl: operationContext.toriiUrl,
        ...request.zkIvmRequest.request,
      });
      assertSccpOperationContextCurrent(tairaSourceContext);
      markPhase(1, "complete", "TAIRA burn-record proof request queued");
      const jobId = readJobId(proveJob);
      const proof = await waitForZkIvmProof(tairaSourceContext, jobId);
      assertSccpOperationContextCurrent(tairaSourceContext);
      markPhase(2, "complete", "TAIRA burn-record proof is ready");
      markPhase(3, "active", "Submitting TAIRA source transaction");
      const submission = await submitZkIvmProvedTransaction({
        toriiUrl: operationContext.toriiUrl,
        chainId: operationContext.chainId,
        accountId: operationContext.accountId,
        proved: proof.proved,
        attachment: proof.attachment,
        metadata: {
          ...request.zkIvmRequest.request.metadata,
          gas_asset_id: request.material.settlementAssetDefinitionId,
        },
      });
      assertSccpOperationContextCurrent(tairaSourceContext);
      const tairaTxHash = String(
        submission.tx_hash_hex ?? submission.txHashHex ?? submission.hash ?? "",
      ).trim();
      const tairaTxHref = buildTairaExplorerTransactionUrl(
        TAIRA_EXPLORER_URL,
        tairaTxHash,
      );
      transactionLinks.value = tairaTxHref
        ? [
            {
              label: t("TAIRA source transaction"),
              href: tairaTxHref,
            },
          ]
        : [];
      markPhase(
        3,
        "complete",
        "TAIRA source transaction submitted; fetching SCCP proof job",
      );
      if (direction.value === "taira-to-bsc") {
        await finalizeTairaMessageToBsc(tairaSourceContext, {
          pollForIndexing: true,
        });
      } else {
        await finalizeTairaMessageToTron(tairaSourceContext, {
          pollForIndexing: true,
        });
      }
      return;
    }

    if (direction.value === "bsc-to-taira") {
      markPhase(1, "active", "Creating BSC burn transaction");
      const burnRequest = buildTairaXorBscBurnTransactionRequest({
        manifest: operationContext.manifest,
        ownerAddress: operationContext.bscAddress,
        tairaRecipient: operationContext.tairaRecipient,
        amountDecimal: operationContext.amountDecimal,
      });
      markPhase(1, "complete", "Unsigned BSC burn transaction created");
      markPhase(
        2,
        "complete",
        "BSC-source proof data collection can begin after broadcast",
      );
      markPhase(3, "active", "Requesting BSC wallet approval");
      assertSccpOperationContextCurrent(operationContext);
      const txHash = readBscWalletTransactionHash(
        await bsc.sendTransaction(burnRequest.transaction, {
          allowedToAddresses: [
            readSccpBscBridgeAddress(operationContext.manifest),
          ],
          allowedToAddressLabel: "the active BSC SCCP bridge contract",
          allowedCallDataSelectors: [
            evmFunctionSelector(TAIRA_XOR_BURN_TO_TAIRA_ABI_V1),
          ],
          allowedCallDataSelectorLabel: "the BSC burnToTaira SCCP method",
        }),
        "BSC burn transaction",
      );
      tronTxId.value = txHash;
      const bscSourceContext = {
        ...operationContext,
        bscTxId: txHash,
      };
      transactionLinks.value = [
        {
          label: t("BSC transaction"),
          href: `${SCCP_BSC_NETWORK.explorerUrl}/tx/${txHash}`,
        },
      ];
      markPhase(3, "complete", "BSC burn transaction broadcast");
      await finalizeBscBurnToTaira(bscSourceContext, {
        pollForFinality: true,
      });
      return;
    }

    markPhase(1, "active", "Collecting TRON finality data");
    bindTronFinalitySnapshot(
      await getTronFinalityData({
        endpoint: operationContext.tronGatewayEndpoint,
      }),
    );
    assertSccpOperationContextCurrent(operationContext);
    const triggerRequest = buildTairaXorBurnTriggerRequest({
      manifest: operationContext.manifest,
      ownerAddress: operationContext.tronAddress,
      tairaRecipient: operationContext.tairaRecipient,
      amountDecimal: operationContext.amountDecimal,
    });
    const triggerResponse = await triggerTronSmartContract(triggerRequest);
    assertSccpOperationContextCurrent(operationContext);
    const gatewayUnsignedTransaction =
      typeof triggerResponse.transaction === "object" &&
      triggerResponse.transaction !== null &&
      !Array.isArray(triggerResponse.transaction)
        ? (triggerResponse.transaction as Record<string, unknown>)
        : null;
    if (!gatewayUnsignedTransaction) {
      throw new Error("TRON gateway did not return an unsigned transaction.");
    }
    const unsignedTransaction = bindUnsignedTronSmartContractTransaction({
      transaction: gatewayUnsignedTransaction,
      trigger: triggerRequest,
    }).transaction;
    markPhase(1, "complete", "Unsigned TRON burn transaction created");
    markPhase(
      2,
      "complete",
      "TRON-source proof data collection can begin after broadcast",
    );
    markPhase(3, "active", "Requesting TRON wallet approval");
    assertSccpOperationContextCurrent(operationContext);
    const signedTransaction = bindSignedTronTransactionForBroadcast({
      unsignedTransaction,
      signedTransaction: await tron.signTransaction(unsignedTransaction),
      ownerAddress: operationContext.tronAddress,
    });
    assertSccpOperationContextCurrent(operationContext);
    const broadcast = bindTronBroadcastResult({
      response: await broadcastTronTransaction({
        endpoint: operationContext.tronGatewayEndpoint,
        transaction: signedTransaction.transaction,
      }),
      expectedTxId: signedTransaction.txId,
    });
    const nextTxId = broadcast.txId;
    const tronSourceContext = {
      ...operationContext,
      tronTxId: nextTxId ?? undefined,
    };
    if (nextTxId) {
      tronTxId.value = nextTxId;
      transactionLinks.value = [
        {
          label: t("TRON transaction"),
          href: `${SCCP_TRON_NETWORK.tronscanUrl}/#/transaction/${nextTxId}`,
        },
      ];
    }
    markPhase(3, "complete", "Signed TRON burn transaction broadcast");
    await finalizeTronBurnToTaira(tronSourceContext, {
      pollForFinality: true,
    });
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error);
  } finally {
    proofLoading.value = false;
  }
};

const fetchMessageJob = async () => {
  proofLoading.value = true;
  formError.value = "";
  try {
    validateForm();
    if (
      direction.value === "taira-to-tron" ||
      direction.value === "taira-to-bsc"
    ) {
      if (!messageId.value.trim()) {
        throw new Error(
          t("Enter a SCCP message ID before fetching proof data."),
        );
      }
      messageId.value = normalizeSccpMessageId(messageId.value);
    } else {
      if (!tronTxId.value.trim()) {
        throw new Error(
          isBscRoute.value
            ? t("Enter a BSC transaction hash before fetching proof data.")
            : t("Enter a TRON transaction ID before fetching proof data."),
        );
      }
      tronTxId.value =
        direction.value === "bsc-to-taira"
          ? normalizeBscTransactionHash(tronTxId.value)
          : normalizeTronTransactionId(tronTxId.value);
    }
    const operationContext = createSccpOperationContext({
      ...(direction.value === "taira-to-tron" ||
      direction.value === "taira-to-bsc"
        ? { messageId: messageId.value }
        : direction.value === "bsc-to-taira"
          ? { bscTxId: tronTxId.value }
          : { tronTxId: tronTxId.value }),
    });
    if (direction.value === "bsc-to-taira") {
      markPhase(0, "complete", "Route and BSC transaction hash accepted");
      await finalizeBscBurnToTaira(operationContext);
      return;
    }

    if (direction.value === "tron-to-taira") {
      markPhase(0, "complete", "Route and TRON transaction id accepted");
      await finalizeTronBurnToTaira(operationContext);
      return;
    }

    if (direction.value === "taira-to-bsc") {
      await finalizeTairaMessageToBsc(operationContext);
      return;
    }

    await finalizeTairaMessageToTron(operationContext);
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error);
  } finally {
    proofLoading.value = false;
  }
};

onMounted(() => {
  void refreshAll();
});

watch(
  () => session.activeAccount?.accountId,
  (accountId) => {
    if (accountId && !tairaRecipient.value) {
      tairaRecipient.value = accountId;
    }
  },
);

watch(
  () =>
    [
      session.connection.toriiUrl,
      session.connection.chainId,
      session.connection.networkPrefix,
    ] as const,
  () => {
    resetProofPhases();
    bridge.resetState();
    void refreshAll();
  },
);
</script>
