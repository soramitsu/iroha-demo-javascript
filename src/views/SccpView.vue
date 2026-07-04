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
            <button
              type="button"
              class="secondary"
              :class="{ active: selectedCounterparty === 'ton' }"
              @click="selectCounterparty('ton')"
            >
              {{ routeTonNetworkLabel }}
            </button>
            <button
              type="button"
              class="secondary"
              :class="{ active: selectedCounterparty === 'solana' }"
              @click="selectCounterparty('solana')"
            >
              {{ routeSolanaNetworkLabel }}
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
                : isTonRoute
                  ? t("Disconnect TON")
                  : isBscRoute
                    ? t("Disconnect BSC")
                    : isSolanaRoute
                      ? t("Disconnect Solana")
                      : t("Disconnect TRON")
            }}
          </button>
          <button
            v-else
            type="button"
            :disabled="counterpartyConnectDisabled"
            @click="connectCounterparty"
          >
            {{
              activeWalletConnecting
                ? t("Connecting")
                : isTonRoute
                  ? t("Connect TON wallet")
                  : isBscRoute
                    ? t("Connect BSC wallet")
                    : isSolanaRoute
                      ? t("Connect Solana wallet")
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

      <div class="sccp-route-strip" :aria-label="t('Operational status')">
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
      <header class="sccp-transfer-header">
        <div>
          <h2>{{ t("Bridge transfer") }}</h2>
          <p class="helper">{{ t(transferHelperText) }}</p>
        </div>
        <span class="pill">{{ t(transferModeLabel) }}</span>
      </header>

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
        <label class="sccp-field">
          <span>{{ t("Amount (XOR)") }}</span>
          <input
            v-model.trim="amount"
            data-testid="sccp-amount-input"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            :placeholder="t('0.0001')"
          />
        </label>
        <label v-if="isForwardDirection" class="sccp-field">
          <span>{{ t(counterpartyRecipientLabel) }}</span>
          <input
            v-if="isTronRoute"
            v-model.trim="tronRecipient"
            data-testid="sccp-recipient-input"
            type="text"
            autocomplete="off"
            :placeholder="t('TRON Base58Check address')"
          />
          <input
            v-else-if="isBscRoute"
            v-model.trim="bscRecipient"
            data-testid="sccp-recipient-input"
            type="text"
            autocomplete="off"
            :placeholder="t('0x... BSC address')"
          />
          <input
            v-else-if="isTonRoute"
            v-model.trim="tonRecipient"
            data-testid="sccp-recipient-input"
            type="text"
            autocomplete="off"
            :placeholder="t('0:... TON raw address')"
          />
          <input
            v-else
            v-model.trim="solanaRecipient"
            data-testid="sccp-recipient-input"
            type="text"
            autocomplete="off"
            :placeholder="t('Solana Base58 address')"
          />
        </label>
        <label v-else class="sccp-field">
          <span>{{ t("TAIRA recipient") }}</span>
          <input
            v-model.trim="tairaRecipient"
            data-testid="sccp-recipient-input"
            type="text"
            autocomplete="off"
            :placeholder="t('testu... account')"
          />
        </label>
        <label v-if="showMessageIdInput" class="sccp-field sccp-resume-field">
          <span>{{ t("Message ID") }}</span>
          <input
            v-model.trim="messageId"
            data-testid="sccp-message-id-input"
            type="text"
            autocomplete="off"
            :placeholder="t('Optional 32-byte SCCP message id')"
          />
          <small class="sccp-field-hint">
            {{
              t(
                "Use this only to resume a TAIRA-origin message after it was submitted.",
              )
            }}
          </small>
        </label>
        <label v-if="isReturnDirection" class="sccp-field">
          <span>{{ t(counterpartyTransactionIdLabel) }}</span>
          <input
            v-model.trim="tronTxId"
            data-testid="sccp-source-transaction-input"
            type="text"
            autocomplete="off"
            :placeholder="t(counterpartyTransactionIdPlaceholder)"
          />
        </label>
        <div
          v-if="showGeneratedMessageId"
          class="sccp-generated-id"
          data-testid="sccp-generated-message-id"
        >
          <span>{{ t("Generated message ID") }}</span>
          <code>{{ messageId }}</code>
          <small>{{
            t("Generated after the source-chain proof is bound.")
          }}</small>
        </div>

        <div class="sccp-form-actions">
          <button type="submit" :disabled="submitDisabled">
            {{ t(primaryActionLabel) }}
          </button>
          <button
            type="button"
            class="secondary"
            data-testid="sccp-resume-action"
            :disabled="proofFetchDisabled"
            @click="fetchMessageJob"
          >
            {{ t(proofFetchActionLabel) }}
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
            <h2>{{ t("Proof and transactions") }}</h2>
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
            <small>{{ formatProofPhaseDetail(phase) }}</small>
          </li>
        </ol>
        <ul v-if="proofTimingRows.length" class="sccp-timing-list">
          <li
            v-for="timing in proofTimingRows"
            :key="timing.key"
            :class="timing.state"
          >
            <span>{{ t(timing.label) }}</span>
            <small>{{ formatProofTimingRow(timing) }}</small>
          </li>
        </ul>
        <div class="sccp-progress-links">
          <div>
            <h3>{{ t("Transaction links") }}</h3>
            <p class="helper">
              {{ t("Links appear after a bridge leg is submitted.") }}
            </p>
          </div>
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
        </div>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { blake2b } from "@noble/hashes/blake2b";
import {
  buildSccpTonChunkedMessageBodyBocsFromBytes,
  canonicalSccpPayloadEnvelopeBytes,
  sccpMerkleRootFromCommitment,
  sccpPayloadHash,
  tairaXorTonToTairaTransferMessageId,
  buildTairaXorTonToTairaTransferPayload,
} from "@iroha/iroha-js/sccp";
import { beginCell } from "@ton/core";
import { CHAIN, toUserFriendlyAddress } from "@tonconnect/sdk";
import { useSessionStore } from "@/stores/session";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSccpBridge } from "@/composables/useSccpBridge";
import { useBscWalletConnect } from "@/composables/useBscWalletConnect";
import { useSolanaWalletConnect } from "@/composables/useSolanaWalletConnect";
import { useTonWalletConnect } from "@/composables/useTonWalletConnect";
import { useTronWalletConnect } from "@/composables/useTronWalletConnect";
import { TAIRA_EXPLORER_URL } from "@/constants/chains";
import {
  broadcastTronTransaction,
  buildSolanaTransaction,
  callEvmRpc,
  callEvmContract,
  getEvmBalance,
  getEvmBlockByHash,
  getEvmChainId,
  getEvmLogs,
  getEvmTransaction,
  getEvmTransactionReceipt,
  getSolanaBalance,
  getSolanaSignatureStatus,
  getSolanaTokenBalance,
  getSolanaTransaction,
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
  normalizeTonRawAddress,
  normalizeTronAddress,
  isValidBscAddress,
  isValidSolanaAddress,
  isValidTonRawAddress,
  isValidTronBase58CheckAddress,
  bindTronFinalitySnapshot,
  bindSignedTronTransactionForBroadcast,
  bindTronBroadcastResult,
  bindTronSourceDataForProof,
  bindTronToTairaSourceProofPackage,
  bindBscSourceDataForProof,
  bindBscToTairaSourceProofPackage,
  bindSolanaToTairaSourceProofPackage,
  bindTonToTairaSourceProofPackage,
  readBscSourceProverMaterialBinding,
  readTonSourceProverMaterialBinding,
  bindUnsignedTronSmartContractTransaction,
  buildSccpMessageBundleSubmitPayload,
  buildSccpTonCompactFinalizeMessageBodyBocFromBytes,
  chunkSccpTonUploadMessages,
  buildTairaExplorerTransactionUrl,
  buildTairaXorBurnTriggerRequest,
  buildTairaXorBscBurnTransactionRequest,
  buildTairaXorBscFinalizeProofBinding,
  buildTairaXorBscFinalizeTransactionRequest,
  buildTairaXorBscMessageProofJobQueryMaterial,
  buildTairaXorBscOutboundBurnRecordRequest,
  buildTairaXorTonFinalizeProofBinding,
  buildTairaXorTonMessageProofJobQueryMaterial,
  buildTairaXorTonOutboundBurnRecordRequest,
  buildTairaXorSolanaBurnTransactionRequest,
  buildTairaXorSolanaFinalizeTransactionRequest,
  buildTairaXorSolanaMessageProofJobQueryMaterial,
  buildTairaXorOutboundBurnRecordRequest,
  buildTairaXorTokenBalanceRequest,
  evmFunctionSelector,
  buildTairaXorFinalizeProofBinding,
  buildTairaXorFinalizeTriggerRequest,
  buildTairaXorMessageProofJobQueryMaterial,
  cloneSccpJsonRouteManifest,
  bridgeDecimalToTairaBaseUnits,
  formatBaseUnitAmount,
  formatTronSunBalance,
  normalizeBridgeAmount,
  normalizeBscTransactionHash,
  normalizeSolanaAddress,
  normalizeSolanaTransactionSignature,
  normalizeSccpMessageId,
  normalizeTairaTransactionHash,
  normalizeTonTransactionHash,
  normalizeTronTransactionId,
  readTronAccountBalanceSun,
  readTronConstantUint256,
  readSccpTronBridgeAddress,
  readSccpBscBridgeAddress,
  readSccpBscDestinationProverModuleUrl,
  readSccpBscRpcEndpoint,
  readSccpBscRuntimeProverConfigUrl,
  readSccpBscSourceBridgeAddress,
  readSccpBscSourceProverModuleUrl,
  readSccpBscTokenAddress,
  readSccpSolanaRpcEndpoint,
  readSccpSolanaSourceBridgeAddress,
  readSccpSolanaSourceProverModuleUrl,
  readSccpSolanaSourceStateAddress,
  readSccpSolanaTokenAddress,
  readSccpTairaBurnRecordMaterial,
  readSccpTonBridgeAddress,
  readSccpTonFinalizeMessageValueNano,
  readSccpTonProofMaterial,
  readSccpTonSourceBridgeAddress,
  readSccpTonSourceProverModuleUrl,
  readSccpTonTokenAddress,
  readSccpTonVerifierAddress,
  readSccpTonVerifierProtocolVersion,
  readSccpTronGatewayEndpoint,
  SCCP_EVM_SOURCE_EVENT_TOPIC,
  SCCP_BSC_NETWORK,
  SCCP_BSC_TOKEN_SYMBOL,
  SCCP_ROUTE_PROFILES,
  SCCP_SOLANA_NETWORK,
  SCCP_SOLANA_TOKEN_SYMBOL,
  SCCP_TON_DOMAIN,
  SCCP_TON_NETWORK,
  SCCP_TON_TOKEN_SYMBOL,
  SCCP_TON_VERIFIER_PROTOCOL_COMPACT_V2,
  SCCP_TRON_NETWORK,
  SCCP_XOR_ASSET_KEY,
  SCCP_TRON_TOKEN_SYMBOL,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  type SccpCounterpartyKey,
  type SccpBridgeDirection,
  type BscToTairaSourceProofPackage,
  type BscToTairaSourceProofPackageInput,
  type SolanaToTairaSourceProofPackage,
  type SolanaToTairaSourceProofPackageInput,
  type TonToTairaSourceProofPackage,
  type TonToTairaSourceProofPackageInput,
  type TronToTairaSourceProofPackage,
  type TronToTairaSourceProofPackageInput,
} from "@/utils/sccp";
import type {
  BscSccpProofPackage,
  BscSccpProofPackageInput,
  TronSccpProofPackage,
  TronSccpProofPackageInput,
} from "@/utils/sccpProofPackage";
import { buildBscSccpProofPackage } from "@/utils/sccpProofPackage";

const session = useSessionStore();
const { t, n } = useAppI18n();
const selectedCounterparty = ref<SccpCounterpartyKey>("tron");
const activeRoute = computed(
  () => SCCP_ROUTE_PROFILES[selectedCounterparty.value],
);
const bridge = useSccpBridge(activeRoute);
const tron = useTronWalletConnect();
const bsc = useBscWalletConnect();
const ton = useTonWalletConnect();
const solana = useSolanaWalletConnect();

const direction = ref<SccpBridgeDirection>("taira-to-tron");
const amount = ref("");
const tronRecipient = ref("");
const bscRecipient = ref("");
const tonRecipient = ref("");
const solanaRecipient = ref("");
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
const tonBalanceError = ref("");
const solanaBalanceLoading = ref(false);
const solanaSolBalanceLamports = ref<string | null>(null);
const solanaXorBalanceBaseUnits = ref<string | null>(null);
const solanaXorDecimals = ref<number | null>(null);
const solanaXorTokenAccounts = ref<Array<{ pubkey: string; amount: string }>>(
  [],
);
const solanaBalanceError = ref("");
const transactionLinks = ref<Array<{ label: string; href: string }>>([]);
type ProofPhaseState = "pending" | "active" | "complete" | "failed";

type ProofPhase = {
  phaseId: string;
  label: string;
  detail: string;
  state: ProofPhaseState;
  startedAtMs?: number;
  completedAtMs?: number;
  durationMs?: number;
};

type ProofTimingEvent = {
  phaseId: string;
  label: string;
  detail: string;
  state: "active" | "complete" | "failed" | "skipped";
  startedAtMs: number;
  completedAtMs?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

const createInitialProofPhases = (): ProofPhase[] => [
  {
    phaseId: "validate-route",
    label: "Validate route",
    detail: "Waiting for route readiness",
    state: "pending",
  },
  {
    phaseId: "gather-chain-data",
    label: "Gather chain data",
    detail: "Waiting for source transaction data",
    state: "pending",
  },
  {
    phaseId: "generate-proof",
    label: "Generate proof",
    detail: "Worker idle",
    state: "pending",
  },
  {
    phaseId: "submit-target-leg",
    label: "Submit target leg",
    detail: "Waiting for wallet approval",
    state: "pending",
  },
];

const proofPhases = ref<ProofPhase[]>(createInitialProofPhases());
const proofTimings = ref<ProofTimingEvent[]>([]);
const proofTimingNowMs = ref(Date.now());
let proofTimingTicker: number | null = null;
const SCCP_PROOF_WORKER_TIMEOUT_MS = 120_000;
const SCCP_PROOF_JOB_INDEXING_POLL_ATTEMPTS = 110;
const SCCP_PROOF_JOB_INDEXING_FAST_POLL_MS = 250;
const SCCP_PROOF_JOB_INDEXING_MEDIUM_POLL_MS = 1_000;
const SCCP_PROOF_JOB_INDEXING_SLOW_POLL_MS = 3_000;
const SCCP_ZK_IVM_PROOF_FAST_POLL_MS = 500;
const SCCP_ZK_IVM_PROOF_MEDIUM_POLL_MS = 1_000;
const SCCP_ZK_IVM_PROOF_SLOW_POLL_MS = 3_000;
const SCCP_TRON_SOURCE_DATA_POLL_ATTEMPTS = 40;
const SCCP_TRON_SOURCE_DATA_POLL_MS = 3_000;
const SCCP_BSC_CONFIRMATION_POLL_ATTEMPTS = 40;
const SCCP_BSC_CONFIRMATION_POLL_MS = 3_000;
const SCCP_BSC_SOURCE_DATA_POLL_ATTEMPTS = 40;
const SCCP_BSC_SOURCE_DATA_POLL_MS = 3_000;
const SCCP_TON_SOURCE_MESSAGE_VALUE_NANO = "250000";
const SCCP_TON_CHUNK_UPLOAD_MESSAGE_VALUE_NANO = "250000";
const SCCP_TON_CHUNK_SIZE_BYTES = 24 * 1024;
const SCCP_TON_UPLOAD_APPROVAL_MAX_MESSAGES = 2;
const SCCP_TON_UPLOAD_APPROVAL_MAX_PAYLOAD_BYTES = 56 * 1024;
const SCCP_TON_SOURCE_RECORD_OP = 0x53434353;

const isTairaRoute = computed(() => isTairaSccpNetwork(session.connection));
const isTronRoute = computed(() => selectedCounterparty.value === "tron");
const isBscRoute = computed(() => selectedCounterparty.value === "bsc");
const isTonRoute = computed(() => selectedCounterparty.value === "ton");
const isSolanaRoute = computed(() => selectedCounterparty.value === "solana");
const routeBscNetworkLabel = computed(() => t(SCCP_BSC_NETWORK.label));
const routeTonNetworkLabel = computed(() => t(SCCP_TON_NETWORK.label));
const routeSolanaNetworkLabel = computed(() => t(SCCP_SOLANA_NETWORK.label));
const routeNetworkLabel = computed(() =>
  isSolanaRoute.value
    ? SCCP_SOLANA_NETWORK.label
    : isTonRoute.value
      ? SCCP_TON_NETWORK.label
      : isBscRoute.value
        ? SCCP_BSC_NETWORK.label
        : SCCP_TRON_NETWORK.label,
);
const activeWalletLabel = computed(() =>
  isSolanaRoute.value
    ? t("Solana wallet")
    : isTonRoute.value
      ? t("TON wallet")
      : isBscRoute.value
        ? t("BSC wallet")
        : t("TRON wallet"),
);
const activeWalletShortAddress = computed(() =>
  isSolanaRoute.value
    ? solana.shortAddress.value
    : isTonRoute.value
      ? ton.shortAddress.value
      : isBscRoute.value
        ? bsc.shortAddress.value
        : tron.shortAddress.value,
);
const activeProjectConfigured = computed(() =>
  isSolanaRoute.value
    ? solana.projectConfigured.value
    : isTonRoute.value
      ? ton.projectConfigured.value
      : isBscRoute.value
        ? bsc.projectConfigured.value
        : tron.projectConfigured.value,
);
const activeProjectConfigurationError = computed(() =>
  isSolanaRoute.value
    ? solana.projectConfigurationError.value
    : isTonRoute.value
      ? ton.projectConfigurationError.value
      : isBscRoute.value
        ? bsc.projectConfigurationError.value
        : tron.projectConfigurationError.value,
);
const activeWalletConnected = computed(() =>
  isSolanaRoute.value
    ? solana.connected.value
    : isTonRoute.value
      ? ton.connected.value
      : isBscRoute.value
        ? bsc.connected.value
        : tron.connected.value,
);
const activeWalletConnecting = computed(() =>
  isSolanaRoute.value
    ? solana.connecting.value
    : isTonRoute.value
      ? ton.connecting.value
      : isBscRoute.value
        ? bsc.connecting.value
        : tron.connecting.value,
);
const activeWalletDisconnecting = computed(() =>
  isSolanaRoute.value
    ? solana.disconnecting.value
    : isTonRoute.value
      ? ton.disconnecting.value
      : isBscRoute.value
        ? bsc.disconnecting.value
        : tron.disconnecting.value,
);
const activeWalletError = computed(() =>
  isSolanaRoute.value
    ? solana.error.value
    : isTonRoute.value
      ? ton.error.value
      : isBscRoute.value
        ? bsc.error.value
        : tron.error.value,
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
  if (routeReadyForAction.value) {
    return t("Route ready");
  }
  if (bridge.loading.value) {
    return t("Checking route");
  }
  return t("Route not ready");
});
const routeTone = computed(() => ({
  positive: routeReadyForAction.value,
  warning: !routeReadyForAction.value && isTairaRoute.value,
}));
const routeMessages = computed(() => {
  if (!isTairaRoute.value) {
    return ["SCCP bridging is enabled only on TAIRA testnet."];
  }
  if (
    isTonRoute.value &&
    direction.value === "taira-to-ton" &&
    routeReadyForAction.value &&
    bridge.readiness.value.reasons.length > 0
  ) {
    return [
      "TON destination leg is ready for TAIRA -> TON. The TON -> TAIRA tab will stay unavailable until the source proof lane is live.",
    ];
  }
  return routeBlockingMessages.value;
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
const tonTonBalanceLabel = computed(() =>
  ton.connected.value ? t("Not loaded") : t("Not connected"),
);
const tonXorBalanceLabel = computed(() =>
  ton.connected.value ? t("Not loaded") : t("Not connected"),
);
const solanaSolBalanceLabel = computed(() => {
  if (!solana.connected.value) {
    return t("Not connected");
  }
  if (solanaSolBalanceLamports.value === null || solanaBalanceLoading.value) {
    return t("Not loaded");
  }
  return `${formatBaseUnitAmount(solanaSolBalanceLamports.value, 9)} SOL`;
});
const solanaXorBalanceLabel = computed(() => {
  if (!solana.connected.value) {
    return t("Not connected");
  }
  if (solanaXorBalanceBaseUnits.value === null || solanaBalanceLoading.value) {
    return t("Not loaded");
  }
  return `${formatBaseUnitAmount(
    solanaXorBalanceBaseUnits.value,
    solanaXorDecimals.value ?? 9,
  )} ${SCCP_SOLANA_TOKEN_SYMBOL}`;
});
const counterpartyGasBalanceLabel = computed(() =>
  isSolanaRoute.value
    ? solanaSolBalanceLabel.value
    : isTonRoute.value
      ? tonTonBalanceLabel.value
      : isBscRoute.value
        ? bscBnbBalanceLabel.value
        : tronTrxBalanceLabel.value,
);
const counterpartyXorBalanceLabel = computed(() =>
  isSolanaRoute.value
    ? solanaXorBalanceLabel.value
    : isTonRoute.value
      ? tonXorBalanceLabel.value
      : isBscRoute.value
        ? bscXorBalanceLabel.value
        : tronXorBalanceLabel.value,
);
const counterpartyGasSymbol = computed(() =>
  isSolanaRoute.value
    ? "SOL"
    : isTonRoute.value
      ? "TON"
      : isBscRoute.value
        ? "BNB"
        : "TRX",
);
const counterpartyTokenSymbol = computed(() =>
  isSolanaRoute.value
    ? SCCP_SOLANA_TOKEN_SYMBOL
    : isTonRoute.value
      ? SCCP_TON_TOKEN_SYMBOL
      : isBscRoute.value
        ? SCCP_BSC_TOKEN_SYMBOL
        : SCCP_TRON_TOKEN_SYMBOL,
);
const counterpartyBalanceError = computed(() =>
  isSolanaRoute.value
    ? solanaBalanceError.value
    : isTonRoute.value
      ? tonBalanceError.value
      : isBscRoute.value
        ? bscBalanceError.value
        : tronBalanceError.value,
);
const tonSourceLaneCapability = computed(() => {
  const counterparties = bridge.capabilities.value?.counterparties;
  if (!Array.isArray(counterparties)) {
    return null;
  }
  return (
    counterparties.find((entry) => {
      const record = entry as Record<string, unknown>;
      const domain = Number(record.domain ?? record.counterparty_domain);
      const chain = String(record.chain ?? "")
        .trim()
        .toLowerCase();
      return domain === SCCP_TON_DOMAIN || chain === "ton";
    }) ?? null
  );
});
const tonSourceProverModuleUrl = computed(() => {
  const manifest = bridge.readiness.value.tonManifest;
  return (
    import.meta.env.VITE_SCCP_TON_SOURCE_PROVER_MODULE_URL ||
    readSccpTonSourceProverModuleUrl(manifest) ||
    ""
  ).trim();
});
const isRouteRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasRouteRecord = (
  manifest: Record<string, unknown>,
  ...keys: string[]
): boolean => keys.some((key) => isRouteRecord(manifest[key]));
const readCapabilityString = (
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};
const readTonForwardReadinessReasons = (
  manifest: Record<string, unknown> | null,
): string[] => {
  const reasons: string[] = [];
  const capabilities = bridge.capabilities.value;
  const loadFailure = bridge.routeLoadFailure.value;
  if (!isTairaRoute.value) {
    reasons.push("Switch to the TAIRA testnet profile.");
  }
  if (loadFailure) {
    reasons.push(loadFailure.message);
  }
  if (!capabilities) {
    if (!loadFailure) {
      reasons.push("SCCP capabilities have not been loaded.");
    }
  } else if (
    !readCapabilityString(
      capabilities,
      "proofSubmitPath",
      "proof_submit_path",
      "proofSubmitEndpoint",
      "proof_submit_endpoint",
    ) ||
    !readCapabilityString(
      capabilities,
      "messageSubmitPath",
      "message_submit_path",
      "messageSubmitEndpoint",
      "message_submit_endpoint",
    )
  ) {
    reasons.push("This Torii endpoint is missing SCCP submit endpoints.");
  }
  if (!isRouteRecord(manifest)) {
    if (!loadFailure) {
      reasons.push("No TON SCCP manifest is advertised by this endpoint.");
    }
    return reasons;
  }
  const addressChecks: Array<[string, string]> = [
    ["TON bridge deployment address", readSccpTonBridgeAddress(manifest)],
    ["TON TairaXOR token address", readSccpTonTokenAddress(manifest)],
    ["TON verifier address", readSccpTonVerifierAddress(manifest)],
  ];
  for (const [label, address] of addressChecks) {
    if (!address) {
      reasons.push(`${label} is missing.`);
      continue;
    }
    try {
      normalizeTonRawAddress(address, label);
    } catch (error) {
      reasons.push(
        error instanceof Error
          ? `${label} is invalid: ${error.message}`
          : `${label} is invalid.`,
      );
    }
  }
  try {
    if (!readSccpTonProofMaterial(manifest, SCCP_TON_NETWORK.key)) {
      reasons.push(
        "The TON SCCP verifier rollout proof material is incomplete.",
      );
    }
  } catch (error) {
    reasons.push(
      error instanceof Error
        ? error.message
        : "The TON SCCP verifier rollout proof material is incomplete.",
    );
  }
  try {
    if (!readSccpTonFinalizeMessageValueNano(manifest)) {
      reasons.push("The TON finalize message value is missing.");
    }
  } catch (error) {
    reasons.push(
      error instanceof Error
        ? error.message
        : "The TON finalize message value is invalid.",
    );
  }
  try {
    if (!readSccpTairaBurnRecordMaterial(manifest)) {
      reasons.push("The TAIRA burn-record ZK contract material is missing.");
    }
  } catch (error) {
    reasons.push(
      error instanceof Error
        ? error.message
        : "The TAIRA burn-record ZK contract material is missing.",
    );
  }
  return reasons;
};
const tonForwardReadinessReasons = computed(() =>
  isTonRoute.value && direction.value === "taira-to-ton"
    ? readTonForwardReadinessReasons(bridge.readiness.value.tonManifest)
    : [],
);
const routeReadyForDirection = (candidate: SccpBridgeDirection): boolean =>
  isTonRoute.value && candidate === "taira-to-ton"
    ? readTonForwardReadinessReasons(bridge.readiness.value.tonManifest)
        .length === 0
    : bridge.readiness.value.ready;
const routeReadyForAction = computed(() =>
  routeReadyForDirection(direction.value),
);
const routeBlockingMessages = computed(() =>
  isTonRoute.value && direction.value === "taira-to-ton"
    ? tonForwardReadinessReasons.value
    : bridge.readiness.value.reasons,
);
const tonConcreteSourceLaneReady = computed(() => {
  const manifest = bridge.readiness.value.tonManifest;
  if (!bridge.readiness.value.ready || !isRouteRecord(manifest)) {
    return false;
  }
  return (
    Boolean(readSccpTonSourceBridgeAddress(manifest)) &&
    hasRouteRecord(
      manifest,
      "sourceVerifierMaterial",
      "source_verifier_material",
    ) &&
    hasRouteRecord(
      manifest,
      "sourceAdapterEngineDeployment",
      "source_adapter_engine_deployment",
    )
  );
});
const tonReturnBlocker = computed(() => {
  if (!isTonRoute.value || direction.value !== "ton-to-taira") {
    return "";
  }
  const counterparties = bridge.capabilities.value?.counterparties;
  if (Array.isArray(counterparties) && !tonConcreteSourceLaneReady.value) {
    const capability = tonSourceLaneCapability.value;
    if (!capability) {
      return "TAIRA SCCP capabilities do not advertise an active TON source lane.";
    }
    if (!capability.productionReady) {
      return (
        capability.disabledReason ||
        "TAIRA has not activated the TON source proof lane yet."
      );
    }
  }
  if (!tonSourceProverModuleUrl.value) {
    return "TON -> TAIRA needs a browser-safe TON source proof module before any TON source transaction is broadcast.";
  }
  return "";
});
const isForwardDirection = computed(
  () =>
    direction.value === "taira-to-tron" ||
    direction.value === "taira-to-bsc" ||
    direction.value === "taira-to-ton" ||
    direction.value === "taira-to-solana",
);
const isReturnDirection = computed(
  () =>
    direction.value === "tron-to-taira" ||
    direction.value === "bsc-to-taira" ||
    direction.value === "ton-to-taira" ||
    direction.value === "solana-to-taira",
);
const forwardDirectionLabel = computed(() =>
  isSolanaRoute.value
    ? "TAIRA -> Solana"
    : isTonRoute.value
      ? "TAIRA -> TON"
      : isBscRoute.value
        ? "TAIRA -> BSC"
        : "TAIRA -> TRON",
);
const returnDirectionLabel = computed(() =>
  isSolanaRoute.value
    ? "Solana -> TAIRA"
    : isTonRoute.value
      ? "TON -> TAIRA"
      : isBscRoute.value
        ? "BSC -> TAIRA"
        : "TRON -> TAIRA",
);
const counterpartyRecipientLabel = computed(() =>
  isSolanaRoute.value
    ? "Solana recipient"
    : isTonRoute.value
      ? "TON recipient"
      : isBscRoute.value
        ? "BSC recipient"
        : "TRON recipient",
);
const counterpartyTransactionIdLabel = computed(() =>
  isSolanaRoute.value
    ? "Solana transaction signature"
    : isTonRoute.value
      ? "TON transaction hash"
      : isBscRoute.value
        ? "BSC transaction hash"
        : "TRON transaction ID",
);
const counterpartyTransactionIdPlaceholder = computed(() =>
  isSolanaRoute.value
    ? "Optional Solana burn transaction signature"
    : isTonRoute.value
      ? "Optional TON burn transaction hash"
      : isBscRoute.value
        ? "Optional BSC burn transaction hash"
        : "Optional TRON burn transaction id",
);
const transferModeLabel = computed(() =>
  isForwardDirection.value ? "TAIRA source" : "Source-chain return",
);
const transferHelperText = computed(() =>
  isForwardDirection.value
    ? "Send XOR from TAIRA, then finalize it on the selected destination chain."
    : "Burn on the source chain, then settle the bound proof on TAIRA.",
);
const showMessageIdInput = computed(() => isForwardDirection.value);
const showGeneratedMessageId = computed(
  () => isReturnDirection.value && Boolean(messageId.value.trim()),
);
const proofFetchActionLabel = computed(() =>
  proofLoading.value
    ? isForwardDirection.value
      ? "Loading proof job"
      : "Loading proof data"
    : isForwardDirection.value
      ? "Resume with message ID"
      : "Resume from source transaction",
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
      : direction.value === "taira-to-ton"
        ? isValidTonRawAddress(tonRecipient.value)
        : direction.value === "taira-to-solana"
          ? isValidSolanaAddress(solanaRecipient.value)
          : isLikelyTairaAccount(tairaRecipient.value),
);
const submitDisabled = computed(
  () =>
    !routeReadyForAction.value ||
    Boolean(tonReturnBlocker.value) ||
    !activeProjectConfigured.value ||
    !activeWalletConnected.value ||
    !amountValid.value ||
    !destinationValid.value ||
    proofLoading.value,
);
const counterpartyConnectDisabled = computed(
  () =>
    !isTairaRoute.value ||
    !activeProjectConfigured.value ||
    activeWalletConnecting.value,
);
const proofFetchDisabled = computed(
  () =>
    (direction.value === "taira-to-tron" ||
    direction.value === "taira-to-bsc" ||
    direction.value === "taira-to-ton" ||
    direction.value === "taira-to-solana"
      ? !messageId.value
      : !tronTxId.value) ||
    !routeReadyForAction.value ||
    Boolean(tonReturnBlocker.value) ||
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
        : direction.value === "bsc-to-taira"
          ? "Prepare BSC -> TAIRA"
          : direction.value === "taira-to-ton"
            ? "Prepare TAIRA -> TON"
            : direction.value === "ton-to-taira"
              ? "Prepare TON -> TAIRA"
              : direction.value === "taira-to-solana"
                ? "Prepare TAIRA -> Solana"
                : "Prepare Solana -> TAIRA",
);
const walletConnectMissingMessage = computed(() =>
  isSolanaRoute.value
    ? "WalletConnect project ID is missing, so wallet connection is disabled."
    : isTonRoute.value
      ? "TON wallet connector is not available in this build."
      : isBscRoute.value
        ? "WalletConnect project ID is missing, so wallet connection is disabled."
        : "WalletConnect project ID is missing, so TRON wallet connection is disabled.",
);
const walletConnectInvalidMessage = computed(() =>
  isSolanaRoute.value
    ? "WalletConnect project ID is invalid, so wallet connection is disabled."
    : isTonRoute.value
      ? "TON wallet connector is misconfigured."
      : isBscRoute.value
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
    return isSolanaRoute.value
      ? t("Connect a Solana wallet to continue.")
      : isTonRoute.value
        ? t("Connect a TON wallet to continue.")
        : isBscRoute.value
          ? t("Connect a BSC wallet to continue.")
          : t("Connect a TRON wallet to continue.");
  }
  if (!routeReadyForAction.value) {
    return t("Route readiness must be true before bridge actions are enabled.");
  }
  if (tonReturnBlocker.value) {
    return t(tonReturnBlocker.value);
  }
  return t(
    "Bridge actions will request explicit wallet approval before signing.",
  );
});

const clearDirectionalResumeState = () => {
  messageId.value = "";
  tronTxId.value = "";
  transactionLinks.value = [];
  formError.value = "";
  proofReady.value = false;
  resetProofPhases();
};

const setBridgeDirection = (nextDirection: SccpBridgeDirection) => {
  if (direction.value === nextDirection) {
    return;
  }
  direction.value = nextDirection;
  clearDirectionalResumeState();
};

const setForwardDirection = () => {
  setBridgeDirection(
    isSolanaRoute.value
      ? "taira-to-solana"
      : isTonRoute.value
        ? "taira-to-ton"
        : isBscRoute.value
          ? "taira-to-bsc"
          : "taira-to-tron",
  );
};

const setReturnDirection = () => {
  setBridgeDirection(
    isSolanaRoute.value
      ? "solana-to-taira"
      : isTonRoute.value
        ? "ton-to-taira"
        : isBscRoute.value
          ? "bsc-to-taira"
          : "tron-to-taira",
  );
};

const selectCounterparty = (counterparty: SccpCounterpartyKey) => {
  if (selectedCounterparty.value === counterparty) {
    return;
  }
  selectedCounterparty.value = counterparty;
  setForwardDirection();
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

const normalizeEvmQuantityToUnsignedDecimal = (
  value: unknown,
  label: string,
): string => {
  const text = String(value ?? "").trim();
  const quantityPattern = /^0x[0-9a-f]+$/iu;
  const decimalPattern = /^(?:0|[1-9]\d*)$/u;
  let parsed: bigint;
  if (quantityPattern.test(text)) {
    parsed = BigInt(text);
  } else if (decimalPattern.test(text)) {
    parsed = BigInt(text);
  } else {
    throw new Error(`${label} must be an unsigned integer.`);
  }
  return parsed.toString(10);
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

const proofNow = (): number => Date.now();

const formatProofDuration = (durationMs: number | undefined): string => {
  if (!Number.isFinite(durationMs)) {
    return "";
  }
  const normalized = Math.max(0, Math.round(durationMs ?? 0));
  if (normalized < 1000) {
    return `${n(normalized)} ms`;
  }
  const seconds = normalized / 1000;
  return `${n(Number(seconds.toFixed(seconds < 10 ? 1 : 0)))} s`;
};

const formatProofPhaseDetail = (phase: ProofPhase): string => {
  const detail = t(phase.detail);
  const duration =
    phase.state === "active" && phase.startedAtMs !== undefined
      ? proofTimingNowMs.value - phase.startedAtMs
      : phase.durationMs;
  const formatted = formatProofDuration(duration);
  return formatted ? `${detail} (${formatted})` : detail;
};

const proofTimingRows = computed(() =>
  proofTimings.value.map((timing, index) => ({
    ...timing,
    key: `${timing.phaseId}-${index}`,
  })),
);

const formatProofTimingRow = (
  timing: ProofTimingEvent & { key: string },
): string => {
  const duration =
    timing.completedAtMs === undefined
      ? proofTimingNowMs.value - timing.startedAtMs
      : timing.durationMs;
  const formatted = formatProofDuration(duration);
  return formatted ? `${t(timing.detail)} (${formatted})` : t(timing.detail);
};

const proofTimingSnapshot = computed(() =>
  proofTimings.value.map((timing) => ({
    phaseId: timing.phaseId,
    label: timing.label,
    detail: timing.detail,
    state: timing.state,
    startedAtMs: timing.startedAtMs,
    completedAtMs: timing.completedAtMs ?? null,
    durationMs:
      timing.durationMs ??
      (timing.completedAtMs === undefined
        ? proofTimingNowMs.value - timing.startedAtMs
        : null),
    metadata: timing.metadata ?? {},
  })),
);

const exposeProofTimingsForAutomation = () => {
  if (typeof window === "undefined") {
    return;
  }
  (
    window as unknown as {
      __sccpProofTimings?: Array<Record<string, unknown>>;
    }
  ).__sccpProofTimings = proofTimingSnapshot.value as Array<
    Record<string, unknown>
  >;
};

const startProofTimingTicker = () => {
  if (proofTimingTicker) {
    return;
  }
  proofTimingNowMs.value = proofNow();
  proofTimingTicker = window.setInterval(() => {
    proofTimingNowMs.value = proofNow();
    exposeProofTimingsForAutomation();
  }, 500);
};

const stopProofTimingTicker = () => {
  if (!proofTimingTicker) {
    return;
  }
  window.clearInterval(proofTimingTicker);
  proofTimingTicker = null;
  proofTimingNowMs.value = proofNow();
  exposeProofTimingsForAutomation();
};

const beginProofTiming = (
  phaseId: string,
  label: string,
  detail: string,
  metadata?: Record<string, unknown>,
) => {
  const startedAtMs = proofNow();
  proofTimingNowMs.value = startedAtMs;
  proofTimings.value = [
    ...proofTimings.value,
    {
      phaseId,
      label,
      detail,
      state: "active",
      startedAtMs,
      ...(metadata ? { metadata } : {}),
    },
  ];
  exposeProofTimingsForAutomation();
};

const finishProofTiming = (
  phaseId: string,
  state: ProofTimingEvent["state"] = "complete",
  detail?: string,
  metadata?: Record<string, unknown>,
) => {
  const completedAtMs = proofNow();
  proofTimingNowMs.value = completedAtMs;
  const next = [...proofTimings.value];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const timing = next[index];
    if (timing?.phaseId !== phaseId || timing.completedAtMs !== undefined) {
      continue;
    }
    next[index] = {
      ...timing,
      state,
      detail: detail ?? timing.detail,
      completedAtMs,
      durationMs: completedAtMs - timing.startedAtMs,
      metadata: {
        ...(timing.metadata ?? {}),
        ...(metadata ?? {}),
      },
    };
    proofTimings.value = next;
    exposeProofTimingsForAutomation();
    return;
  }
};

const failActiveProofTimings = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  for (const timing of proofTimings.value) {
    if (timing.completedAtMs === undefined) {
      finishProofTiming(timing.phaseId, "failed", message);
    }
  }
};

const isRetryableSccpProofJobError = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error))
    .trim()
    .toLowerCase();
  return /(?:404|408|425|429|5\d\d|bad gateway|gateway timeout|service unavailable|not found|not ready|not indexed|indexing|pending|timeout|timed out|fetch failed|network|unavailable)/u.test(
    message,
  );
};

