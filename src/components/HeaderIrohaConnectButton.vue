<template>
  <details
    v-if="session.hasAccount"
    ref="panelRef"
    class="header-connect"
    @toggle="handlePanelToggle"
  >
    <summary
      class="header-action header-connect-trigger"
      data-testid="header-irohaconnect-button"
    >
      <span class="header-connect-qr-icon" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </span>
      <span>{{ t("IrohaConnect") }}</span>
    </summary>
    <div class="header-connect-menu">
      <div class="header-connect-heading">
        <p class="header-connect-title">{{ t("IrohaConnect Pairing") }}</p>
        <p class="helper">
          {{
            t(
              "Scan a visible IrohaConnect QR from another app window, or upload a saved QR image.",
            )
          }}
        </p>
      </div>

      <div class="header-connect-actions">
        <button
          type="button"
          class="header-connect-button"
          :disabled="connectBusy"
          @click="scanScreenQr"
        >
          <span
            class="header-connect-button-icon screen-icon"
            aria-hidden="true"
          ></span>
          <span>{{
            screenScanning ? t("Scanning screen...") : t("Scan screen QR")
          }}</span>
        </button>
        <button
          type="button"
          class="header-connect-button secondary"
          :disabled="connectBusy"
          @click="connectScanner.openFilePicker"
        >
          <span
            class="header-connect-button-icon upload-icon"
            aria-hidden="true"
          ></span>
          <span>{{ t("Upload QR image") }}</span>
        </button>
        <input
          ref="connectScanner.fileInputRef"
          type="file"
          accept="image/*"
          class="sr-only"
          @change="connectScanner.decodeFile"
        />
      </div>

      <div v-if="scannedConnectSession" class="header-connect-session">
        <div class="kv">
          <span class="kv-label">{{ t("Approval") }}</span>
          <span class="kv-value">
            {{
              connectApprovalLoading
                ? t("Approving...")
                : connectApprovalStatus || t("Ready")
            }}
          </span>
        </div>
        <div class="kv monospace">
          <span class="kv-label">{{ t("Session ID") }}</span>
          <span class="kv-value">{{ scannedConnectSession.sid }}</span>
        </div>
        <div v-if="scannedConnectSession.chainId" class="kv monospace">
          <span class="kv-label">{{ t("Chain ID") }}</span>
          <span class="kv-value">{{ scannedConnectSession.chainId }}</span>
        </div>
        <div v-if="scannedConnectSession.node" class="kv monospace">
          <span class="kv-label">{{ t("Endpoint") }}</span>
          <span class="kv-value">{{ scannedConnectSession.node }}</span>
        </div>
      </div>

      <p
        v-if="connectStatusMessage"
        class="helper header-connect-message"
        :class="{ error: connectScanError }"
      >
        {{ connectStatusMessage }}
      </p>
    </div>
  </details>

  <div v-if="pendingConnectSession" class="header-connect-modal-backdrop">
    <section
      class="card header-connect-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="header-connect-approval-title"
    >
      <p class="header-connect-modal-label">
        {{ t("IrohaConnect connection") }}
      </p>
      <h2 id="header-connect-approval-title">
        {{ t("Approve connection?") }}
      </h2>
      <p class="helper">
        {{
          t(
            "Review the requesting app details before allowing it to send wallet requests.",
          )
        }}
      </p>
      <div class="header-connect-modal-grid">
        <div
          v-for="detail in pendingConnectionDetails"
          :key="detail.label"
          class="kv"
          :class="{ monospace: detail.monospace }"
        >
          <span class="kv-label">{{ detail.label }}</span>
          <span class="kv-value">{{ detail.value }}</span>
        </div>
      </div>
      <div class="actions-row header-connect-modal-actions">
        <button
          type="button"
          class="secondary"
          :disabled="connectApprovalLoading"
          @click="rejectPendingConnection"
        >
          {{ t("Reject") }}
        </button>
        <button
          type="button"
          :disabled="connectApprovalLoading"
          @click="approvePendingConnection"
        >
          {{
            connectApprovalLoading ? t("Approving...") : t("Approve connection")
          }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="pendingConnectRequest" class="header-connect-modal-backdrop">
    <section
      class="card header-connect-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="header-connect-request-title"
    >
      <p class="header-connect-modal-label">
        {{ pendingConnectRequest.label }}
      </p>
      <h2 id="header-connect-request-title">
        {{ pendingConnectRequest.title }}
      </h2>
      <p class="helper">
        {{
          t(
            "This request will not be signed or answered unless you approve it here.",
          )
        }}
      </p>
      <div class="header-connect-modal-grid">
        <div
          v-for="detail in pendingConnectRequest.details"
          :key="detail.label"
          class="kv"
          :class="{ monospace: detail.monospace }"
        >
          <span class="kv-label">{{ detail.label }}</span>
          <span class="kv-value">{{ detail.value }}</span>
        </div>
      </div>
      <p v-if="pendingRequestError" class="helper error">
        {{ pendingRequestError }}
      </p>
      <div class="actions-row header-connect-modal-actions">
        <button
          type="button"
          class="secondary"
          :disabled="pendingRequestLoading"
          @click="rejectPendingConnectRequest"
        >
          {{ t("Reject") }}
        </button>
        <button
          type="button"
          :disabled="pendingRequestLoading"
          @click="approvePendingConnectRequest"
        >
          {{
            pendingRequestLoading
              ? t("Approving...")
              : pendingConnectRequest.approveLabel
          }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { useQrScanner } from "@/composables/useQrScanner";
import {
  buildUranaiPrivateTradeProof,
  signIrohaConnectMessage,
} from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { getPublicAccountId } from "@/utils/accountId";
import {
  buildIrohaConnectApprovalRequest,
  decodeIrohaConnectFrame,
  encodeIrohaConnectCiphertextFrame,
  parseIrohaConnectUri,
  type ParsedIrohaConnectUri,
} from "@/utils/irohaConnect";

const PRIVATE_TRADE_PROOF_SCHEMA = "uranai.irohaconnect.private-trade-proof.v1";
const CONTRACT_CALL_SIGN_SCHEMA =
  "uranai.irohaconnect.contract-call-signature.v1";
const session = useSessionStore();
const { t } = useAppI18n();
const panelRef = ref<HTMLDetailsElement | null>(null);
const scannedConnectSession = ref<ParsedIrohaConnectUri | null>(null);
const pendingConnectSession = ref<ParsedIrohaConnectUri | null>(null);
const connectScanError = ref("");
const connectApprovalLoading = ref(false);
const connectApprovalStatus = ref("");
const pendingConnectRequest = shallowRef<PendingConnectRequest | null>(null);
const pendingRequestLoading = ref(false);
const pendingRequestError = ref("");
let scannedConnectSocket: WebSocket | null = null;
let scannedConnectSequence = 2;

interface IrohaConnectDetail {
  label: string;
  value: string;
  monospace?: boolean;
}

interface UranaiPrivateTradeProofRequest {
  schema: typeof PRIVATE_TRADE_PROOF_SCHEMA;
  kind: "private_trade_proof_request";
  requestId: string;
  toriiUrl?: string;
  chainId?: string;
  accountId?: string;
  assetDefinitionId?: string;
  collateralIn?: string;
  privacyFee?: string;
  marketId?: string;
  outcomeIndex?: number;
}

interface UranaiContractCallSignRequest {
  schema: typeof CONTRACT_CALL_SIGN_SCHEMA;
  kind: "contract_call_signature_request";
  requestId: string;
  accountId?: string;
  signingMessageB64: string;
}

type PendingConnectRequest =
  | {
      kind: "privateTradeProof";
      socket: WebSocket;
      parsed: ParsedIrohaConnectUri;
      request: UranaiPrivateTradeProofRequest;
      label: string;
      title: string;
      approveLabel: string;
      details: IrohaConnectDetail[];
    }
  | {
      kind: "contractSignature";
      socket: WebSocket;
      parsed: ParsedIrohaConnectUri;
      request: UranaiContractCallSignRequest;
      label: string;
      title: string;
      approveLabel: string;
      details: IrohaConnectDetail[];
    };

const activeConnectAccountId = computed(
  () =>
    getPublicAccountId(
      session.activeAccount,
      session.connection.networkPrefix,
    ) || "",
);

const displayOptional = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return t("Not provided");
  }
  return String(value);
};

