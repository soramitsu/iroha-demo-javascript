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
          data-testid="header-connect-scan-screen"
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
          accept="image/png,image/jpeg,image/webp"
          class="sr-only"
          :aria-label="t('Upload QR image')"
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
        <div class="kv monospace">
          <span class="kv-label">{{ t("Chain ID") }}</span>
          <span class="kv-value">{{ session.connection.chainId }}</span>
        </div>
        <div class="kv monospace">
          <span class="kv-label">NetworkId</span>
          <span class="kv-value">{{ scannedConnectSession.networkId }}</span>
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

  <AppDialog
    :open="Boolean(pendingConnectSession)"
    :eyebrow="t('IrohaConnect connection')"
    :title="t('Approve connection?')"
    :description="
      t(
        'Review the requesting app details before allowing it to send wallet requests.',
      )
    "
    :busy="connectApprovalLoading"
    :show-close="false"
    initial-focus-selector="[data-testid='header-connect-reject']"
    @close="rejectPendingConnection"
  >
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
    <template #actions>
      <button
        type="button"
        class="secondary"
        data-testid="header-connect-reject"
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
    </template>
  </AppDialog>

  <AppDialog
    :open="Boolean(pendingConnectRequest)"
    :eyebrow="pendingConnectRequest?.label"
    :title="pendingConnectRequest?.title || t('IrohaConnect')"
    :description="
      t(
        'This request will not be signed or answered unless you approve it here.',
      )
    "
    :busy="pendingRequestLoading"
    :show-close="false"
    initial-focus-selector="[data-testid='header-connect-request-reject']"
    @close="rejectPendingConnectRequest"
  >
    <div class="header-connect-modal-grid">
      <div
        v-for="detail in pendingConnectRequest?.details || []"
        :key="detail.label"
        class="kv"
        :class="{
          monospace: detail.monospace,
          'review-row': detail.wide,
          error: detail.warning,
        }"
      >
        <span class="kv-label">{{ detail.label }}</span>
        <span class="kv-value">{{ detail.value }}</span>
      </div>
    </div>
    <p v-if="pendingRequestError" class="helper error">
      {{ pendingRequestError }}
    </p>
    <template #actions>
      <button
        type="button"
        class="secondary"
        data-testid="header-connect-request-reject"
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
            : pendingConnectRequest?.approveLabel
        }}
      </button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import AppDialog from "@/components/ui/AppDialog.vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { useQrScanner } from "@/composables/useQrScanner";
import {
  approveIrohaConnectRequest,
  approveIrohaConnectSession,
  closeIrohaConnectSession,
  inspectEndpoint,
  prepareIrohaConnectSession,
  processIrohaConnectFrame,
  rejectIrohaConnectRequest,
  resetIrohaConnectBoundary,
  setIrohaConnectContext,
  takePendingIrohaConnectDeepLink,
  IROHA_CONNECT_DEEP_LINK_EVENT,
} from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { getPublicAccountId } from "@/utils/accountId";
import {
  assertIrohaConnectEndpointCanPair,
  buildIrohaConnectApprovalRequest,
  parseIrohaConnectUri,
  type IrohaConnectNetworkContext,
  type ParsedIrohaConnectUri,
  validateIrohaConnectNetworkClaim,
} from "@/utils/irohaConnect";
import { connectTransactionReviewRows } from "@/utils/connectTransactionReview";
import type { ConnectTransactionReview } from "@/types/connectTransactionReview";
import {
  base64ToBytes,
  bytesToBase64,
  decodeConnectFrame,
  readIrohaConnectRelayFrame,
  type ConnectPermissions,
} from "@/utils/soraswapConnectWire";

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
let scannedConnectExpectedAppSequence = 1;
let scannedConnectExpectedServerSequence = 1;
let scannedConnectApproved = false;
let scannedConnectOpenApprovalInFlight = false;
let scannedConnectBoundaryInitialized = false;
let scannedConnectBoundarySessionToken = "";
let scannedConnectApprovedAccountId = "";
let scannedConnectNetworkContext: IrohaConnectNetworkContext | null = null;
let scannedConnectContextKey = "";
const connectApprovalGeneration = ref(0);

