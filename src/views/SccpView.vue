<template>
  <div class="sccp-shell">
    <section class="card sccp-command-card">
      <header class="card-header sccp-command-header">
        <div>
          <h2>{{ t("SCCP Bridge") }}</h2>
          <p class="helper">
            {{ t("Bridge XOR between TAIRA and TRON mainnet.") }}
          </p>
        </div>
        <div class="sccp-command-actions">
          <button
            type="button"
            class="secondary"
            :disabled="bridge.loading.value"
            @click="refreshAll"
          >
            {{ bridge.loading.value ? t("Refreshing") : t("Refresh route") }}
          </button>
          <button
            v-if="tron.connected.value"
            type="button"
            class="secondary"
            :disabled="tron.disconnecting.value"
            @click="tron.disconnect"
          >
            {{
              tron.disconnecting.value
                ? t("Disconnecting")
                : t("Disconnect TRON")
            }}
          </button>
          <button
            v-else
            type="button"
            :disabled="tronConnectDisabled"
            @click="connectTron"
          >
            {{
              tron.connecting.value ? t("Connecting") : t("Connect TRON wallet")
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
          <span class="kv-label">{{ t("TRON wallet") }}</span>
          <span class="kv-value mono">{{
            tron.shortAddress.value || t("Not connected")
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
      </div>

      <div class="sccp-route-strip">
        <span class="pill" :class="routeTone">{{ routeStatusLabel }}</span>
        <span class="pill" :class="{ positive: tron.projectConfigured.value }">
          {{
            tron.projectConfigured.value
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
      <p v-if="tron.error.value" class="helper error-text">
        {{ tron.error.value }}
      </p>
      <p v-if="bridge.error.value" class="helper error-text">
        {{ bridge.error.value }}
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
          :class="{ active: direction === 'taira-to-tron' }"
          @click="direction = 'taira-to-tron'"
        >
          {{ t("TAIRA -> TRON") }}
        </button>
        <button
          type="button"
          :class="{ active: direction === 'tron-to-taira' }"
          @click="direction = 'tron-to-taira'"
        >
          {{ t("TRON -> TAIRA") }}
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
        <label v-if="direction === 'taira-to-tron'">
          <span>{{ t("TRON recipient") }}</span>
          <input
            v-model.trim="tronRecipient"
            type="text"
            autocomplete="off"
            :placeholder="t('TRON Base58Check address')"
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
        <label v-if="direction === 'tron-to-taira'">
          <span>{{ t("TRON transaction ID") }}</span>
          <input
            v-model.trim="tronTxId"
            type="text"
            autocomplete="off"
            :placeholder="t('Optional TRON burn transaction id')"
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
import { useTronWalletConnect } from "@/composables/useTronWalletConnect";
import { TAIRA_EXPLORER_URL } from "@/constants/chains";
import {
  broadcastTronTransaction,
  deriveZkIvmPayload,
  getSccpMessageProofJob,
  getTronFinalityData,
  getTronTransaction,
  getTronTransactionEvents,
  getTronTransactionReceipt,
  getZkIvmProveJob,
  startZkIvmProveJob,
  submitSccpBridgeMessage,
  submitZkIvmProvedTransaction,
  triggerTronSmartContract,
} from "@/services/iroha";
import { formatAssetDefinitionLabel } from "@/utils/assetId";
import { getAccountDisplayLabel } from "@/utils/accountId";
import {
  isLikelyTairaAccount,
  isTairaSccpNetwork,
  isValidTronBase58CheckAddress,
  buildTairaXorBurnTriggerRequest,
  buildTairaXorOutboundBurnRecordRequest,
  buildTairaXorFinalizeProofBinding,
  buildTairaXorFinalizeTriggerRequest,
  normalizeBridgeAmount,
  normalizeSccpMessageId,
  normalizeTronTransactionId,
  readSccpTronProofMaterial,
  TRON_MAINNET_TRONSCAN_URL,
  SCCP_XOR_ASSET_KEY,
  type SccpBridgeDirection,
  type TronToTairaSourceProofPackage,
  type TronToTairaSourceProofPackageInput,
} from "@/utils/sccp";
import type {
  TronSccpProofPackage,
  TronSccpProofPackageInput,
} from "@/utils/sccpProofPackage";

const session = useSessionStore();
const { t, n } = useAppI18n();
const bridge = useSccpBridge();
const tron = useTronWalletConnect();

const direction = ref<SccpBridgeDirection>("taira-to-tron");
const amount = ref("");
const tronRecipient = ref("");
const tairaRecipient = ref(session.activeAccount?.accountId ?? "");
const messageId = ref("");
const tronTxId = ref("");
const formError = ref("");
const proofLoading = ref(false);
const proofReady = ref(false);
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

const isTairaRoute = computed(() => isTairaSccpNetwork(session.connection));
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
    : isLikelyTairaAccount(tairaRecipient.value),
);
const submitDisabled = computed(
  () =>
    !bridge.readiness.value.ready ||
    !tron.connected.value ||
    !amountValid.value ||
    !destinationValid.value ||
    proofLoading.value,
);
const tronConnectDisabled = computed(
  () =>
    !isTairaRoute.value ||
    !tron.projectConfigured.value ||
    tron.connecting.value,
);
const proofFetchDisabled = computed(
  () =>
    (direction.value === "taira-to-tron"
      ? !messageId.value
      : !tronTxId.value) ||
    !bridge.readiness.value.ready ||
    !tron.connected.value ||
    !amountValid.value ||
    !destinationValid.value ||
    proofLoading.value,
);
const primaryActionLabel = computed(() =>
  direction.value === "taira-to-tron"
    ? "Prepare TAIRA -> TRON"
    : "Prepare TRON -> TAIRA",
);
const actionHint = computed(() => {
  if (!isTairaRoute.value) {
    return t("Switch to the TAIRA testnet profile to use this bridge.");
  }
  if (!tron.projectConfigured.value) {
    return t(
      "WalletConnect project ID is missing, so TRON wallet connection is disabled.",
    );
  }
  if (!tron.connected.value) {
    return t("Connect a TRON wallet to continue.");
  }
  if (!bridge.readiness.value.ready) {
    return t("Route readiness must be true before bridge actions are enabled.");
  }
  return t(
    "Bridge actions will request explicit wallet approval before signing.",
  );
});

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

const runTronProofWorker = (
  kind: "build-tron-proof-package" | "prove-tron-proof-package",
  input: TronSccpProofPackageInput,
): Promise<TronSccpProofPackage> => {
  if (typeof Worker === "undefined") {
    throw new Error("Browser proof worker is unavailable in this environment.");
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/sccpProver.worker.ts", import.meta.url),
      { type: "module" },
    );
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const cleanup = () => {
      worker.terminate();
    };
    worker.onmessage = (
      event: MessageEvent<{
        id: string;
        ok: boolean;
        result?: TronSccpProofPackage;
        error?: string;
      }>,
    ) => {
      if (event.data.id !== id) {
        return;
      }
      cleanup();
      if (event.data.ok && event.data.result) {
        resolve(event.data.result);
        return;
      }
      reject(new Error(event.data.error || "SCCP proof worker failed."));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "SCCP proof worker failed."));
    };
    worker.postMessage({ id, kind, input });
  });
};

const runTronSourceProofWorker = (
  input: TronToTairaSourceProofPackageInput,
): Promise<TronToTairaSourceProofPackage> => {
  if (typeof Worker === "undefined") {
    throw new Error("Browser proof worker is unavailable in this environment.");
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/sccpProver.worker.ts", import.meta.url),
      { type: "module" },
    );
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const cleanup = () => {
      worker.terminate();
    };
    worker.onmessage = (
      event: MessageEvent<{
        id: string;
        ok: boolean;
        result?: TronToTairaSourceProofPackage;
        error?: string;
      }>,
    ) => {
      if (event.data.id !== id) {
        return;
      }
      cleanup();
      if (event.data.ok && event.data.result) {
        resolve(event.data.result);
        return;
      }
      reject(new Error(event.data.error || "SCCP proof worker failed."));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "SCCP proof worker failed."));
    };
    worker.postMessage({ id, kind: "prove-tron-source-package", input });
  });
};