const pendingConnectionDetails = computed<IrohaConnectDetail[]>(() => {
  const parsed = pendingConnectSession.value;
  if (!parsed) {
    return [];
  }
  return [
    {
      label: t("Active account"),
      value: activeConnectAccountId.value || t("No active wallet"),
      monospace: true,
    },
    { label: t("Session ID"), value: parsed.sid, monospace: true },
    {
      label: t("Chain ID"),
      value: displayOptional(parsed.chainId),
      monospace: true,
    },
    {
      label: t("Endpoint"),
      value: parsed.node || session.connection.toriiUrl,
      monospace: true,
    },
    {
      label: t("Wallet token"),
      value: parsed.token ? t("Present") : t("Missing"),
    },
  ];
});

const decodeBase64Bytes = (value: string) => {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const bytesToHexPreview = (bytes: Uint8Array, limit = 48) => {
  const preview = Array.from(bytes.slice(0, limit), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return bytes.length > limit ? `${preview}...` : preview;
};

const decodedSigningMessagePreview = (signingMessageB64: string) => {
  try {
    const bytes = decodeBase64Bytes(signingMessageB64);
    const decodedText = new TextDecoder("utf-8", { fatal: false }).decode(
      bytes,
    );
    const printable = decodedText.replace(/[\t\n\r]/gu, "").trim();
    if (
      printable &&
      Array.from(printable).every((character) => character >= " ")
    ) {
      return {
        byteLength: bytes.length,
        preview:
          decodedText.length > 220
            ? `${decodedText.slice(0, 220)}...`
            : decodedText,
      };
    }
    return {
      byteLength: bytes.length,
      preview: `0x${bytesToHexPreview(bytes)}`,
    };
  } catch (_error) {
    return {
      byteLength: 0,
      preview: t("Unable to decode signing payload."),
    };
  }
};

const buildPrivateProofDetails = (
  parsed: ParsedIrohaConnectUri,
  request: UranaiPrivateTradeProofRequest,
): IrohaConnectDetail[] => [
  { label: t("Request ID"), value: request.requestId, monospace: true },
  {
    label: t("Requested account"),
    value: displayOptional(request.accountId),
    monospace: true,
  },
  {
    label: t("Active account"),
    value: activeConnectAccountId.value || t("No active wallet"),
    monospace: true,
  },
  {
    label: t("Session ID"),
    value: parsed.sid,
    monospace: true,
  },
  {
    label: t("Chain ID"),
    value: request.chainId || parsed.chainId || session.connection.chainId,
    monospace: true,
  },
  {
    label: t("Endpoint"),
    value: request.toriiUrl || parsed.node || session.connection.toriiUrl,
    monospace: true,
  },
  {
    label: t("Asset"),
    value: request.assetDefinitionId || "xor#universal",
    monospace: true,
  },
  { label: t("Collateral"), value: displayOptional(request.collateralIn) },
  { label: t("Privacy fee"), value: displayOptional(request.privacyFee) },
  { label: t("Market"), value: displayOptional(request.marketId) },
  { label: t("Outcome"), value: displayOptional(request.outcomeIndex) },
];

const buildContractSignDetails = (
  parsed: ParsedIrohaConnectUri,
  request: UranaiContractCallSignRequest,
): IrohaConnectDetail[] => {
  const signingPreview = decodedSigningMessagePreview(
    request.signingMessageB64,
  );
  return [
    { label: t("Request ID"), value: request.requestId, monospace: true },
    {
      label: t("Requested account"),
      value: displayOptional(request.accountId),
      monospace: true,
    },
    {
      label: t("Active account"),
      value: activeConnectAccountId.value || t("No active wallet"),
      monospace: true,
    },
    {
      label: t("Session ID"),
      value: parsed.sid,
      monospace: true,
    },
    {
      label: t("Chain ID"),
      value: parsed.chainId || session.connection.chainId,
      monospace: true,
    },
    {
      label: t("Endpoint"),
      value: parsed.node || session.connection.toriiUrl,
      monospace: true,
    },
    {
      label: t("Signing payload bytes"),
      value: String(signingPreview.byteLength),
    },
    {
      label: t("Signing payload preview"),
      value: signingPreview.preview,
      monospace: true,
    },
    {
      label: t("Signing message"),
      value: request.signingMessageB64,
      monospace: true,
    },
  ];
};

const closeScannedConnectSocket = () => {
  if (
    scannedConnectSocket &&
    scannedConnectSocket.readyState !== WebSocket.CLOSED
  ) {
    scannedConnectSocket.close(1000, "approval complete");
  }
  scannedConnectSocket = null;
  scannedConnectSequence = 2;
  pendingConnectRequest.value = null;
  pendingRequestLoading.value = false;
  pendingRequestError.value = "";
};

const waitForConnectSocketOpen = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("IrohaConnect approval timed out."));
    }, 10_000);
    socket.addEventListener(
      "open",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("IrohaConnect relay connection failed."));
      },
      { once: true },
    );
  });