const sccpProofJobIndexingPollMs = (attempt: number): number => {
  if (attempt < 20) {
    return SCCP_PROOF_JOB_INDEXING_FAST_POLL_MS;
  }
  if (attempt < 32) {
    return 500;
  }
  if (attempt < 56) {
    return SCCP_PROOF_JOB_INDEXING_MEDIUM_POLL_MS;
  }
  return SCCP_PROOF_JOB_INDEXING_SLOW_POLL_MS;
};

const zkIvmProofPollMs = (elapsedMs: number): number => {
  if (elapsedMs < 15_000) {
    return SCCP_ZK_IVM_PROOF_FAST_POLL_MS;
  }
  if (elapsedMs < 90_000) {
    return SCCP_ZK_IVM_PROOF_MEDIUM_POLL_MS;
  }
  return SCCP_ZK_IVM_PROOF_SLOW_POLL_MS;
};

const retryableChainReadErrorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).trim().toLowerCase();

const isRetryableChainReadErrorMessage = (message: string): boolean =>
  /(?:404|408|425|429|5\d\d|bad gateway|gateway timeout|service unavailable|not found|not ready|not indexed|indexing|pending|timeout|timed out|fetch failed|network|unavailable)/u.test(
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

const isOptionalBscSourceLogReadError = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error))
    .trim()
    .toLowerCase();
  return /(?:eth_getlogs.*)?(?:limit exceeded|archive requests require.*personal token|archive request.*personal token|request exceeds .*log|log query.*too large)/u.test(
    message,
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

const isRetryableSolanaConfirmationError = (error: unknown): boolean => {
  const message = retryableChainReadErrorMessage(error);
  return (
    isRetryableChainReadErrorMessage(message) ||
    /(?:signature status is not indexed|not confirmed|not finalized)/u.test(
      message,
    )
  );
};

const waitForSolanaTransactionSuccess = async (
  context: SccpOperationContext,
  signature: string,
  label: string,
): Promise<Record<string, unknown>> => {
  const normalizedSignature = normalizeSolanaTransactionSignature(signature);
  let lastError: unknown = null;
  for (
    let attempt = 0;
    attempt < SCCP_BSC_CONFIRMATION_POLL_ATTEMPTS;
    attempt += 1
  ) {
    try {
      assertSccpOperationContextCurrent(context);
      const status = await getSolanaSignatureStatus({
        endpoint: context.solanaRpcEndpoint,
        signature: normalizedSignature,
      });
      if (!status) {
        throw new Error(`${label} signature status is not indexed yet.`);
      }
      if (status.err !== null && status.err !== undefined) {
        throw new Error(`${label} failed on Solana.`);
      }
      const confirmationStatus = String(status.confirmationStatus ?? "").trim();
      if (
        confirmationStatus === "confirmed" ||
        confirmationStatus === "finalized"
      ) {
        return status;
      }
      throw new Error(`${label} is not confirmed yet.`);
    } catch (error) {
      lastError = error;
      if (
        !isRetryableSolanaConfirmationError(error) ||
        attempt >= SCCP_BSC_CONFIRMATION_POLL_ATTEMPTS - 1
      ) {
        break;
      }
      markPhase(3, "active", `Waiting for ${label} confirmation`);
      await wait(SCCP_BSC_CONFIRMATION_POLL_MS);
    }
  }
  if (lastError && !isRetryableSolanaConfirmationError(lastError)) {
    throw lastError;
  }
  throw new Error(`Timed out waiting for ${label} confirmation.`);
};

const buildSolanaExplorerTransactionUrl = (signature: string): string => {
  const normalizedSignature = normalizeSolanaTransactionSignature(signature);
  try {
    const url = new URL(SCCP_SOLANA_NETWORK.explorerUrl);
    url.pathname = `/tx/${normalizedSignature}`;
    return url.toString();
  } catch (_error) {
    return `https://explorer.solana.com/tx/${normalizedSignature}?cluster=testnet`;
  }
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
      kind: "prewarm-ton-source-prover";
      input: { proverModuleUrl?: string };
    }
  | {
      kind: "prove-ton-source-package";
      input: TonSourceProofWorkerInput;
    }
  | {
      kind: "prove-solana-source-package";
      input: SolanaSourceProofWorkerInput;
    }
  | {
      kind: "prove-bsc-source-package";
      input: BscSourceProofWorkerInput;
    };

type BscSourceProofWorkerInput = Omit<
  BscToTairaSourceProofPackageInput,
  "proofArtifactHash" | "provingKeyHash" | "nativeEvmProverBundleHash"
> & {
  proofArtifactHash?: string;
  provingKeyHash?: string;
  nativeEvmProverBundleHash?: string;
  proverModuleUrl?: string;
  proverConfigUrl?: string;
};

type TonSourceProofWorkerInput = TonToTairaSourceProofPackageInput & {
  proverModuleUrl?: string;
};

type SolanaSourceProofWorkerInput = SolanaToTairaSourceProofPackageInput & {
  proverModuleUrl?: string;
};

type SccpOperationContext = {
  direction: SccpBridgeDirection;
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  accountId: string;
  tronAddress: string;
  bscAddress: string;
  tonAddress: string;
  solanaAddress: string;
  amountDecimal: string;
  tronRecipient: string;
  bscRecipient: string;
  tonRecipient: string;
  solanaRecipient: string;
  tairaRecipient: string;
  manifest: Record<string, unknown>;
  tronGatewayEndpoint: string;
  bscRpcEndpoint: string;
  solanaRpcEndpoint: string;
  manifestFingerprint: string;
  messageId?: string;
  tronTxId?: string;
  bscTxId?: string;
  tonTxId?: string;
  solanaTxId?: string;
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

type PersistentSccpWorkerPending = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason?: unknown) => void;
  timeout: number;
};