const sccpDestinationProofParams = (): Record<string, string> => {
  const material = readSccpTronProofMaterial(
    bridge.readiness.value.tronManifest,
  );
  if (!material) {
    return {};
  }
  return {
    networkIdHex: material.networkIdHex,
    verifierCodeHashHex: material.verifierCodeHashHex,
    verifierKeyHashHex: material.verifierKeyHashHex,
    expectedDestinationBindingHashHex:
      material.expectedDestinationBindingHashHex,
    tronVerifierAddress: material.tronVerifierAddress,
  };
};

const waitForZkIvmProof = async (
  jobId: string,
): Promise<{
  proved: Record<string, unknown>;
  attachment: Record<string, unknown>;
}> => {
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const job = await getZkIvmProveJob({
      toriiUrl: session.connection.toriiUrl,
      jobId,
    });
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

const refreshAll = async () => {
  if (!isTairaRoute.value) {
    return;
  }
  await Promise.all([bridge.refreshRoute(), bridge.refreshBalances()]);
};

const connectTron = async () => {
  if (!isTairaRoute.value) {
    formError.value = t("SCCP bridging is enabled only on TAIRA testnet.");
    return;
  }
  await tron.connect();
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
  if (!tron.connected.value) {
    throw new Error(t("Connect a TRON wallet to continue."));
  }
  try {
    normalizeBridgeAmount(amount.value);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
  if (!destinationValid.value) {
    throw new Error(
      direction.value === "taira-to-tron"
        ? t("Enter a valid TRON Base58Check recipient.")
        : t("Enter a TAIRA testnet account."),
    );
  }
};

const prepareBridge = async () => {
  formError.value = "";
  resetProofPhases();
  proofLoading.value = true;
  try {
    validateForm();
    markPhase(0, "complete", "Route and wallet are ready");
    if (direction.value === "taira-to-tron") {
      const request = buildTairaXorOutboundBurnRecordRequest({
        manifest: bridge.readiness.value.tronManifest,
        tairaSender: session.activeAccount?.accountId ?? "",
        tronRecipient: tronRecipient.value,
        amountDecimal: amount.value,
        nonce: Date.now().toString(),
      });
      messageId.value = request.outbound.messageId;
      markPhase(1, "active", "Deriving TAIRA burn-record payload");
      const derived = await deriveZkIvmPayload({
        toriiUrl: session.connection.toriiUrl,
        ...request.zkIvmRequest.request,
      });
      const proved = asRecord(derived.proved, "Derived ZK IVM proved payload");
      markPhase(1, "complete", "Canonical TAIRA burn-record payload derived");
      markPhase(2, "active", "Generating TAIRA burn-record proof");
      const proveJob = await startZkIvmProveJob({
        toriiUrl: session.connection.toriiUrl,
        ...request.zkIvmRequest.request,
        proved,
      });
      const jobId = readJobId(proveJob);
      const proof = await waitForZkIvmProof(jobId);
      markPhase(2, "complete", "TAIRA burn-record proof is ready");
      markPhase(3, "active", "Submitting TAIRA source transaction");
      const submission = await submitZkIvmProvedTransaction({
        toriiUrl: session.connection.toriiUrl,
        chainId: session.connection.chainId,
        accountId: session.activeAccount?.accountId ?? "",
        proved: proof.proved,
        attachment: proof.attachment,
        metadata: { ...request.zkIvmRequest.request.metadata },
      });
      const tairaTxHash = String(
        submission.tx_hash_hex ?? submission.txHashHex ?? submission.hash ?? "",
      ).trim();
      transactionLinks.value = tairaTxHash
        ? [
            {
              label: t("TAIRA source transaction"),
              href: TAIRA_EXPLORER_URL,
            },
          ]
        : [];
      markPhase(
        3,
        "complete",
        "TAIRA source transaction submitted; fetch the SCCP proof job after indexing",
      );
      proofReady.value = false;
      return;
    }

    markPhase(1, "active", "Collecting TRON finality data");
    await getTronFinalityData();
    const triggerRequest = buildTairaXorBurnTriggerRequest({
      manifest: bridge.readiness.value.tronManifest,
      ownerAddress: tron.address.value,
      tairaRecipient: tairaRecipient.value,
      amountDecimal: amount.value,
    });
    const triggerResponse = await triggerTronSmartContract(triggerRequest);
    const unsignedTransaction =
      typeof triggerResponse.transaction === "object" &&
      triggerResponse.transaction !== null &&
      !Array.isArray(triggerResponse.transaction)
        ? (triggerResponse.transaction as Record<string, unknown>)
        : null;
    if (!unsignedTransaction) {
      throw new Error("TRON gateway did not return an unsigned transaction.");
    }
    markPhase(1, "complete", "Unsigned TRON burn transaction created");
    markPhase(
      2,
      "complete",
      "TRON-source proof data collection can begin after broadcast",
    );
    markPhase(3, "active", "Requesting TRON wallet approval");
    const signedTransaction = await tron.signTransaction(unsignedTransaction);
    if (
      !signedTransaction ||
      typeof signedTransaction !== "object" ||
      Array.isArray(signedTransaction)
    ) {
      throw new Error("TRON wallet did not return a signed transaction.");
    }
    const broadcastResponse = await broadcastTronTransaction({
      transaction: signedTransaction as Record<string, unknown>,
    });
    const nextTxId =
      String(broadcastResponse.txid ?? broadcastResponse.txID ?? "").trim() ||
      String(
        (signedTransaction as Record<string, unknown>).txID ??
          (signedTransaction as Record<string, unknown>).txid ??
          "",
      ).trim();
    if (nextTxId) {
      tronTxId.value = nextTxId;
      transactionLinks.value = [
        {
          label: t("TRON transaction"),
          href: `${TRON_MAINNET_TRONSCAN_URL}/#/transaction/${nextTxId}`,
        },
      ];
    }
    markPhase(3, "complete", "Signed TRON burn transaction broadcast");
    markPhase(
      2,
      "pending",
      "Waiting for TRON finality before TAIRA proof submission",
    );
    proofReady.value = false;
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
    if (direction.value === "taira-to-tron") {
      if (!messageId.value.trim()) {
        throw new Error(
          t("Enter a SCCP message ID before fetching proof data."),
        );
      }
      messageId.value = normalizeSccpMessageId(messageId.value);
    } else {
      if (!tronTxId.value.trim()) {
        throw new Error(
          t("Enter a TRON transaction ID before fetching proof data."),
        );
      }
      tronTxId.value = normalizeTronTransactionId(tronTxId.value);
    }
    if (direction.value === "tron-to-taira") {
      markPhase(0, "complete", "Route and TRON transaction id accepted");
      markPhase(1, "active", "Collecting TRON transaction and finality data");
      const [transaction, receipt, events, finality] = await Promise.all([
        getTronTransaction({ txId: tronTxId.value }),
        getTronTransactionReceipt({ txId: tronTxId.value }),
        getTronTransactionEvents({ txId: tronTxId.value }),
        getTronFinalityData(),
      ]);
      markPhase(1, "complete", "TRON source transaction data collected");
      markPhase(2, "active", "Generating TRON source proof package");
      const proofPackage = await runTronSourceProofWorker({
        manifest: bridge.readiness.value.tronManifest,
        txId: tronTxId.value,
        transaction,
        receipt,
        events,
        finality,
        tronSender: tron.address.value,
        tairaRecipient: tairaRecipient.value,
        amountDecimal: amount.value,
      });
      messageId.value = proofPackage.messageId;
      markPhase(2, "complete", "TRON source proof package is ready");
      markPhase(3, "active", "Submitting TAIRA settlement");
      const response = await submitSccpBridgeMessage({
        toriiUrl: session.connection.toriiUrl,
        accountId: session.activeAccount?.accountId ?? "",
        messageBundle: proofPackage.messageBundle,
        settlement: proofPackage.settlement,
      });
      const tairaTxHash = String(
        response.tx_hash_hex ?? response.txHashHex ?? response.hash ?? "",
      ).trim();
      if (tairaTxHash) {
        transactionLinks.value = [
          ...transactionLinks.value,
          {
            label: t("TAIRA settlement transaction"),
            href: TAIRA_EXPLORER_URL,
          },
        ];
      }
      proofReady.value = true;
      markPhase(3, "complete", "TAIRA settlement submitted");
      return;
    }

    const job = await getSccpMessageProofJob({
      toriiUrl: session.connection.toriiUrl,
      messageId: messageId.value,
      ...sccpDestinationProofParams(),
    });
    markPhase(0, "complete", "Route and message id accepted");
    markPhase(1, "complete", "Torii returned an SCCP proof job");
    const binding = buildTairaXorFinalizeProofBinding({
      manifest: bridge.readiness.value.tronManifest,
      job,
      messageId: messageId.value,
      tairaSender: session.activeAccount?.accountId ?? "",
      tronRecipient: tronRecipient.value,
      amountDecimal: amount.value,
    });
    markPhase(2, "active", "Generating TRON finalize proof");
    const proofPackage = await runTronProofWorker("prove-tron-proof-package", {
      witness: binding.witness,
    });
    const finalizeRequest = buildTairaXorFinalizeTriggerRequest({
      manifest: bridge.readiness.value.tronManifest,
      proofPackage: proofPackage as unknown as Record<string, unknown>,
      ownerAddress: tron.address.value,
      tronRecipient: tronRecipient.value,
      amountBaseUnits: binding.amountBaseUnits,
      messageId: binding.messageId,
    });
    markPhase(2, "complete", "TRON finalize proof package is ready");
    markPhase(3, "active", "Requesting TRON wallet approval");
    const triggerResponse = await triggerTronSmartContract(
      finalizeRequest.trigger,
    );
    const unsignedTransaction =
      typeof triggerResponse.transaction === "object" &&
      triggerResponse.transaction !== null &&
      !Array.isArray(triggerResponse.transaction)
        ? (triggerResponse.transaction as Record<string, unknown>)
        : null;
    if (!unsignedTransaction) {
      throw new Error("TRON gateway did not return an unsigned transaction.");
    }
    const signedTransaction = await tron.signTransaction(unsignedTransaction);
    if (
      !signedTransaction ||
      typeof signedTransaction !== "object" ||
      Array.isArray(signedTransaction)
    ) {
      throw new Error("TRON wallet did not return a signed transaction.");
    }
    const broadcastResponse = await broadcastTronTransaction({
      transaction: signedTransaction as Record<string, unknown>,
    });
    const txId =
      String(broadcastResponse.txid ?? broadcastResponse.txID ?? "").trim() ||
      String(
        (signedTransaction as Record<string, unknown>).txID ??
          (signedTransaction as Record<string, unknown>).txid ??
          "",
      ).trim();
    if (txId) {
      transactionLinks.value = [
        {
          label: t("TRON finalize transaction"),
          href: `${TRON_MAINNET_TRONSCAN_URL}/#/transaction/${txId}`,
        },
      ];
    }
    proofReady.value = true;
    markPhase(3, "complete", "Signed TRON finalize transaction broadcast");
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
  () => [session.connection.chainId, session.connection.networkPrefix] as const,
  () => {
    resetProofPhases();
    void refreshAll();
  },
);
</script>