const connectEventBytes = async (data: MessageEvent["data"]) => {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  throw new Error("IrohaConnect relay returned a non-binary frame.");
};

const parsePrivateTradeProofRequest = (
  payload: Uint8Array,
): UranaiPrivateTradeProofRequest | null => {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payload));
  } catch (_error) {
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const message = value as Record<string, unknown>;
  if (
    message.schema !== PRIVATE_TRADE_PROOF_SCHEMA ||
    message.kind !== "private_trade_proof_request" ||
    typeof message.requestId !== "string"
  ) {
    return null;
  }
  return message as unknown as UranaiPrivateTradeProofRequest;
};

const parseContractCallSignRequest = (
  payload: Uint8Array,
): UranaiContractCallSignRequest | null => {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payload));
  } catch (_error) {
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const message = value as Record<string, unknown>;
  if (
    message.schema !== CONTRACT_CALL_SIGN_SCHEMA ||
    message.kind !== "contract_call_signature_request" ||
    typeof message.requestId !== "string" ||
    typeof message.signingMessageB64 !== "string"
  ) {
    return null;
  }
  return message as unknown as UranaiContractCallSignRequest;
};

const sendProofPayload = (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  payload: Record<string, unknown>,
) => {
  socket.send(
    encodeIrohaConnectCiphertextFrame({
      sid: parsed.sid,
      direction: "wallet-to-app",
      sequence: scannedConnectSequence,
      payload: JSON.stringify(payload),
    }),
  );
  scannedConnectSequence += 1;
};