interface IrohaConnectDetail {
  label: string;
  value: string;
  monospace?: boolean;
  wide?: boolean;
  warning?: boolean;
}

type PendingConnectRequest = {
  socket: WebSocket;
  parsed: ParsedIrohaConnectUri;
  requestToken: string;
  requestType: "sign_request_raw" | "sign_request_tx";
  domainTag: string | null;
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

const currentConnectContextKey = computed(() =>
  JSON.stringify([
    session.connection.toriiUrl,
    session.connection.chainId,
    session.connection.networkPrefix,
    activeConnectAccountId.value,
  ]),
);

const requireMatchingConnectNetwork = async (
  parsed: ParsedIrohaConnectUri,
): Promise<IrohaConnectNetworkContext> => {
  const inspection = await inspectEndpoint({
    toriiUrl: session.connection.toriiUrl,
    chainId: session.connection.chainId,
    networkPrefix: session.connection.networkPrefix,
  });
  return validateIrohaConnectNetworkClaim(
    parsed,
    {
      ...session.connection,
      networkId: assertIrohaConnectEndpointCanPair(inspection),
    },
    {
      requireNetworkId: true,
      requireNode: true,
    },
  );
};

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
      value: session.connection.chainId,
      monospace: true,
    },
    {
      label: "NetworkId",
      value: displayOptional(parsed.networkId),
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
    {
      label: t("Relay token"),
      value: parsed.relayToken ? t("Present") : t("Missing"),
    },
  ];
});

const formatSigningPayloadPreview = (
  payloadPreviewHex: string,
  byteLength: number,
) => {
  if (
    !payloadPreviewHex ||
    payloadPreviewHex.length % 2 !== 0 ||
    /[^0-9a-f]/iu.test(payloadPreviewHex)
  ) {
    return t("Not provided");
  }
  const bytes = Uint8Array.from(
    payloadPreviewHex.match(/.{2}/gu) ?? [],
    (pair) => Number.parseInt(pair, 16),
  );
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const printable = decoded.replace(/[\t\n\r]/gu, "").trim();
  if (
    printable &&
    Array.from(printable).every((character) => character >= " ")
  ) {
    return byteLength > bytes.length ? `${decoded}...` : decoded;
  }
  return `0x${payloadPreviewHex}${byteLength > bytes.length ? "..." : ""}`;
};

const buildSigningRequestDetails = (
  parsed: ParsedIrohaConnectUri,
  byteLength: number,
  payloadPreviewHex: string,
  domainTag: string | null,
  approvedAccountId: string,
  review: ConnectTransactionReview | null,
): IrohaConnectDetail[] => {
  if (review) {
    return [
      {
        label: t("Active account"),
        value: approvedAccountId || t("No active wallet"),
        monospace: true,
      },
      { label: t("Session ID"), value: parsed.sid, monospace: true },
      { label: "NetworkId", value: review.networkId, monospace: true },
      {
        label: t("Endpoint"),
        value: parsed.node || session.connection.toriiUrl,
        monospace: true,
      },
      ...connectTransactionReviewRows(review).map((row) => ({
        ...row,
        wide: true,
      })),
    ];
  }
  return [
    {
      label: t("Active account"),
      value: approvedAccountId || t("No active wallet"),
      monospace: true,
    },
    {
      label: t("Session ID"),
      value: parsed.sid,
      monospace: true,
    },
    {
      label: t("Chain ID"),
      value: session.connection.chainId,
      monospace: true,
    },
    {
      label: "NetworkId",
      value: parsed.networkId,
      monospace: true,
    },
    {
      label: t("Endpoint"),
      value: parsed.node || session.connection.toriiUrl,
      monospace: true,
    },
    ...(domainTag
      ? [
          {
            label: t("Domain"),
            value: domainTag,
            monospace: true,
          },
        ]
      : []),
    {
      label: t("Signing payload bytes"),
      value: String(byteLength),
    },
    {
      label: t("Signing payload preview"),
      value: formatSigningPayloadPreview(payloadPreviewHex, byteLength),
      monospace: true,
    },
  ];
};