let tonSourceProofWorker: Worker | null = null;
const tonSourceProofWorkerPending = new Map<
  string,
  PersistentSccpWorkerPending
>();

const closeTonSourceProofWorker = (reason?: unknown) => {
  if (tonSourceProofWorker) {
    tonSourceProofWorker.terminate();
    tonSourceProofWorker = null;
  }
  const error =
    reason instanceof Error
      ? reason
      : new Error(
          typeof reason === "string" && reason.trim()
            ? reason
            : "TON source proof worker stopped.",
        );
  for (const pending of tonSourceProofWorkerPending.values()) {
    window.clearTimeout(pending.timeout);
    pending.reject(error);
  }
  tonSourceProofWorkerPending.clear();
};

const getTonSourceProofWorker = (): Worker => {
  if (typeof Worker === "undefined") {
    throw new Error("Browser proof worker is unavailable in this environment.");
  }
  if (tonSourceProofWorker) {
    return tonSourceProofWorker;
  }
  const worker = new Worker(
    new URL("../workers/sccpProver.worker.ts", import.meta.url),
    { type: "module" },
  );
  worker.onmessage = (
    event: MessageEvent<{
      id: string;
      ok: boolean;
      result?: unknown;
      error?: string;
    }>,
  ) => {
    const pending = tonSourceProofWorkerPending.get(event.data.id);
    if (!pending) {
      return;
    }
    tonSourceProofWorkerPending.delete(event.data.id);
    window.clearTimeout(pending.timeout);
    if (event.data.ok) {
      if (
        event.data.result &&
        typeof event.data.result === "object" &&
        !Array.isArray(event.data.result)
      ) {
        pending.resolve(event.data.result as Record<string, unknown>);
        return;
      }
      pending.reject(
        new Error("SCCP proof worker returned an invalid proof package."),
      );
      return;
    }
    pending.reject(new Error(event.data.error || "SCCP proof worker failed."));
  };
  worker.onerror = (event) => {
    closeTonSourceProofWorker(
      new Error(event.message || "SCCP proof worker failed."),
    );
  };
  worker.onmessageerror = () => {
    closeTonSourceProofWorker(
      new Error("SCCP proof worker returned an unreadable response."),
    );
  };
  tonSourceProofWorker = worker;
  return worker;
};