const rejectProofRequest = (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  requestId: string,
  reason: string,
) => {
  sendProofPayload(socket, parsed, {
    schema: PRIVATE_TRADE_PROOF_SCHEMA,
    kind: "private_trade_proof_reject",
    requestId,
    code: "proof_rejected",
    reason,
  });
};

const rejectSignRequest = (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  requestId: string,
  reason: string,
) => {
  sendProofPayload(socket, parsed, {
    schema: CONTRACT_CALL_SIGN_SCHEMA,
    kind: "contract_call_signature_reject",
    requestId,
    code: "signature_rejected",
    reason,
  });
};

const queuePrivateTradeProofRequest = (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  request: UranaiPrivateTradeProofRequest,
) => {
  if (pendingConnectRequest.value) {
    rejectProofRequest(
      socket,
      parsed,
      request.requestId,
      "Finish the current IrohaConnect approval before sending another request.",
    );
    return;
  }
  pendingRequestError.value = "";
  pendingConnectRequest.value = {
    kind: "privateTradeProof",
    socket,
    parsed,
    request,
    label: t("IrohaConnect transaction"),
    title: t("Approve private proof?"),
    approveLabel: t("Approve proof"),
    details: buildPrivateProofDetails(parsed, request),
  };
  connectApprovalStatus.value = t("Waiting for your approval...");
};

const queueContractCallSignRequest = (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  request: UranaiContractCallSignRequest,
) => {
  if (pendingConnectRequest.value) {
    rejectSignRequest(
      socket,
      parsed,
      request.requestId,
      "Finish the current IrohaConnect approval before sending another request.",
    );
    return;
  }
  pendingRequestError.value = "";
  pendingConnectRequest.value = {
    kind: "contractSignature",
    socket,
    parsed,
    request,
    label: t("IrohaConnect transaction"),
    title: t("Approve transaction signature?"),
    approveLabel: t("Approve and sign"),
    details: buildContractSignDetails(parsed, request),
  };
  connectApprovalStatus.value = t("Waiting for your approval...");
};