const clearScannedConnectState = () => {
  if (scannedConnectBoundarySessionToken) {
    closeIrohaConnectSession({
      sessionToken: scannedConnectBoundarySessionToken,
    });
  }
  if (scannedConnectBoundaryInitialized) {
    resetIrohaConnectBoundary();
  }
  scannedConnectSocket = null;
  scannedConnectExpectedAppSequence = 1;
  scannedConnectExpectedServerSequence = 1;
  scannedConnectApproved = false;
  scannedConnectOpenApprovalInFlight = false;
  scannedConnectBoundaryInitialized = false;
  scannedConnectBoundarySessionToken = "";
  scannedConnectApprovedAccountId = "";
  scannedConnectNetworkContext = null;
  scannedConnectContextKey = "";
  pendingConnectRequest.value = null;
  pendingRequestLoading.value = false;
  pendingRequestError.value = "";
};

const closeScannedConnectSocket = (reason = "approval complete") => {
  const socket = scannedConnectSocket;
  clearScannedConnectState();
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    socket.close(1000, reason);
  }
};

const closeSpecificScannedConnectSocket = (
  socket: WebSocket,
  reason = "approval complete",
) => {
  if (socket === scannedConnectSocket) {
    clearScannedConnectState();
  }
  if (socket.readyState !== WebSocket.CLOSED) {
    socket.close(1000, reason);
  }
};

const requireCurrentScannedConnection = (socket: WebSocket) => {
  if (
    socket !== scannedConnectSocket ||
    socket.readyState !== WebSocket.OPEN ||
    !scannedConnectContextKey ||
    scannedConnectContextKey !== currentConnectContextKey.value ||
    !scannedConnectNetworkContext
  ) {
    throw new Error(
      "The active wallet or IrohaConnect socket changed while approval was pending.",
    );
  }
  return scannedConnectNetworkContext;
};

const handleScannedSocketTermination = (socket: WebSocket, reason: string) => {
  if (socket !== scannedConnectSocket) {
    return;
  }
  clearScannedConnectState();
  connectApprovalStatus.value = "";
  connectScanError.value = reason;
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
    socket.addEventListener(
      "close",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("IrohaConnect relay connection closed."));
      },
      { once: true },
    );
  });

const queueConnectSigningRequest = (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  request: Extract<
    ReturnType<typeof processIrohaConnectFrame>,
    { kind: "request" }
  >,
) => {
  requireCurrentScannedConnection(socket);
  if (pendingConnectRequest.value) {
    throw new Error(
      "IrohaConnect returned a second pending request from the preload boundary.",
    );
  }
  pendingRequestError.value = "";
  pendingConnectRequest.value = {
    socket,
    parsed,
    requestToken: request.requestToken,
    requestType: request.requestType,
    domainTag: request.domainTag,
    label:
      request.requestType === "sign_request_raw"
        ? t("Raw message signature")
        : t("Transaction signature"),
    title: t("Approve transaction signature?"),
    approveLabel: t("Approve and sign"),
    details: buildSigningRequestDetails(
      parsed,
      request.byteLength,
      request.payloadPreviewHex,
      request.domainTag,
      scannedConnectApprovedAccountId,
      request.review,
    ),
  };
  connectApprovalStatus.value = t("Waiting for your approval...");
};