const runPersistentTonSourceProofWorker = <
  Result extends Record<string, unknown>,
>(
  request: Extract<
    SccpProofWorkerRequest,
    { kind: "prewarm-ton-source-prover" | "prove-ton-source-package" }
  >,
): Promise<Result> => {
  const worker = getTonSourceProofWorker();
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = window.setTimeout(() => {
      tonSourceProofWorkerPending.delete(id);
      reject(
        new Error(
          "SCCP proof worker timed out before returning a bound proof package.",
        ),
      );
    }, SCCP_PROOF_WORKER_TIMEOUT_MS);
    tonSourceProofWorkerPending.set(id, {
      resolve: (value) => resolve(value as Result),
      reject,
      timeout,
    });
    worker.postMessage({ id, ...request });
  });
};

const runTronProofWorker = (
  kind: "build-tron-proof-package" | "prove-tron-proof-package",
  input: TronSccpProofPackageInput,
): Promise<TronSccpProofPackage> =>
  runSccpProofWorker<TronSccpProofPackage>({ kind, input });

const sccpHexToBytes = (value: string, label: string): Uint8Array => {
  const normalized = value.trim().toLowerCase();
  if (!/^0x(?:[0-9a-f]{2})+$/u.test(normalized)) {
    throw new Error(`${label} must be even-length hex.`);
  }
  const bytes = new Uint8Array((normalized.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(
      normalized.slice(2 + index * 2, 4 + index * 2),
      16,
    );
  }
  return bytes;
};

const sccpBytesToHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const sccpBytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.slice(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const buildBscProofEnvelopeHash = (
  requestHash: string,
  proofBytesHex: string,
): string => {
  const prefix = new TextEncoder().encode("sccp:evm:groth16-proof-envelope:v1");
  const requestHashBytes = sccpHexToBytes(requestHash, "requestHash");
  if (requestHashBytes.length !== 32) {
    throw new Error("requestHash must be 32 bytes.");
  }
  const proofBytes = sccpHexToBytes(proofBytesHex, "proofBytes");
  const payload = new Uint8Array(
    prefix.length + requestHashBytes.length + proofBytes.length,
  );
  payload.set(prefix);
  payload.set(requestHashBytes, prefix.length);
  payload.set(proofBytes, prefix.length + requestHashBytes.length);
  return sccpBytesToHex(blake2b(payload, { dkLen: 32 }));
};

const runBscProofWorker = async (
  kind: "prove-bsc-proof-package",
  input: BscSccpProofPackageInput,
): Promise<BscSccpProofPackage> => {
  const electronProver = window.iroha?.proveBscSccpProof;
  if (typeof electronProver === "function") {
    const proofResult = await electronProver({
      request: input.witness as unknown as Record<string, unknown>,
      proverModuleUrl: input.proverModuleUrl,
      proverConfigUrl: input.proverConfigUrl,
    });
    const proofResultRecord = {
      ...(proofResult as Record<string, unknown>),
    };
    const requestHash = String(proofResultRecord.requestHash ?? "").trim();
    const proofBytes = String(proofResultRecord.proofBytes ?? "").trim();
    proofResultRecord.envelopeHash = buildBscProofEnvelopeHash(
      requestHash,
      proofBytes,
    );
    delete proofResultRecord.envelope_hash;
    return buildBscSccpProofPackage({
      ...input,
      proofResult:
        proofResultRecord as unknown as BscSccpProofPackageInput["proofResult"],
    });
  }
  return runSccpProofWorker<BscSccpProofPackage>({ kind, input });
};

const runTronSourceProofWorker = (
  input: TronToTairaSourceProofPackageInput,
): Promise<TronToTairaSourceProofPackage> =>
  runSccpProofWorker<TronToTairaSourceProofPackage>({
    kind: "prove-tron-source-package",
    input,
  });

const runTonSourceProofWorker = async (
  input: TonSourceProofWorkerInput,
): Promise<TonToTairaSourceProofPackage> => {
  const proofPackage =
    await runPersistentTonSourceProofWorker<TonToTairaSourceProofPackage>({
      kind: "prove-ton-source-package",
      input,
    });
  const buildWithDeployment =
    window.iroha?.buildTonSccpMessageBundleSourceProofWithDeployment;
  if (typeof buildWithDeployment !== "function") {
    throw new Error(
      "TON -> TAIRA deployment-bound source proofs require the Electron native proof bridge.",
    );
  }
  const sourceMaterialBinding = readTonSourceProverMaterialBinding(
    input.manifest,
  );
  return (await buildWithDeployment({
    proofPackage: proofPackage as unknown as Record<string, unknown>,
    sourceVerifierMaterial: sourceMaterialBinding.sourceVerifierMaterial,
    sourceAdapterEngineDeployment:
      sourceMaterialBinding.sourceAdapterEngineDeployment,
    label: "TON",
  })) as unknown as TonToTairaSourceProofPackage;
};

const runSolanaSourceProofWorker = (
  input: SolanaSourceProofWorkerInput,
): Promise<SolanaToTairaSourceProofPackage> =>
  runSccpProofWorker<SolanaToTairaSourceProofPackage>({
    kind: "prove-solana-source-package",
    input,
  });

const runBscSourceProofWorker = async (
  input: BscSourceProofWorkerInput,
): Promise<BscToTairaSourceProofPackage> => {
  const electronProver = window.iroha?.proveBscSccpSourceProof;
  if (typeof electronProver === "function") {
    return (await electronProver({
      input: input as unknown as Record<string, unknown>,
      proverModuleUrl: input.proverModuleUrl,
      proverConfigUrl: input.proverConfigUrl,
    })) as unknown as BscToTairaSourceProofPackage;
  }
  const workerInput = { ...input };
  delete workerInput.proofArtifactHash;
  delete workerInput.provingKeyHash;
  delete workerInput.nativeEvmProverBundleHash;
  return runSccpProofWorker<BscToTairaSourceProofPackage>({
    kind: "prove-bsc-source-package",
    input: workerInput,
  });
};

let tonSourceProverPrewarmKey = "";
let tonSourceProverPrewarmPromise: Promise<void> | null = null;

const prewarmTonSourceProver = async (
  moduleUrl = tonSourceProverModuleUrl.value,
): Promise<void> => {
  const normalizedModuleUrl = moduleUrl.trim();
  if (!normalizedModuleUrl) {
    throw new Error(
      t(
        "TON -> TAIRA needs a browser-safe TON source proof module before any TON source transaction is broadcast.",
      ),
    );
  }
  if (
    tonSourceProverPrewarmPromise &&
    tonSourceProverPrewarmKey === normalizedModuleUrl
  ) {
    await tonSourceProverPrewarmPromise;
    return;
  }
  tonSourceProverPrewarmKey = normalizedModuleUrl;
  tonSourceProverPrewarmPromise = runPersistentTonSourceProofWorker<{
    ready?: boolean;
  }>({
    kind: "prewarm-ton-source-prover",
    input: { proverModuleUrl: normalizedModuleUrl },
  }).then((result) => {
    if (result.ready !== true) {
      throw new Error("TON source proof worker did not confirm readiness.");
    }
  });
  try {
    await tonSourceProverPrewarmPromise;
  } catch (error) {
    if (tonSourceProverPrewarmKey === normalizedModuleUrl) {
      tonSourceProverPrewarmKey = "";
      tonSourceProverPrewarmPromise = null;
    }
    throw error;
  }
};

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

const readCurrentTonTransactionHash = (): string => {
  try {
    return normalizeTonTransactionHash(tronTxId.value);
  } catch (_error) {
    return "";
  }
};

const readCurrentTonAddress = (): string => {
  try {
    return normalizeTonRawAddress(ton.address.value);
  } catch (_error) {
    return "";
  }
};

const readCurrentTonRecipient = (): string => {
  try {
    return normalizeTonRawAddress(tonRecipient.value);
  } catch (_error) {
    return tonRecipient.value.trim();
  }
};

const readCurrentSolanaAddress = (): string => {
  try {
    return normalizeSolanaAddress(solana.address.value);
  } catch (_error) {
    return "";
  }
};

const readCurrentSolanaRecipient = (): string => {
  try {
    return normalizeSolanaAddress(solanaRecipient.value);
  } catch (_error) {
    return solanaRecipient.value.trim();
  }
};

const readCurrentSolanaTransactionSignature = (): string => {
  try {
    return normalizeSolanaTransactionSignature(tronTxId.value);
  } catch (_error) {
    return "";
  }
};

const createSccpOperationContext = (
  ids: Pick<
    SccpOperationContext,
    "messageId" | "tronTxId" | "bscTxId" | "tonTxId" | "solanaTxId"
  > = {},
): SccpOperationContext => {
  const manifest = isSolanaRoute.value
    ? bridge.readiness.value.solanaManifest
    : isTonRoute.value
      ? bridge.readiness.value.tonManifest
      : isBscRoute.value
        ? bridge.readiness.value.bscManifest
        : bridge.readiness.value.tronManifest;
  if (!routeReadyForDirection(direction.value) || !manifest) {
    throw new Error(
      routeMessages.value[0] ||
        "Route readiness must be true before bridge actions are enabled.",
    );
  }
  const manifestSnapshot = cloneSccpManifestSnapshot(manifest);
  const activeSolanaRoute = isSolanaRoute.value;
  const activeBscRoute = isBscRoute.value;
  const activeTonRoute = isTonRoute.value;
  return {
    direction: direction.value,
    toriiUrl: session.connection.toriiUrl,
    chainId: session.connection.chainId,
    networkPrefix: session.connection.networkPrefix,
    accountId: session.activeAccount?.accountId ?? "",
    tronAddress:
      activeSolanaRoute || activeBscRoute || activeTonRoute
        ? ""
        : normalizeTronAddress(tron.address.value),
    bscAddress:
      activeBscRoute && !activeSolanaRoute
        ? normalizeBscAddress(bsc.address.value)
        : "",
    tonAddress:
      activeTonRoute && !activeSolanaRoute
        ? normalizeTonRawAddress(ton.address.value)
        : "",
    solanaAddress: activeSolanaRoute
      ? normalizeSolanaAddress(solana.address.value)
      : "",
    amountDecimal: normalizeBridgeAmount(amount.value),
    tronRecipient:
      activeSolanaRoute || activeBscRoute || activeTonRoute
        ? ""
        : tronRecipient.value.trim(),
    bscRecipient:
      activeBscRoute && direction.value === "taira-to-bsc"
        ? normalizeBscAddress(bscRecipient.value)
        : bscRecipient.value.trim(),
    tonRecipient:
      activeTonRoute && direction.value === "taira-to-ton"
        ? normalizeTonRawAddress(tonRecipient.value)
        : tonRecipient.value.trim(),
    solanaRecipient:
      activeSolanaRoute && direction.value === "taira-to-solana"
        ? normalizeSolanaAddress(solanaRecipient.value)
        : solanaRecipient.value.trim(),
    tairaRecipient: tairaRecipient.value.trim(),
    manifest: manifestSnapshot,
    tronGatewayEndpoint:
      activeSolanaRoute || activeBscRoute || activeTonRoute
        ? ""
        : readSccpTronGatewayEndpoint(manifestSnapshot, SCCP_TRON_NETWORK.key),
    bscRpcEndpoint: activeBscRoute
      ? readSccpBscRpcEndpoint(manifestSnapshot, SCCP_BSC_NETWORK.key)
      : "",
    solanaRpcEndpoint: activeSolanaRoute
      ? readSccpSolanaRpcEndpoint(manifestSnapshot, SCCP_SOLANA_NETWORK.key)
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
  const contextIsTon =
    context.direction === "taira-to-ton" ||
    context.direction === "ton-to-taira";
  const contextIsSolana =
    context.direction === "taira-to-solana" ||
    context.direction === "solana-to-taira";
  const currentManifest = contextIsBsc
    ? bridge.readiness.value.bscManifest
    : contextIsTon
      ? bridge.readiness.value.tonManifest
      : contextIsSolana
        ? bridge.readiness.value.solanaManifest
        : bridge.readiness.value.tronManifest;
  if (
    !routeReadyForDirection(context.direction) ||
    !currentManifest ||
    context.direction !== direction.value ||
    context.toriiUrl !== session.connection.toriiUrl ||
    context.chainId !== session.connection.chainId ||
    context.networkPrefix !== session.connection.networkPrefix ||
    context.accountId !== (session.activeAccount?.accountId ?? "") ||
    (!contextIsSolana &&
      !contextIsBsc &&
      !contextIsTon &&
      context.tronAddress !== tron.address.value) ||
    (contextIsBsc && context.bscAddress !== readCurrentBscAddress()) ||
    (contextIsTon && context.tonAddress !== readCurrentTonAddress()) ||
    (contextIsSolana && context.solanaAddress !== readCurrentSolanaAddress()) ||
    context.amountDecimal !== normalizeBridgeAmount(amount.value) ||
    (!contextIsSolana &&
      !contextIsBsc &&
      !contextIsTon &&
      context.tronRecipient !== tronRecipient.value.trim()) ||
    (contextIsBsc &&
      context.direction === "taira-to-bsc" &&
      context.bscRecipient !== readCurrentBscRecipient()) ||
    (contextIsBsc &&
      context.direction !== "taira-to-bsc" &&
      context.bscRecipient !== bscRecipient.value.trim()) ||
    (contextIsTon &&
      context.direction === "taira-to-ton" &&
      context.tonRecipient !== readCurrentTonRecipient()) ||
    (contextIsTon &&
      context.direction !== "taira-to-ton" &&
      context.tonRecipient !== tonRecipient.value.trim()) ||
    (contextIsSolana &&
      context.direction === "taira-to-solana" &&
      context.solanaRecipient !== readCurrentSolanaRecipient()) ||
    (contextIsSolana &&
      context.direction !== "taira-to-solana" &&
      context.solanaRecipient !== solanaRecipient.value.trim()) ||
    context.tairaRecipient !== tairaRecipient.value.trim() ||
    (!contextIsSolana &&
      !contextIsBsc &&
      !contextIsTon &&
      context.tronGatewayEndpoint !==
        readSccpTronGatewayEndpoint(currentManifest, SCCP_TRON_NETWORK.key)) ||
    (contextIsBsc &&
      context.bscRpcEndpoint !==
        readSccpBscRpcEndpoint(currentManifest, SCCP_BSC_NETWORK.key)) ||
    (contextIsSolana &&
      context.solanaRpcEndpoint !==
        readSccpSolanaRpcEndpoint(currentManifest, SCCP_SOLANA_NETWORK.key)) ||
    context.manifestFingerprint !== fingerprintSccpManifest(currentManifest) ||
    (context.messageId !== undefined &&
      context.messageId !== messageId.value.trim().toLowerCase()) ||
    (context.tronTxId !== undefined &&
      context.tronTxId !== tronTxId.value.trim().toLowerCase()) ||
    (context.bscTxId !== undefined &&
      context.bscTxId !== readCurrentBscTransactionHash()) ||
    (context.tonTxId !== undefined &&
      context.tonTxId !== readCurrentTonTransactionHash()) ||
    (context.solanaTxId !== undefined &&
      context.solanaTxId !== readCurrentSolanaTransactionSignature())
  ) {
    throw new Error(SCCP_CONTEXT_CHANGED_ERROR);
  }
};

const loadTairaMessageProofJob = async (
  context: SccpOperationContext,
  input: { pollForIndexing?: boolean } = {},
): Promise<Record<string, unknown>> => {
  type SccpMessageProofJobRequest = Parameters<
    typeof getSccpMessageProofJob
  >[0];
  const baseRequest = {
    toriiUrl: context.toriiUrl,
    messageId: context.messageId ?? messageId.value,
  };
  let cachedRequest: SccpMessageProofJobRequest | null = null;
  const buildRequest = async () => {
    if (cachedRequest) {
      return cachedRequest;
    }
    const messageBundle = await getSccpMessageProofBundle(baseRequest);
    assertSccpOperationContextCurrent(context);
    cachedRequest = {
      ...baseRequest,
      ...(context.direction === "taira-to-bsc"
        ? buildTairaXorBscMessageProofJobQueryMaterial({
            manifest: context.manifest,
            messageBundle,
            messageId: baseRequest.messageId,
            bscNetwork: SCCP_BSC_NETWORK.key,
          })
        : context.direction === "taira-to-ton"
          ? buildTairaXorTonMessageProofJobQueryMaterial({
              manifest: context.manifest,
              messageBundle,
              messageId: baseRequest.messageId,
              tonNetwork: SCCP_TON_NETWORK.key,
            })
          : context.direction === "taira-to-solana"
            ? buildTairaXorSolanaMessageProofJobQueryMaterial({
                manifest: context.manifest,
                messageBundle,
                messageId: baseRequest.messageId,
                solanaNetwork: SCCP_SOLANA_NETWORK.key,
              })
            : buildTairaXorMessageProofJobQueryMaterial({
                manifest: context.manifest,
                messageBundle,
                messageId: baseRequest.messageId,
                tronNetwork: SCCP_TRON_NETWORK.key,
              })),
    } as SccpMessageProofJobRequest;
    return cachedRequest;
  };
  if (!input.pollForIndexing) {
    assertSccpOperationContextCurrent(context);
    beginProofTiming(
      "sccp-proof-job-indexing",
      "SCCP proof job indexing",
      "Loading SCCP proof job",
      {
        messageId: baseRequest.messageId,
      },
    );
    const request = await buildRequest();
    assertSccpOperationContextCurrent(context);
    try {
      const job = await getSccpMessageProofJob(request);
      finishProofTiming(
        "sccp-proof-job-indexing",
        "complete",
        "SCCP proof job loaded",
        {
          messageId: baseRequest.messageId,
        },
      );
      return job;
    } catch (error) {
      finishProofTiming(
        "sccp-proof-job-indexing",
        "failed",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
  beginProofTiming(
    "sccp-proof-job-indexing",
    "SCCP proof job indexing",
    "Waiting for Torii to index the SCCP message",
    {
      messageId: baseRequest.messageId,
    },
  );
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
      const job = await getSccpMessageProofJob(request);
      finishProofTiming(
        "sccp-proof-job-indexing",
        "complete",
        "Torii returned the SCCP proof job",
        {
          messageId: baseRequest.messageId,
          attempts: attempt + 1,
        },
      );
      return job;
    } catch (error) {
      lastError = error;
      if (
        !isRetryableSccpProofJobError(error) ||
        attempt >= SCCP_PROOF_JOB_INDEXING_POLL_ATTEMPTS - 1
      ) {
        break;
      }
      markPhase(1, "active", "Waiting for SCCP proof job indexing");
      await wait(sccpProofJobIndexingPollMs(attempt));
    }
  }
  if (lastError && !isRetryableSccpProofJobError(lastError)) {
    finishProofTiming(
      "sccp-proof-job-indexing",
      "failed",
      lastError instanceof Error ? lastError.message : String(lastError),
    );
    throw lastError;
  }
  finishProofTiming(
    "sccp-proof-job-indexing",
    "failed",
    "Timed out waiting for Torii to index the SCCP proof job.",
  );
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
    const indexedLogsPromise = getEvmLogs({
      endpoint: input.context.bscRpcEndpoint,
      address: sourceBridgeAddress,
      fromBlock: receiptBlockNumber,
      toBlock: receiptBlockNumber,
      topics: [SCCP_EVM_SOURCE_EVENT_TOPIC],
    }).catch((error: unknown) => {
      if (isOptionalBscSourceLogReadError(error)) {
        return null;
      }
      throw error;
    });
    const [block, indexedLogs] = await Promise.all([
      getEvmBlockByHash({
        endpoint: input.context.bscRpcEndpoint,
        blockHash,
        fullTransactions: false,
      }),
      indexedLogsPromise,
    ]);
    if (!block) {
      throw new Error("BSC source block is not indexed yet.");
    }
    const blockRecord = asRecord(block, "BSC source block");
    const blockReceipts = await loadBscBlockReceiptsForProof({
      endpoint: input.context.bscRpcEndpoint,
      block: blockRecord,
      blockNumber: receiptBlockNumber,
      txHash,
      knownReceipt: receiptRecord,
    });
    return bindBscSourceDataForProof({
      txId: txHash,
      transaction,
      receipt: receiptRecord,
      indexedLogs: indexedLogs ?? undefined,
      block: blockRecord,
      blockReceipts,
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
  const startedAtMs = proofNow();
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
        await wait(zkIvmProofPollMs(proofNow() - startedAtMs));
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
      await wait(zkIvmProofPollMs(proofNow() - startedAtMs));
    }
  }
  throw new Error("Timed out waiting for the ZK IVM proof job.");
};

const isRetryableZkIvmProveStartError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:HTTP\s+50[234]|50[234]\s+Gateway|Gateway Time-out|endpoint is unavailable|Failed to fetch|NetworkError)/iu.test(
    message,
  );
};

const startZkIvmProveJobWithRetry = async (
  context: SccpOperationContext,
  input: Parameters<typeof startZkIvmProveJob>[0],
): Promise<Record<string, unknown>> => {
  const maxAttempts = 4;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    assertSccpOperationContextCurrent(context);
    try {
      return await startZkIvmProveJob(input);
    } catch (error) {
      lastError = error;
      if (
        !isRetryableZkIvmProveStartError(error) ||
        attempt >= maxAttempts - 1
      ) {
        throw error;
      }
      markPhase(1, "active", "Proof service timed out; retrying request");
      await wait(2000 * (attempt + 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "ZK IVM prove request failed."));
};

const queueZkIvmProveJob = async (
  context: SccpOperationContext,
  input: Parameters<typeof startZkIvmProveJob>[0],
): Promise<Record<string, unknown>> => {
  beginProofTiming(
    "taira-zk-prove-queue",
    "TAIRA proof job queue",
    "Queueing burn-record proof request",
    {
      usedDerivedPayload: false,
    },
  );
  try {
    const proveJob = await startZkIvmProveJobWithRetry(context, input);
    finishProofTiming(
      "taira-zk-prove-queue",
      "complete",
      "TAIRA proof job accepted",
      {
        usedDerivedPayload: false,
      },
    );
    return proveJob;
  } catch (error) {
    finishProofTiming(
      "taira-zk-prove-queue",
      "failed",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
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

const clearTonBalances = () => {
  tonBalanceError.value = "";
};

const clearSolanaBalances = () => {
  solanaSolBalanceLamports.value = null;
  solanaXorBalanceBaseUnits.value = null;
  solanaXorDecimals.value = null;
  solanaXorTokenAccounts.value = [];
  solanaBalanceError.value = "";
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

const readSolanaTokenAmount = (
  value: Record<string, unknown>,
): {
  amount: string;
  decimals: number | null;
  accounts: Array<{ pubkey: string; amount: string }>;
} => {
  const amountText = String(value.amount ?? "").trim();
  if (!/^(?:0|[1-9]\d*)$/u.test(amountText)) {
    throw new Error("Solana SPL token balance must be an unsigned integer.");
  }
  const decimals =
    value.decimals === null || value.decimals === undefined
      ? null
      : Number(value.decimals);
  if (
    decimals !== null &&
    (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36)
  ) {
    throw new Error("Solana SPL token decimals are invalid.");
  }
  const rawAccounts = Array.isArray(value.accounts) ? value.accounts : [];
  const accounts = rawAccounts.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Solana SPL token account ${index + 1} is invalid.`);
    }
    const record = entry as Record<string, unknown>;
    const pubkey = normalizeSolanaAddress(
      String(record.pubkey ?? ""),
      `Solana SPL token account ${index + 1}`,
    );
    const amount = String(record.amount ?? "").trim();
    if (!/^(?:0|[1-9]\d*)$/u.test(amount)) {
      throw new Error(
        `Solana SPL token account ${index + 1} amount is invalid.`,
      );
    }
    return { pubkey, amount };
  });
  return { amount: amountText, decimals, accounts };
};

const refreshSolanaBalances = async () => {
  clearSolanaBalances();
  if (!solana.connected.value) {
    return;
  }
  solanaBalanceLoading.value = true;
  try {
    const manifest = bridge.readiness.value.solanaManifest;
    const endpoint = manifest
      ? readSccpSolanaRpcEndpoint(manifest, SCCP_SOLANA_NETWORK.key)
      : SCCP_SOLANA_NETWORK.rpcUrl;
    const tokenAddress = manifest ? readSccpSolanaTokenAddress(manifest) : "";
    const [nativeBalance, tokenBalance] = await Promise.all([
      getSolanaBalance({ endpoint, address: solana.address.value }),
      bridge.readiness.value.ready && tokenAddress
        ? getSolanaTokenBalance({
            endpoint,
            ownerAddress: solana.address.value,
            mintAddress: tokenAddress,
          })
        : Promise.resolve(null),
    ]);
    solanaSolBalanceLamports.value = nativeBalance;
    if (tokenBalance) {
      const tokenAmount = readSolanaTokenAmount(tokenBalance);
      solanaXorBalanceBaseUnits.value = tokenAmount.amount;
      solanaXorDecimals.value = tokenAmount.decimals;
      solanaXorTokenAccounts.value = tokenAmount.accounts;
    }
  } catch (error) {
    solanaSolBalanceLamports.value = null;
    solanaXorBalanceBaseUnits.value = null;
    solanaXorDecimals.value = null;
    solanaXorTokenAccounts.value = [];
    solanaBalanceError.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    solanaBalanceLoading.value = false;
  }
};

const refreshAll = async () => {
  if (!isTairaRoute.value) {
    bridge.resetState();
    clearTronBalances();
    clearBscBalances();
    clearTonBalances();
    clearSolanaBalances();
    return;
  }
  await Promise.all([bridge.refreshRoute(), bridge.refreshBalances()]);
  if (isSolanaRoute.value) {
    await refreshSolanaBalances();
  } else if (isTonRoute.value) {
    clearTonBalances();
  } else if (isBscRoute.value) {
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
  if (isSolanaRoute.value) {
    await solana.connect();
    await refreshSolanaBalances();
  } else if (isTonRoute.value) {
    await ton.connect();
    clearTonBalances();
  } else if (isBscRoute.value) {
    await bsc.connect();
    await refreshBscBalances();
  } else {
    await tron.connect();
    await refreshTronBalances();
  }
};

const disconnectCounterparty = async () => {
  if (isSolanaRoute.value) {
    await solana.disconnect();
    clearSolanaBalances();
  } else if (isTonRoute.value) {
    await ton.disconnect();
    clearTonBalances();
  } else if (isBscRoute.value) {
    await bsc.disconnect();
    await refreshBscBalances();
  } else {
    await tron.disconnect();
    await refreshTronBalances();
  }
};

const resetProofPhases = () => {
  proofReady.value = false;
  proofPhases.value = createInitialProofPhases();
  proofTimings.value = [];
  proofTimingNowMs.value = proofNow();
  exposeProofTimingsForAutomation();
};

const markPhase = (index: number, state: ProofPhaseState, detail: string) => {
  const current = proofPhases.value[index];
  if (!current) {
    return;
  }
  const timestamp = proofNow();
  const startedAtMs =
    state === "active"
      ? current.state === "active" && current.startedAtMs !== undefined
        ? current.startedAtMs
        : timestamp
      : current.startedAtMs;
  const completedAtMs =
    state === "complete" || state === "failed" ? timestamp : undefined;
  const durationMs =
    completedAtMs !== undefined && startedAtMs !== undefined
      ? completedAtMs - startedAtMs
      : undefined;
  proofPhases.value[index] = {
    ...current,
    state,
    detail,
    startedAtMs,
    completedAtMs,
    durationMs,
  };
  proofTimingNowMs.value = timestamp;
  exposeProofTimingsForAutomation();
};

const validateForm = () => {
  if (!routeReadyForAction.value) {
    throw new Error(
      routeMessages.value[0] ||
        t("Route readiness must be true before bridge actions are enabled."),
    );
  }
  if (tonReturnBlocker.value) {
    throw new Error(t(tonReturnBlocker.value));
  }
  if (activeProjectConfigurationError.value) {
    throw new Error(t(walletConnectInvalidMessage.value));
  }
  if (!activeProjectConfigured.value) {
    throw new Error(t(walletConnectMissingMessage.value));
  }
  if (!activeWalletConnected.value) {
    throw new Error(
      isSolanaRoute.value
        ? t("Connect a Solana wallet to continue.")
        : isTonRoute.value
          ? t("Connect a TON wallet to continue.")
          : isBscRoute.value
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
        : direction.value === "taira-to-ton"
          ? t("Enter a valid TON raw recipient address.")
          : direction.value === "taira-to-solana"
            ? t("Enter a valid Solana Base58 recipient address.")
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

const SOLANA_TRANSACTION_BUILDER_BLOCKER =
  "Solana SCCP source burn is connected, but the production Solana source proof executor and TAIRA settlement proof payloads are not available in this app build. Keep settlement fail-closed until the deployed route publishes governed Solana source proof material.";

const finalizeTairaMessageToSolana = async (
  context: SccpOperationContext,
  input: { pollForIndexing?: boolean } = {},
) => {
  const job = await loadTairaMessageProofJob(context, input);
  markPhase(0, "complete", "Route and message id accepted");
  markPhase(1, "complete", "Torii returned an SCCP proof job");
  const finalizeRequest = buildTairaXorSolanaFinalizeTransactionRequest({
    manifest: context.manifest,
    job,
    ownerAddress: context.solanaAddress,
    tairaSender: context.accountId,
    solanaRecipient: context.solanaRecipient,
    amountDecimal: context.amountDecimal,
    messageId: context.messageId ?? messageId.value,
    solanaNetwork: SCCP_SOLANA_NETWORK.key,
  });
  messageId.value = finalizeRequest.messageId;
  markPhase(2, "complete", "Solana verifier instruction is ready");
  markPhase(3, "active", "Requesting Solana wallet approval");
  assertSccpOperationContextCurrent(context);
  const transactionB64 = await buildSolanaTransaction(
    finalizeRequest.transaction,
  );
  assertSccpOperationContextCurrent(context);
  const signature = normalizeSolanaTransactionSignature(
    await solana.signAndSendTransaction(transactionB64),
  );
  const solanaContext = {
    ...context,
    solanaTxId: signature,
  };
  tronTxId.value = signature;
  const finalizeLink = {
    label: t("Solana finalize transaction"),
    href: buildSolanaExplorerTransactionUrl(signature),
  };
  transactionLinks.value = [
    ...transactionLinks.value.filter((link) => link.href !== finalizeLink.href),
    finalizeLink,
  ];
  markPhase(3, "active", "Waiting for Solana finalize confirmation");
  await waitForSolanaTransactionSuccess(
    solanaContext,
    signature,
    "Solana finalize transaction",
  );
  assertSccpOperationContextCurrent(solanaContext);
  proofReady.value = true;
  markPhase(3, "complete", "Solana finalize transaction confirmed");
};

const submitTairaToSolana = async (
  context: SccpOperationContext,
): Promise<void> => {
  assertSccpOperationContextCurrent(context);
  markPhase(1, "failed", "Solana TAIRA burn-record builder is unavailable");
  throw new Error(SOLANA_TRANSACTION_BUILDER_BLOCKER);
};

const selectSolanaTokenAccountForBurn = (amountBaseUnits: string): string => {
  const required = BigInt(amountBaseUnits);
  const account = solanaXorTokenAccounts.value.find((entry) => {
    try {
      return BigInt(entry.amount) >= required;
    } catch (_error) {
      return false;
    }
  });
  if (!account) {
    throw new Error(
      "No Solana TairaXOR token account has enough balance for this burn.",
    );
  }
  return account.pubkey;
};

const submitSolanaBurnToTaira = async (
  context: SccpOperationContext,
): Promise<void> => {
  assertSccpOperationContextCurrent(context);
  markPhase(1, "active", "Refreshing Solana token accounts");
  await refreshSolanaBalances();
  assertSccpOperationContextCurrent(context);
  const amountBaseUnits = bridgeDecimalToTairaBaseUnits(context.amountDecimal);
  const sourceTokenAddress = selectSolanaTokenAccountForBurn(amountBaseUnits);
  const burnRequest = buildTairaXorSolanaBurnTransactionRequest({
    manifest: context.manifest,
    ownerAddress: context.solanaAddress,
    sourceTokenAddress,
    tairaRecipient: context.tairaRecipient,
    amountDecimal: context.amountDecimal,
    nonce: `${Date.now()}`,
    solanaNetwork: SCCP_SOLANA_NETWORK.key,
  });
  markPhase(1, "complete", "Unsigned Solana burn transaction created");
  markPhase(
    2,
    "complete",
    "Solana-source proof data collection can begin after broadcast",
  );
  markPhase(3, "active", "Requesting Solana wallet approval");
  assertSccpOperationContextCurrent(context);
  const transactionB64 = await buildSolanaTransaction(burnRequest.transaction);
  assertSccpOperationContextCurrent(context);
  const signature = normalizeSolanaTransactionSignature(
    await solana.signAndSendTransaction(transactionB64),
  );
  tronTxId.value = signature;
  const solanaSourceContext = {
    ...context,
    solanaTxId: signature,
  };
  transactionLinks.value = [
    {
      label: t("Solana burn transaction"),
      href: buildSolanaExplorerTransactionUrl(signature),
    },
  ];
  markPhase(3, "complete", "Solana burn transaction broadcast");
  await finalizeSolanaBurnToTaira(solanaSourceContext, {
    pollForFinality: true,
  });
};

const finalizeSolanaBurnToTaira = async (
  context: SccpOperationContext,
  input: { pollForFinality?: boolean } = {},
) => {
  const signature = context.solanaTxId ?? tronTxId.value;
  if (!signature) {
    throw new Error("Solana transaction signature is required.");
  }
  const normalizedSignature = normalizeSolanaTransactionSignature(signature);
  markPhase(1, "active", "Checking Solana transaction finality");
  const signatureStatus = input.pollForFinality
    ? await waitForSolanaTransactionSuccess(
        context,
        normalizedSignature,
        "Solana burn transaction",
      )
    : await getSolanaSignatureStatus({
        endpoint: context.solanaRpcEndpoint,
        signature: normalizedSignature,
      });
  if (!signatureStatus) {
    throw new Error("Solana burn transaction signature status is not indexed.");
  }
  if (signatureStatus.err !== null && signatureStatus.err !== undefined) {
    throw new Error("Solana burn transaction failed on Solana.");
  }
  const transaction = await getSolanaTransaction({
    endpoint: context.solanaRpcEndpoint,
    signature: normalizedSignature,
  });
  if (!transaction) {
    throw new Error("Solana burn transaction is not indexed yet.");
  }
  markPhase(1, "complete", "Solana source transaction data collected");
  markPhase(2, "active", "Generating Solana source proof package");
  assertSccpOperationContextCurrent(context);
  const amountBaseUnits = bridgeDecimalToTairaBaseUnits(context.amountDecimal);
  const proofPackage = await runSolanaSourceProofWorker({
    manifest: context.manifest,
    solanaNetwork: SCCP_SOLANA_NETWORK.key,
    proverModuleUrl: readSccpSolanaSourceProverModuleUrl(context.manifest),
    solanaRpcUrl:
      readSccpSolanaRpcEndpoint(context.manifest, SCCP_SOLANA_NETWORK.key) ||
      SCCP_SOLANA_NETWORK.rpcUrl,
    sourceBridgeAddress: readSccpSolanaSourceBridgeAddress(context.manifest),
    sourceStateAddress: readSccpSolanaSourceStateAddress(context.manifest),
    tokenMintAddress: readSccpSolanaTokenAddress(context.manifest),
    txId: normalizedSignature,
    transaction,
    signatureStatus,
    finality: signatureStatus,
    solanaSender: context.solanaAddress,
    tairaRecipient: context.tairaRecipient,
    amountDecimal: context.amountDecimal,
    amountBaseUnits,
  });
  assertSccpOperationContextCurrent(context);
  const boundProofPackage = bindSolanaToTairaSourceProofPackage({
    manifest: context.manifest,
    proofPackage,
    txId: normalizedSignature,
    solanaSender: context.solanaAddress,
    tairaRecipient: context.tairaRecipient,
    amountDecimal: context.amountDecimal,
    amountBaseUnits,
  });
  messageId.value = boundProofPackage.messageId;
  markPhase(2, "complete", "Solana source proof package is ready");
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
  markPhase(3, "active", "Waiting for TAIRA settlement confirmation");
  await waitForSccpTransactionCommit({
    toriiUrl: context.toriiUrl,
    hashHex: normalizedTairaTxHash,
  });
  assertSccpOperationContextCurrent(context);
  proofReady.value = true;
  markPhase(3, "complete", "TAIRA settlement confirmed");
  if (tairaTxHref) {
    transactionLinks.value = [
      ...transactionLinks.value.filter((link) => link.href !== tairaTxHref),
      {
        label: t("TAIRA settlement transaction"),
        href: tairaTxHref,
      },
    ];
  }
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
    proverModuleUrl: readSccpBscDestinationProverModuleUrl(context.manifest),
    proverConfigUrl: readSccpBscRuntimeProverConfigUrl(context.manifest),
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

const readTonWalletSignedBoc = (value: unknown): string => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "";
  }
  const boc = String((value as Record<string, unknown>).boc ?? "").trim();
  return boc && boc.length <= 200_000 ? boc : "";
};

const readTonWalletTransactionHash = (
  value: unknown,
  fallback: string,
): string => {
  if (fallback.trim()) {
    return normalizeTonTransactionHash(fallback);
  }
  const record =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const candidate = String(
    record?.hash ??
      record?.txHash ??
      record?.tx_hash ??
      record?.transactionHash ??
      record?.transaction_hash ??
      record?.txId ??
      record?.tx_id ??
      record?.transactionId ??
      record?.transaction_id ??
      "",
  ).trim();
  if (candidate) {
    return normalizeTonTransactionHash(candidate);
  }
  throw new Error(
    "TON wallet did not return a source transaction hash; enter the TON transaction hash after it appears in the explorer, then fetch proof data.",
  );
};

const buildTonToTairaSourceRecord = (context: SccpOperationContext) => {
  const amountBaseUnits = bridgeDecimalToTairaBaseUnits(context.amountDecimal);
  const nonce = Date.now().toString();
  const payloadInput = {
    tonSender: context.tonAddress,
    tairaRecipient: context.tairaRecipient,
    amount: amountBaseUnits,
    nonce,
  };
  const transferPayload = buildTairaXorTonToTairaTransferPayload(payloadInput);
  const messageId = tairaXorTonToTairaTransferMessageId(payloadInput);
  const payloadHash = sccpPayloadHash(
    canonicalSccpPayloadEnvelopeBytes({
      kind: "Transfer",
      value: transferPayload,
    }),
  );
  const commitmentRoot = sccpMerkleRootFromCommitment(
    {
      version: 1,
      kind: "Transfer",
      target_domain: 0,
      message_id: messageId,
      payload_hash: payloadHash,
    },
    { steps: [] },
  );
  const payloadBocBytes = beginCell()
    .storeUint(SCCP_TON_SOURCE_RECORD_OP, 32)
    .storeUint(BigInt(Date.now()), 64)
    .storeUint(1, 16)
    .storeUint(BigInt(messageId), 256)
    .storeUint(BigInt(payloadHash), 256)
    .storeUint(BigInt(commitmentRoot), 256)
    .storeUint(BigInt(amountBaseUnits), 128)
    .endCell()
    .toBoc({ idx: false });
  return {
    amountBaseUnits,
    commitmentRoot,
    messageId,
    nonce,
    payloadBocBytes,
    payloadHash,
  };
};

const finalizeTairaMessageToTon = async (
  context: SccpOperationContext,
  input: { pollForIndexing?: boolean } = {},
) => {
  const job = await loadTairaMessageProofJob(context, input);
  markPhase(0, "complete", "Route and message id accepted");
  markPhase(1, "complete", "Torii returned a TON SCCP proof job");
  const binding = buildTairaXorTonFinalizeProofBinding({
    manifest: context.manifest,
    job,
    messageId: context.messageId ?? messageId.value,
    tairaSender: context.accountId,
    tonRecipient: context.tonRecipient,
    amountDecimal: context.amountDecimal,
    tonNetwork: SCCP_TON_NETWORK.key,
  });
  const verifierRawAddress = readSccpTonVerifierAddress(context.manifest);
  const verifierWalletAddress = toUserFriendlyAddress(
    normalizeTonRawAddress(verifierRawAddress, "TON verifier address"),
    true,
  );
  const messageValueNano = readSccpTonFinalizeMessageValueNano(
    context.manifest,
  );
  const verifierProtocolVersion = readSccpTonVerifierProtocolVersion(
    context.manifest,
  );
  assertSccpOperationContextCurrent(context);
  const verifierLink = {
    label: t("TON verifier contract"),
    href: `${SCCP_TON_NETWORK.explorerUrl}/address/${verifierWalletAddress}`,
  };
  transactionLinks.value = [
    ...transactionLinks.value.filter((link) => link.href !== verifierLink.href),
    verifierLink,
  ];
  if (verifierProtocolVersion === SCCP_TON_VERIFIER_PROTOCOL_COMPACT_V2) {
    const compactPlan = buildSccpTonCompactFinalizeMessageBodyBocFromBytes({
      messageBodyBocHex: binding.messageBodyBocHex,
      messageId: binding.messageId,
      statementHash: binding.statementHash,
      destinationBindingHash: binding.destinationBindingHash,
    });
    markPhase(
      2,
      "complete",
      `TON compact proof commitment built for ${compactPlan.totalBytes} proof bytes`,
    );
    beginProofTiming(
      "ton-proof-upload",
      "TON proof upload",
      "Compact verifier protocol skips chunk upload",
      {
        protocolVersion: verifierProtocolVersion,
        originalPayloadBytes: compactPlan.totalBytes,
        compactPayloadBytes: compactPlan.payloadBocBytes.length,
        bodyHash: compactPlan.bodyHash,
        proofDigest: compactPlan.proofDigest,
      },
    );
    finishProofTiming(
      "ton-proof-upload",
      "skipped",
      "Compact verifier protocol sent a single proof commitment",
      {
        protocolVersion: verifierProtocolVersion,
        originalPayloadBytes: compactPlan.totalBytes,
        compactPayloadBytes: compactPlan.payloadBocBytes.length,
      },
    );
    beginProofTiming(
      "ton-finalize",
      "TON finalization",
      "Submitting compact verifier finalization transaction",
      {
        protocolVersion: verifierProtocolVersion,
        originalPayloadBytes: compactPlan.totalBytes,
        compactPayloadBytes: compactPlan.payloadBocBytes.length,
      },
    );
    markPhase(
      3,
      "active",
      "Requesting TON wallet approval for compact finalization",
    );
    assertSccpOperationContextCurrent(context);
    const sendResult = await ton.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      network: CHAIN.TESTNET,
      from: context.tonAddress,
      messages: [
        {
          address: verifierWalletAddress,
          amount: messageValueNano,
          payload: sccpBytesToBase64(compactPlan.payloadBocBytes),
        },
      ],
    });
    assertSccpOperationContextCurrent(context);
    const signedBoc = readTonWalletSignedBoc(sendResult);
    proofReady.value = true;
    markPhase(
      3,
      "complete",
      signedBoc
        ? "TON wallet returned a signed compact finalize transaction"
        : "TON wallet accepted the compact finalize transaction request",
    );
    finishProofTiming(
      "ton-finalize",
      "complete",
      signedBoc
        ? "TON wallet returned signed compact finalization"
        : "TON wallet accepted compact finalization",
      {
        protocolVersion: verifierProtocolVersion,
        bodyHash: compactPlan.bodyHash,
      },
    );
    return;
  }
  const chunkPlan = buildSccpTonChunkedMessageBodyBocsFromBytes({
    messageBodyBocHex: binding.messageBodyBocHex,
    messageId: binding.messageId,
    statementHash: binding.statementHash,
    destinationBindingHash: binding.destinationBindingHash,
    chunkSize: SCCP_TON_CHUNK_SIZE_BYTES,
  });
  markPhase(
    2,
    "complete",
    `TON proof payload split into ${chunkPlan.chunkCount} bounded chunks`,
  );
  const uploadMessages = chunkPlan.uploadMessages.map((upload) => ({
    chunkIndex: upload.index,
    message: {
      address: verifierWalletAddress,
      amount: SCCP_TON_CHUNK_UPLOAD_MESSAGE_VALUE_NANO,
      payload: sccpBytesToBase64(upload.payloadBocBytes),
    },
    payloadSizeBytes: upload.payloadBocBytes.length,
  }));
  const walletMaxMessages = await ton.resolveMaxMessages();
  const uploadBatchSize = Math.max(
    1,
    Math.min(
      walletMaxMessages,
      SCCP_TON_UPLOAD_APPROVAL_MAX_MESSAGES,
      uploadMessages.length,
    ),
  );
  const uploadBatches = chunkSccpTonUploadMessages(
    uploadMessages,
    uploadBatchSize,
    SCCP_TON_UPLOAD_APPROVAL_MAX_PAYLOAD_BYTES,
  );
  beginProofTiming(
    "ton-proof-upload",
    "TON proof upload",
    "Uploading proof chunks to the TON verifier",
    {
      protocolVersion: verifierProtocolVersion,
      chunkCount: chunkPlan.chunkCount,
      batchCount: uploadBatches.length,
      uploadBatchSize,
      maxPayloadBytes: SCCP_TON_UPLOAD_APPROVAL_MAX_PAYLOAD_BYTES,
    },
  );
  markPhase(
    3,
    "active",
    `Requesting TON wallet approval for ${uploadBatches.length} proof chunk batch(es)`,
  );
  for (let batchIndex = 0; batchIndex < uploadBatches.length; batchIndex += 1) {
    const batch = uploadBatches[batchIndex] ?? [];
    const firstChunk = (batch[0]?.chunkIndex ?? 0) + 1;
    const lastChunk = (batch.at(-1)?.chunkIndex ?? firstChunk - 1) + 1;
    const batchMessages = batch.map((entry) => entry.message);
    markPhase(
      3,
      "active",
      `Requesting TON wallet approval for proof chunks ${firstChunk}-${lastChunk}/${chunkPlan.chunkCount}`,
    );
    assertSccpOperationContextCurrent(context);
    await ton.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      network: CHAIN.TESTNET,
      from: context.tonAddress,
      messages: batchMessages,
    });
    assertSccpOperationContextCurrent(context);
    markPhase(
      3,
      "active",
      `TON proof chunks ${firstChunk}-${lastChunk}/${chunkPlan.chunkCount} accepted by wallet`,
    );
  }
  finishProofTiming(
    "ton-proof-upload",
    "complete",
    "TON verifier accepted proof chunks",
    {
      protocolVersion: verifierProtocolVersion,
      chunkCount: chunkPlan.chunkCount,
      batchCount: uploadBatches.length,
    },
  );
  beginProofTiming(
    "ton-finalize",
    "TON finalization",
    "Submitting verifier finalization transaction",
    {
      protocolVersion: verifierProtocolVersion,
      chunkCount: chunkPlan.chunkCount,
    },
  );
  markPhase(3, "active", "Requesting TON wallet approval for finalization");
  const sendResult = await ton.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 600,
    network: CHAIN.TESTNET,
    from: context.tonAddress,
    messages: [
      {
        address: verifierWalletAddress,
        amount: messageValueNano,
        payload: sccpBytesToBase64(chunkPlan.finalizeMessage.payloadBocBytes),
      },
    ],
  });
  assertSccpOperationContextCurrent(context);
  const signedBoc = readTonWalletSignedBoc(sendResult);
  proofReady.value = true;
  markPhase(
    3,
    "complete",
    signedBoc
      ? "TON wallet returned a signed chunked finalize transaction"
      : "TON wallet accepted the chunked finalize transaction request",
  );
  finishProofTiming(
    "ton-finalize",
    "complete",
    signedBoc
      ? "TON wallet returned signed finalization"
      : "TON wallet accepted finalization",
  );
};

const finalizeTonBurnToTaira = async (
  context: SccpOperationContext,
  input: { sourceRecord?: ReturnType<typeof buildTonToTairaSourceRecord> } = {},
) => {
  if (tonReturnBlocker.value) {
    throw new Error(t(tonReturnBlocker.value));
  }
  markPhase(1, "active", "Collecting TON source transaction data");
  const txId = normalizeTonTransactionHash(context.tonTxId ?? tronTxId.value);
  markPhase(1, "complete", "TON source transaction hash accepted");
  markPhase(2, "active", "Generating TON source proof package");
  assertSccpOperationContextCurrent(context);
  beginProofTiming(
    "ton-source-proof-package",
    "TON source proof package",
    "Building deployment-bound TON source proof package",
    {
      txId,
      moduleUrl: tonSourceProverModuleUrl.value,
    },
  );
  let proofPackage: TonToTairaSourceProofPackage;
  try {
    proofPackage = await runTonSourceProofWorker({
      manifest: context.manifest,
      proverModuleUrl: tonSourceProverModuleUrl.value,
      txId,
      transaction: {
        hash: txId,
        ...(input.sourceRecord
          ? {
              amountBaseUnits: input.sourceRecord.amountBaseUnits,
              commitmentRoot: input.sourceRecord.commitmentRoot,
              messageId: input.sourceRecord.messageId,
              nonce: input.sourceRecord.nonce,
              payloadHash: input.sourceRecord.payloadHash,
            }
          : {}),
      },
      receipt: null,
      finality: null,
      proofMaterial: null,
      tonSender: context.tonAddress,
      tairaRecipient: context.tairaRecipient,
      amountDecimal: context.amountDecimal,
    });
    finishProofTiming(
      "ton-source-proof-package",
      "complete",
      "TON source proof package is bound",
      { txId },
    );
  } catch (error) {
    finishProofTiming(
      "ton-source-proof-package",
      "failed",
      error instanceof Error ? error.message : String(error),
      { txId },
    );
    throw error;
  }
  assertSccpOperationContextCurrent(context);
  const boundProofPackage = bindTonToTairaSourceProofPackage({
    manifest: context.manifest,
    proofPackage,
    txId,
    tonSender: context.tonAddress,
    tairaRecipient: context.tairaRecipient,
    amountDecimal: context.amountDecimal,
  });
  messageId.value = boundProofPackage.messageId;
  markPhase(2, "complete", "TON source proof package is ready");
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
  markPhase(3, "active", "Waiting for TAIRA settlement confirmation");
  await waitForSccpTransactionCommit({
    toriiUrl: context.toriiUrl,
    hashHex: normalizedTairaTxHash,
  });
  assertSccpOperationContextCurrent(context);
  proofReady.value = true;
  markPhase(3, "complete", "TAIRA settlement confirmed");
  if (tairaTxHref) {
    transactionLinks.value = [
      ...transactionLinks.value.filter((link) => link.href !== tairaTxHref),
      {
        label: t("TAIRA settlement transaction"),
        href: tairaTxHref,
      },
    ];
  }
};

const ensureTonSourceProverAvailable = async () => {
  const moduleUrl = tonSourceProverModuleUrl.value;
  if (!moduleUrl) {
    throw new Error(
      t(
        "TON -> TAIRA needs a browser-safe TON source proof module before any TON source transaction is broadcast.",
      ),
    );
  }
  beginProofTiming(
    "ton-source-prover-prewarm",
    "TON source prover prewarm",
    "Loading TON source proof module in the worker",
    {
      moduleUrl,
    },
  );
  try {
    await prewarmTonSourceProver(moduleUrl);
    finishProofTiming(
      "ton-source-prover-prewarm",
      "complete",
      "TON source proof module is ready in the worker",
      { moduleUrl },
    );
  } catch (error) {
    finishProofTiming(
      "ton-source-prover-prewarm",
      "failed",
      error instanceof Error ? error.message : String(error),
      { moduleUrl },
    );
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `TON -> TAIRA source proof module is not available: ${detail}`,
    );
  }
};

const submitTonBurnToTaira = async (context: SccpOperationContext) => {
  if (tonReturnBlocker.value) {
    throw new Error(t(tonReturnBlocker.value));
  }
  markPhase(2, "active", "Checking TON source proof module");
  await ensureTonSourceProverAvailable();
  assertSccpOperationContextCurrent(context);
  markPhase(2, "complete", "TON source proof module is available");
  markPhase(1, "active", "Creating TON source transaction");
  const sourceBridgeRawAddress = readSccpTonSourceBridgeAddress(
    context.manifest,
  );
  const sourceBridgeWalletAddress = toUserFriendlyAddress(
    normalizeTonRawAddress(sourceBridgeRawAddress, "TON source bridge address"),
    true,
  );
  const sourceRecord = buildTonToTairaSourceRecord(context);
  messageId.value = sourceRecord.messageId;
  markPhase(1, "complete", "TON source transaction request created");
  markPhase(
    2,
    "complete",
    "TON source proof data collection can begin after broadcast",
  );
  markPhase(3, "active", "Requesting TON wallet approval");
  assertSccpOperationContextCurrent(context);
  const sendResult = await ton.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 600,
    network: CHAIN.TESTNET,
    from: context.tonAddress,
    messages: [
      {
        address: sourceBridgeWalletAddress,
        amount: SCCP_TON_SOURCE_MESSAGE_VALUE_NANO,
        payload: sccpBytesToBase64(sourceRecord.payloadBocBytes),
      },
    ],
  });
  assertSccpOperationContextCurrent(context);
  const txId = readTonWalletTransactionHash(sendResult, tronTxId.value);
  const sourceBridgeLink = {
    label: t("TON source bridge"),
    href: `${SCCP_TON_NETWORK.explorerUrl}/address/${sourceBridgeWalletAddress}`,
  };
  transactionLinks.value = [
    {
      label: t("TON source transaction"),
      href: `${SCCP_TON_NETWORK.explorerUrl}/tx/${txId}`,
    },
    ...transactionLinks.value.filter(
      (link) => link.href !== sourceBridgeLink.href,
    ),
    sourceBridgeLink,
  ];
  tronTxId.value = txId;
  markPhase(3, "complete", "TON source transaction broadcast");
  await finalizeTonBurnToTaira(
    {
      ...context,
      tonTxId: txId,
    },
    { sourceRecord },
  );
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
  markPhase(3, "active", "Waiting for TAIRA settlement confirmation");
  await waitForSccpTransactionCommit({
    toriiUrl: context.toriiUrl,
    hashHex: normalizedTairaTxHash,
  });
  assertSccpOperationContextCurrent(context);
  proofReady.value = true;
  markPhase(3, "complete", "TAIRA settlement confirmed");
  if (tairaTxHref) {
    transactionLinks.value = [
      ...transactionLinks.value.filter((link) => link.href !== tairaTxHref),
      {
        label: t("TAIRA settlement transaction"),
        href: tairaTxHref,
      },
    ];
  }
};

const readBscBlockTransactionHashes = (
  block: Record<string, unknown>,
  label: string,
): string[] => {
  if (!Array.isArray(block.transactions)) {
    throw new Error(`${label} must include a transactions array.`);
  }
  return block.transactions.map((entry, index) => {
    if (typeof entry === "string") {
      return normalizeBscTransactionHash(entry);
    }
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      return normalizeBscTransactionHash(
        String(
          (entry as Record<string, unknown>).hash ??
            (entry as Record<string, unknown>).transactionHash ??
            (entry as Record<string, unknown>).transaction_hash ??
            "",
        ),
      );
    }
    throw new Error(`${label} transaction ${index} must be a hash or object.`);
  });
};

const loadBscBlockReceiptsForProof = async (input: {
  endpoint: string;
  block: Record<string, unknown>;
  blockNumber: string;
  txHash: string;
  knownReceipt: Record<string, unknown>;
}): Promise<Record<string, unknown>[]> => {
  try {
    const result = await callEvmRpc({
      endpoint: input.endpoint,
      method: "eth_getBlockReceipts",
      params: [input.blockNumber],
    });
    if (Array.isArray(result) && result.length > 0) {
      return result.map((entry, index) =>
        asRecord(entry, `BSC block receipt ${index}`),
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !/method not found|does not exist|unsupported|not supported|the method .* does not exist/iu.test(
        message,
      )
    ) {
      throw error;
    }
  }

  const transactionHashes = readBscBlockTransactionHashes(
    input.block,
    "BSC source block",
  );
  const receipts: Record<string, unknown>[] = [];
  const batchSize = 12;
  for (let offset = 0; offset < transactionHashes.length; offset += batchSize) {
    const batch = transactionHashes.slice(offset, offset + batchSize);
    const batchReceipts = await Promise.all(
      batch.map(async (txHash) => {
        if (txHash === input.txHash) {
          return input.knownReceipt;
        }
        const receipt = await getEvmTransactionReceipt({
          endpoint: input.endpoint,
          txHash,
        });
        if (!receipt) {
          throw new Error(`BSC block receipt ${txHash} is not indexed yet.`);
        }
        return receipt;
      }),
    );
    receipts.push(...batchReceipts);
  }
  return receipts;
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
  const finalityHeight = normalizeEvmQuantityToUnsignedDecimal(
    sourceData.receiptBlockNumber,
    "BSC source proof finality height",
  );
  const proofPackage = await runBscSourceProofWorker({
    manifest: context.manifest,
    bscNetwork: SCCP_BSC_NETWORK.key,
    ...sourceMaterialBinding,
    proverModuleUrl: readSccpBscSourceProverModuleUrl(context.manifest),
    proverConfigUrl: readSccpBscRuntimeProverConfigUrl(context.manifest),
    bscRpcUrl:
      readSccpBscRpcEndpoint(context.manifest, SCCP_BSC_NETWORK.key) ||
      SCCP_BSC_NETWORK.rpcUrl,
    sourceBridgeAddress: readSccpBscSourceBridgeAddress(context.manifest),
    txId: sourceData.txId,
    transaction: sourceData.transaction,
    receipt: sourceData.proofReceipt,
    blockReceipts: sourceData.blockReceipts ?? undefined,
    block: sourceData.block,
    finalityHeight,
    finality_height: finalityHeight,
    finalityBlockHash: sourceData.receiptBlockHash,
    finality_block_hash: sourceData.receiptBlockHash,
    bscSender: context.bscAddress,
    tairaRecipient: context.tairaRecipient,
    amountDecimal: context.amountDecimal,
    amountBaseUnits: bridgeDecimalToTairaBaseUnits(context.amountDecimal),
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
  markPhase(3, "active", "Waiting for TAIRA settlement confirmation");
  await waitForSccpTransactionCommit({
    toriiUrl: context.toriiUrl,
    hashHex: normalizedTairaTxHash,
  });
  assertSccpOperationContextCurrent(context);
  proofReady.value = true;
  markPhase(3, "complete", "TAIRA settlement confirmed");
  if (tairaTxHref) {
    transactionLinks.value = [
      ...transactionLinks.value.filter((link) => link.href !== tairaTxHref),
      {
        label: t("TAIRA settlement transaction"),
        href: tairaTxHref,
      },
    ];
  }
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
      direction.value === "taira-to-bsc" ||
      direction.value === "taira-to-ton" ||
      direction.value === "taira-to-solana"
    ) {
      const nonce = Date.now().toString();
      if (direction.value === "taira-to-solana") {
        await submitTairaToSolana(operationContext);
        return;
      }
      const request =
        direction.value === "taira-to-ton"
          ? buildTairaXorTonOutboundBurnRecordRequest({
              manifest: operationContext.manifest,
              tairaSender: operationContext.accountId,
              tonRecipient: operationContext.tonRecipient,
              amountDecimal: operationContext.amountDecimal,
              nonce,
            })
          : direction.value === "taira-to-bsc"
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
      const proveJob = await queueZkIvmProveJob(tairaSourceContext, {
        toriiUrl: operationContext.toriiUrl,
        ...request.zkIvmRequest.request,
      });
      assertSccpOperationContextCurrent(tairaSourceContext);
      markPhase(1, "complete", "TAIRA burn-record proof request queued");
      const jobId = readJobId(proveJob);
      markPhase(2, "active", "Generating TAIRA burn-record proof");
      beginProofTiming(
        "taira-zk-proof-generation",
        "TAIRA proof generation",
        "Waiting for burn-record proof",
        {
          jobId,
        },
      );
      const proof = await waitForZkIvmProof(tairaSourceContext, jobId);
      finishProofTiming(
        "taira-zk-proof-generation",
        "complete",
        "Burn-record proof ready",
        {
          jobId,
        },
      );
      assertSccpOperationContextCurrent(tairaSourceContext);
      markPhase(2, "complete", "TAIRA burn-record proof is ready");
      markPhase(3, "active", "Submitting TAIRA source transaction");
      beginProofTiming(
        "taira-source-submit",
        "TAIRA source submission",
        "Submitting proved burn-record transaction",
      );
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
        waitForCommit: false,
      });
      assertSccpOperationContextCurrent(tairaSourceContext);
      const tairaTxHash = String(
        submission.tx_hash_hex ?? submission.txHashHex ?? submission.hash ?? "",
      ).trim();
      finishProofTiming(
        "taira-source-submit",
        "complete",
        "TAIRA source transaction accepted",
        {
          txHash: tairaTxHash,
        },
      );
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
      } else if (direction.value === "taira-to-ton") {
        await finalizeTairaMessageToTon(tairaSourceContext, {
          pollForIndexing: true,
        });
      } else {
        await finalizeTairaMessageToTron(tairaSourceContext, {
          pollForIndexing: true,
        });
      }
      return;
    }

    if (direction.value === "ton-to-taira") {
      await submitTonBurnToTaira(operationContext);
      return;
    }

    if (direction.value === "solana-to-taira") {
      await submitSolanaBurnToTaira(operationContext);
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
    failActiveProofTimings(error);
    formError.value = error instanceof Error ? error.message : String(error);
  } finally {
    proofLoading.value = false;
  }
};

const fetchMessageJob = async () => {
  proofLoading.value = true;
  formError.value = "";
  resetProofPhases();
  try {
    validateForm();
    if (
      direction.value === "taira-to-tron" ||
      direction.value === "taira-to-bsc" ||
      direction.value === "taira-to-ton" ||
      direction.value === "taira-to-solana"
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
          isTonRoute.value
            ? t("Enter a TON transaction hash before fetching proof data.")
            : isBscRoute.value
              ? t("Enter a BSC transaction hash before fetching proof data.")
              : isSolanaRoute.value
                ? t(
                    "Enter a Solana transaction signature before fetching proof data.",
                  )
                : t("Enter a TRON transaction ID before fetching proof data."),
        );
      }
      tronTxId.value =
        direction.value === "ton-to-taira"
          ? normalizeTonTransactionHash(tronTxId.value)
          : direction.value === "bsc-to-taira"
            ? normalizeBscTransactionHash(tronTxId.value)
            : direction.value === "solana-to-taira"
              ? normalizeSolanaTransactionSignature(tronTxId.value)
              : normalizeTronTransactionId(tronTxId.value);
    }
    const operationContext = createSccpOperationContext({
      ...(direction.value === "taira-to-tron" ||
      direction.value === "taira-to-bsc" ||
      direction.value === "taira-to-ton" ||
      direction.value === "taira-to-solana"
        ? { messageId: messageId.value }
        : direction.value === "bsc-to-taira"
          ? { bscTxId: tronTxId.value }
          : direction.value === "ton-to-taira"
            ? { tonTxId: tronTxId.value }
            : direction.value === "solana-to-taira"
              ? { solanaTxId: tronTxId.value }
              : { tronTxId: tronTxId.value }),
    });
    if (direction.value === "solana-to-taira") {
      markPhase(0, "complete", "Route and Solana signature accepted");
      await finalizeSolanaBurnToTaira(operationContext, {
        pollForFinality: true,
      });
      return;
    }

    if (direction.value === "ton-to-taira") {
      markPhase(0, "complete", "Route and TON transaction hash accepted");
      await finalizeTonBurnToTaira(operationContext);
      return;
    }

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

    if (direction.value === "taira-to-ton") {
      await finalizeTairaMessageToTon(operationContext);
      return;
    }

    if (direction.value === "taira-to-solana") {
      await finalizeTairaMessageToSolana(operationContext);
      return;
    }

    await finalizeTairaMessageToTron(operationContext);
  } catch (error) {
    failActiveProofTimings(error);
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

watch(
  () => [isTonRoute.value, direction.value, tonSourceProverModuleUrl.value],
  ([tonSelected, selectedDirection, moduleUrl]) => {
    if (
      tonSelected &&
      selectedDirection === "ton-to-taira" &&
      typeof moduleUrl === "string" &&
      moduleUrl.trim()
    ) {
      void prewarmTonSourceProver(moduleUrl).catch(() => {
        // The submit path reports the concrete load error and remains fail-closed.
      });
    }
  },
  { immediate: true },
);

watch(proofLoading, (loading) => {
  if (loading) {
    startProofTimingTicker();
  } else {
    stopProofTimingTicker();
  }
});

watch(proofTimingSnapshot, exposeProofTimingsForAutomation, { deep: true });

onUnmounted(() => {
  stopProofTimingTicker();
  closeTonSourceProofWorker();
});
</script>