const handlePrivateTradeProofRequest = async (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  request: UranaiPrivateTradeProofRequest,
) => {
  const accountId = activeConnectAccountId.value;
  if (!accountId) {
    rejectProofRequest(
      socket,
      parsed,
      request.requestId,
      "Choose an active wallet before approving the private trade proof.",
    );
    return;
  }
  if (request.accountId && request.accountId !== accountId) {
    rejectProofRequest(
      socket,
      parsed,
      request.requestId,
      "The private trade proof request is for a different wallet account.",
    );
    return;
  }

  connectApprovalStatus.value = t("Preparing private trade proof...");
  try {
    const proof = await buildUranaiPrivateTradeProof({
      toriiUrl: request.toriiUrl || session.connection.toriiUrl,
      chainId: request.chainId || parsed.chainId || session.connection.chainId,
      accountId,
      assetDefinitionId: request.assetDefinitionId || "xor#universal",
      collateralIn: request.collateralIn || "0",
      privacyFee: request.privacyFee || "0",
      marketId: request.marketId,
      outcomeIndex: request.outcomeIndex,
    });
    sendProofPayload(socket, parsed, {
      kind: "private_trade_proof_response",
      requestId: request.requestId,
      ...proof,
    });
    connectApprovalStatus.value = t("Private trade proof sent.");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    rejectProofRequest(socket, parsed, request.requestId, reason);
    connectApprovalStatus.value = reason;
  }
};

const handleContractCallSignRequest = async (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  request: UranaiContractCallSignRequest,
) => {
  const accountId = activeConnectAccountId.value;
  if (!accountId) {
    rejectSignRequest(
      socket,
      parsed,
      request.requestId,
      "Choose an active wallet before signing the contract call.",
    );
    return;
  }
  if (request.accountId && request.accountId !== accountId) {
    rejectSignRequest(
      socket,
      parsed,
      request.requestId,
      "The contract call signing request is for a different wallet account.",
    );
    return;
  }

  connectApprovalStatus.value = t("Approving...");
  try {
    const signature = await signIrohaConnectMessage({
      accountId,
      signingMessageB64: request.signingMessageB64,
    });
    sendProofPayload(socket, parsed, {
      schema: CONTRACT_CALL_SIGN_SCHEMA,
      kind: "contract_call_signature_response",
      requestId: request.requestId,
      publicKeyHex: signature.publicKeyHex,
      signatureB64: signature.signatureB64,
    });
    connectApprovalStatus.value = accountId;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    rejectSignRequest(socket, parsed, request.requestId, reason);
    connectApprovalStatus.value = reason;
  }
};

const handleScannedConnectMessage = async (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  event: MessageEvent,
) => {
  try {
    const frame = decodeIrohaConnectFrame(await connectEventBytes(event.data));
    if (frame.kind !== "ciphertext" || frame.direction !== "app-to-wallet") {
      return;
    }
    const request = parsePrivateTradeProofRequest(frame.payload);
    if (request) {
      queuePrivateTradeProofRequest(socket, parsed, request);
      return;
    }
    const signRequest = parseContractCallSignRequest(frame.payload);
    if (signRequest) {
      queueContractCallSignRequest(socket, parsed, signRequest);
    }
  } catch (error) {
    connectScanError.value =
      error instanceof Error ? error.message : String(error);
  }
};

const approveScannedConnectSession = async (parsed: ParsedIrohaConnectUri) => {
  connectApprovalLoading.value = true;
  connectApprovalStatus.value = "";
  connectScanError.value = "";
  closeScannedConnectSocket();

  try {
    const accountId = getPublicAccountId(
      session.activeAccount,
      session.connection.networkPrefix,
    );
    const approval = buildIrohaConnectApprovalRequest({
      session: parsed,
      accountId: accountId ?? "",
      fallbackToriiUrl: session.connection.toriiUrl,
    });
    const socket = new WebSocket(approval.url, approval.protocols);
    socket.binaryType = "arraybuffer";
    scannedConnectSocket = socket;
    await waitForConnectSocketOpen(socket);
    socket.addEventListener("message", (event) => {
      void handleScannedConnectMessage(socket, parsed, event);
    });
    socket.send(approval.frame);
    connectApprovalStatus.value = accountId ?? "";
    connectScanner.message.value = t("IrohaConnect approved.");
  } catch (error) {
    connectApprovalStatus.value = "";
    connectScanError.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    connectApprovalLoading.value = false;
  }
};

