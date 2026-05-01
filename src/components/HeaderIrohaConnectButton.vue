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
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
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
const connectScanError = ref("");
const connectApprovalLoading = ref(false);
const connectApprovalStatus = ref("");
let scannedConnectSocket: WebSocket | null = null;
let scannedConnectSequence = 2;

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

const closeScannedConnectSocket = () => {
  if (
    scannedConnectSocket &&
    scannedConnectSocket.readyState !== WebSocket.CLOSED
  ) {
    scannedConnectSocket.close(1000, "approval complete");
  }
  scannedConnectSocket = null;
  scannedConnectSequence = 2;
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

const handlePrivateTradeProofRequest = async (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  request: UranaiPrivateTradeProofRequest,
) => {
  const accountId = getPublicAccountId(
    session.activeAccount,
    session.connection.networkPrefix,
  );
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
  const accountId = getPublicAccountId(
    session.activeAccount,
    session.connection.networkPrefix,
  );
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
      await handlePrivateTradeProofRequest(socket, parsed, request);
      return;
    }
    const signRequest = parseContractCallSignRequest(frame.payload);
    if (signRequest) {
      await handleContractCallSignRequest(socket, parsed, signRequest);
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
      void approveScannedConnectSession(parsed);
    } catch (error) {
      scannedConnectSession.value = null;
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