const approveOpenConnectFrame = async (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  appPublicKeyHex: string,
  requestedNetworkId: string,
  permissions: ConnectPermissions | null,
) => {
  const network = requireCurrentScannedConnection(socket);
  if (!parsed.relayToken) {
    throw new Error("IrohaConnect relay token is missing.");
  }
  if (
    scannedConnectOpenApprovalInFlight ||
    scannedConnectApproved ||
    scannedConnectBoundarySessionToken
  ) {
    throw new Error("IrohaConnect relay sent a duplicate Open frame.");
  }
  scannedConnectOpenApprovalInFlight = true;
  const accountId =
    scannedConnectApprovedAccountId || activeConnectAccountId.value;
  if (!accountId) {
    throw new Error("Choose an active wallet before approving IrohaConnect.");
  }
  if (appPublicKeyHex !== parsed.appPublicKeyHex) {
    throw new Error(
      "The IrohaConnect Open frame app key does not match the scanned session.",
    );
  }
  if (requestedNetworkId !== parsed.networkId) {
    throw new Error(
      "The IrohaConnect Open frame NetworkId does not match the scanned session.",
    );
  }
  validateIrohaConnectNetworkClaim({ networkId: requestedNetworkId }, network, {
    label: "The IrohaConnect relay request",
    requireNetworkId: true,
  });
  const prepared = await prepareIrohaConnectSession({
    context: {
      toriiUrl: network.toriiUrl,
      chainId: network.chainId,
      networkPrefix: network.networkPrefix,
      networkId: network.networkId,
      accountId,
    },
    sid: parsed.sid,
    appPublicKeyHex,
    nonceBase64Url: parsed.nonceBase64Url,
    relayToken: parsed.relayToken,
    requestedNetworkId,
    permissions,
  });
  requireCurrentScannedConnection(socket);
  const approved = await approveIrohaConnectSession(prepared);
  requireCurrentScannedConnection(socket);
  scannedConnectApprovedAccountId = accountId;
  scannedConnectBoundarySessionToken = approved.sessionToken;
  socket.send(base64ToBytes(approved.frameBase64));
  scannedConnectApproved = true;
  connectApprovalStatus.value = accountId;
  connectScanner.message.value = t("IrohaConnect approved.");
};

const handleProcessedConnectFrame = (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  processed: ReturnType<typeof processIrohaConnectFrame>,
) => {
  requireCurrentScannedConnection(socket);
  if (processed.kind === "response") {
    socket.send(base64ToBytes(processed.frameBase64));
    if (processed.error) {
      connectApprovalStatus.value = processed.error;
    }
    return;
  }
  if (processed.kind === "request") {
    queueConnectSigningRequest(socket, parsed, processed);
    return;
  }
  if (processed.kind === "closed") {
    closeSpecificScannedConnectSocket(socket, processed.reason);
  }
};