const approvePendingConnection = async () => {
  const parsed = pendingConnectSession.value;
  if (!parsed) {
    return;
  }
  await approveScannedConnectSession(parsed);
  if (!connectScanError.value) {
    pendingConnectSession.value = null;
  }
};

const rejectPendingConnection = () => {
  pendingConnectSession.value = null;
  connectApprovalStatus.value = t("Rejected");
  connectScanner.message.value = t("IrohaConnect connection rejected.");
};

const approvePendingConnectRequest = async () => {
  const pending = pendingConnectRequest.value;
  if (!pending || pendingRequestLoading.value) {
    return;
  }
  pendingRequestLoading.value = true;
  pendingRequestError.value = "";
  try {
    if (pending.kind === "privateTradeProof") {
      await handlePrivateTradeProofRequest(
        pending.socket,
        pending.parsed,
        pending.request,
      );
    } else {
      await handleContractCallSignRequest(
        pending.socket,
        pending.parsed,
        pending.request,
      );
    }
    pendingConnectRequest.value = null;
  } catch (error) {
    pendingRequestError.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    pendingRequestLoading.value = false;
  }
};

const rejectPendingConnectRequest = () => {
  const pending = pendingConnectRequest.value;
  if (!pending || pendingRequestLoading.value) {
    return;
  }
  if (pending.kind === "privateTradeProof") {
    rejectProofRequest(
      pending.socket,
      pending.parsed,
      pending.request.requestId,
      "Rejected by user.",
    );
  } else {
    rejectSignRequest(
      pending.socket,
      pending.parsed,
      pending.request.requestId,
      "Rejected by user.",
    );
  }
  pendingConnectRequest.value = null;
  pendingRequestError.value = "";
  connectApprovalStatus.value = t("Rejected");
};

const connectScanner = useQrScanner(
  (payload) => {
    connectScanError.value = "";
    connectApprovalStatus.value = "";
    try {
      const parsed = parseIrohaConnectUri(payload);
      if (parsed.role !== "wallet") {
        throw new Error("Scan the wallet-role IrohaConnect QR from the app.");
      }
      scannedConnectSession.value = parsed;
      pendingConnectSession.value = parsed;
      connectScanner.message.value = t(
        "Review connection details before approving.",
      );
    } catch (error) {
      scannedConnectSession.value = null;
      pendingConnectSession.value = null;
      connectScanError.value =
        error instanceof Error ? error.message : String(error);
    }
  },
  { translate: t },
);

const connectStatusMessage = computed(
  () => connectScanError.value || connectScanner.message.value,
);
const screenScanning = computed(() =>
  Boolean(connectScanner.screenScanning.value),
);
const connectBusy = computed(
  () =>
    connectApprovalLoading.value ||
    Boolean(connectScanner.screenScanning.value),
);

const scanScreenQr = async () => {
  connectScanError.value = "";
  connectApprovalStatus.value = "";
  await connectScanner.decodeScreen();
};

const handlePanelToggle = () => {
  if (!panelRef.value?.open) {
    connectScanner.stop();
  }
};

onBeforeUnmount(() => {
  connectScanner.stop();
  closeScannedConnectSocket();
});
</script>

<style scoped>
.header-connect-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(18, 18, 26, 0.58);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
}

.header-connect-modal {
  width: min(640px, 100%);
  max-height: min(82vh, 720px);
  overflow: auto;
  display: grid;
  gap: 14px;
  padding: 22px;
  border-radius: 18px;
  box-shadow: var(--shadow-strong);
}

.header-connect-modal-label,
.header-connect-modal h2 {
  margin: 0;
}

.header-connect-modal-label {
  color: var(--iroha-muted);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.header-connect-modal h2 {
  font-size: clamp(1.35rem, 2vw, 1.75rem);
}

.header-connect-modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.header-connect-modal-grid .kv {
  min-width: 0;
}

.header-connect-modal-grid .kv:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}

.header-connect-modal-actions {
  justify-content: flex-end;
  margin-top: 2px;
}

.monospace {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.error {
  color: #b91c1c;
}

@media (max-width: 640px) {
  .header-connect-modal-backdrop {
    align-items: end;
    padding: 12px;
  }

  .header-connect-modal {
    max-height: 88vh;
    padding: 18px;
  }

  .header-connect-modal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