const handleScannedConnectMessage = async (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  event: MessageEvent,
) => {
  try {
    requireCurrentScannedConnection(socket);
    const bytes = await readIrohaConnectRelayFrame(event.data);
    requireCurrentScannedConnection(socket);
    const frame = decodeConnectFrame(bytes);
    if (frame.sid !== parsed.sid || frame.direction !== "app_to_wallet") {
      throw new Error(
        "IrohaConnect relay sent a frame with invalid session or direction.",
      );
    }
    if (frame.control?.type === "server_event") {
      if (frame.seq !== scannedConnectExpectedServerSequence) {
        throw new Error(
          `IrohaConnect relay sent server event sequence ${frame.seq}; expected ${scannedConnectExpectedServerSequence}.`,
        );
      }
      scannedConnectExpectedServerSequence += 1;
      return;
    }
    if (scannedConnectApproved) {
      if (!scannedConnectBoundarySessionToken) {
        throw new Error("IrohaConnect preload session is unavailable.");
      }
      handleProcessedConnectFrame(
        socket,
        parsed,
        processIrohaConnectFrame({
          sessionToken: scannedConnectBoundarySessionToken,
          frameBase64: bytesToBase64(bytes),
        }),
      );
      return;
    }
    if (frame.seq !== scannedConnectExpectedAppSequence) {
      throw new Error(
        `IrohaConnect app sent sequence ${frame.seq}; expected ${scannedConnectExpectedAppSequence}.`,
      );
    }
    scannedConnectExpectedAppSequence += 1;
    if (frame.kind !== "control" || frame.control?.type !== "open") {
      throw new Error("IrohaConnect first app frame must be Open sequence 1.");
    }
    await approveOpenConnectFrame(
      socket,
      parsed,
      frame.control.appPublicKeyHex,
      frame.control.constraints.networkId,
      frame.control.permissions,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    connectScanError.value = reason;
    closeSpecificScannedConnectSocket(socket, reason);
  }
};

const approveScannedConnectSession = async (parsed: ParsedIrohaConnectUri) => {
  const approvalGeneration = connectApprovalGeneration.value + 1;
  connectApprovalGeneration.value = approvalGeneration;
  const approvalContextKey = currentConnectContextKey.value;
  const isCurrentApproval = () =>
    approvalGeneration === connectApprovalGeneration.value &&
    approvalContextKey === currentConnectContextKey.value;
  connectApprovalLoading.value = true;
  connectApprovalStatus.value = "";
  connectScanError.value = "";
  closeScannedConnectSocket();
  let approvalSocket: WebSocket | null = null;

  try {
    if (!parsed.token) {
      throw new Error("IrohaConnect wallet token is missing.");
    }
    if (!parsed.relayToken) {
      throw new Error("IrohaConnect relay token is missing.");
    }
    if (!activeConnectAccountId.value) {
      throw new Error("Choose an active wallet before approving IrohaConnect.");
    }
    const network = await requireMatchingConnectNetwork(parsed);
    if (!isCurrentApproval()) {
      return;
    }
    scannedConnectNetworkContext = network;
    scannedConnectContextKey = approvalContextKey;
    const validatedSession: ParsedIrohaConnectUri = {
      ...parsed,
      node: network.toriiUrl,
    };
    const accountId =
      getPublicAccountId(session.activeAccount, network.networkPrefix) || "";
    if (!accountId) {
      throw new Error("Choose an active wallet before approving IrohaConnect.");
    }
    setIrohaConnectContext({
      toriiUrl: network.toriiUrl,
      chainId: network.chainId,
      networkPrefix: network.networkPrefix,
      networkId: network.networkId,
      accountId,
    });
    scannedConnectBoundaryInitialized = true;
    scannedConnectApprovedAccountId = accountId;
    const approval = buildIrohaConnectApprovalRequest({
      session: validatedSession,
      accountId,
    });
    const socket = new WebSocket(approval.url, approval.protocols);
    approvalSocket = socket;
    socket.binaryType = "arraybuffer";
    scannedConnectSocket = socket;
    socket.addEventListener("message", (event) => {
      void handleScannedConnectMessage(socket, validatedSession, event);
    });
    socket.addEventListener("error", () => {
      handleScannedSocketTermination(
        socket,
        "IrohaConnect relay connection failed.",
      );
    });
    socket.addEventListener("close", () => {
      handleScannedSocketTermination(
        socket,
        "IrohaConnect relay connection closed.",
      );
    });
    await waitForConnectSocketOpen(socket);
    if (
      !isCurrentApproval() ||
      socket !== scannedConnectSocket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      closeSpecificScannedConnectSocket(socket, "wallet context changed");
      return;
    }
    connectApprovalStatus.value = accountId
      ? t("Waiting for wallet request...")
      : "";
    connectScanner.message.value = t("Waiting for wallet request...");
  } catch (error) {
    if (approvalSocket) {
      closeSpecificScannedConnectSocket(approvalSocket);
    }
    if (!isCurrentApproval()) {
      return;
    }
    connectApprovalStatus.value = "";
    connectScanError.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    if (isCurrentApproval()) {
      connectApprovalLoading.value = false;
    }
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
    requireCurrentScannedConnection(pending.socket);
    const sessionToken = scannedConnectBoundarySessionToken;
    if (!sessionToken) {
      throw new Error("IrohaConnect preload session is unavailable.");
    }
    const result = await approveIrohaConnectRequest({
      sessionToken,
      requestToken: pending.requestToken,
    });
    requireCurrentScannedConnection(pending.socket);
    if (sessionToken !== scannedConnectBoundarySessionToken) {
      throw new Error("IrohaConnect preload session changed while approving.");
    }
    pending.socket.send(base64ToBytes(result.frameBase64));
    pendingConnectRequest.value = null;
    connectApprovalStatus.value = result.signed
      ? scannedConnectApprovedAccountId
      : t("Rejected");
  } catch (error) {
    if (
      pending.socket === scannedConnectSocket &&
      pendingConnectRequest.value === pending
    ) {
      pendingRequestError.value =
        error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (pending.socket === scannedConnectSocket) {
      pendingRequestLoading.value = false;
    }
  }
};

const rejectPendingConnectRequest = () => {
  const pending = pendingConnectRequest.value;
  if (!pending || pendingRequestLoading.value) {
    return;
  }
  try {
    requireCurrentScannedConnection(pending.socket);
    if (!scannedConnectBoundarySessionToken) {
      throw new Error("IrohaConnect preload session is unavailable.");
    }
    const result = rejectIrohaConnectRequest({
      sessionToken: scannedConnectBoundarySessionToken,
      requestToken: pending.requestToken,
    });
    pending.socket.send(base64ToBytes(result.frameBase64));
    pendingConnectRequest.value = null;
    pendingRequestError.value = "";
    connectApprovalStatus.value = t("Rejected");
  } catch (error) {
    pendingRequestError.value =
      error instanceof Error ? error.message : String(error);
  }
};

/**
 * Shared entry for scanned QR payloads and `iroha://connect` deep links: both
 * go through the same canonical URI validation and the approval modal.
 */
const beginConnectPairing = (payload: string) => {
  connectScanError.value = "";
  connectApprovalStatus.value = "";
  try {
    const parsed = parseIrohaConnectUri(payload);
    if (parsed.role !== "wallet") {
      throw new Error("Scan the wallet-role IrohaConnect QR from the app.");
    }
    connectApprovalGeneration.value += 1;
    closeScannedConnectSocket("new pairing scanned");
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
};

const connectScanner = useQrScanner(beginConnectPairing, { translate: t });

let deepLinkTakeInFlight = false;
const takePendingDeepLink = async () => {
  if (!session.hasAccount || deepLinkTakeInFlight) {
    return;
  }
  deepLinkTakeInFlight = true;
  try {
    const uri = await takePendingIrohaConnectDeepLink();
    if (uri) {
      beginConnectPairing(uri);
    }
  } catch (error) {
    connectScanError.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    deepLinkTakeInFlight = false;
  }
};
const handleDeepLinkAvailable = () => {
  void takePendingDeepLink();
};

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

const resetConnectForContextChange = () => {
  connectApprovalGeneration.value += 1;
  scannedConnectSession.value = null;
  pendingConnectSession.value = null;
  connectScanError.value = "";
  connectApprovalLoading.value = false;
  connectApprovalStatus.value = "";
  closeScannedConnectSocket("wallet context changed");
  connectScanner.stop();
  connectScanner.message.value = "";
};

watch(currentConnectContextKey, resetConnectForContextChange, {
  flush: "sync",
});

watch(
  () => session.hasAccount,
  (hasAccount) => {
    if (hasAccount) {
      void takePendingDeepLink();
    }
  },
);

onMounted(() => {
  window.addEventListener(
    IROHA_CONNECT_DEEP_LINK_EVENT,
    handleDeepLinkAvailable,
  );
  void takePendingDeepLink();
});

onBeforeUnmount(() => {
  window.removeEventListener(
    IROHA_CONNECT_DEEP_LINK_EVENT,
    handleDeepLinkAvailable,
  );
  connectApprovalGeneration.value += 1;
  connectScanner.stop();
  closeScannedConnectSocket();
});
</script>

<style scoped>
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

.header-connect-modal-grid .kv.review-row {
  grid-column: 1 / -1;
}

.header-connect-modal-grid .kv.review-row .kv-value {
  white-space: pre-line;
}

.monospace {
  font-family: var(--mono-font);
  word-break: break-all;
}

.error {
  color: var(--color-danger);
}

@media (max-width: 640px) {
  .header-connect-modal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
