import { computed, ref } from "vue";
import type { CustomCaipNetwork } from "@reown/appkit-universal-connector";
import type { UniversalConnector } from "@reown/appkit-universal-connector";
import {
  normalizeTronAddress,
  SCCP_TRON_NETWORK,
  WALLETCONNECT_TRON_METHOD_VERSION,
  WALLETCONNECT_TRON_NAMESPACE,
  WALLETCONNECT_TRON_SIGN_METHOD,
  walletConnectSessionFromAddress,
  type WalletConnectSessionSnapshot,
} from "@/utils/sccp";
import { isSecretLikeTextValue } from "@/utils/secretLike";
import {
  getSccpNileTestTronSigner,
  signSccpNileTestTronTransaction,
} from "@/services/iroha";
import type { SccpNileTestTronSignerStatus } from "@/types/iroha";

const STORAGE_KEY = "iroha-demo:sccp:tron-walletconnect";
const TEST_SIGNER_SESSION_TOPIC = "sccp-nile-test-signer";
const NILE_TEST_SIGNER_ALLOWED = SCCP_TRON_NETWORK.key === "nile";
export const TRON_WALLETCONNECT_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TRON_WALLETCONNECT_SESSION_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_WALLETCONNECT_TOPIC_LENGTH = 256;
const TRON_WALLETCONNECT_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret)/iu;
const TRON_WALLETCONNECT_SIGNING_HELPER_KEY_PATTERN =
  /^(?:signatures?|privateSignature|private_signature|signatureB64|signature_b64|signedTransaction|signed_transaction|walletSignature|wallet_signature)$/iu;
const WALLETCONNECT_PROJECT_ID_ERROR =
  "WalletConnect project ID must be a non-empty opaque identifier without URL syntax.";

type WalletConnectSessionLike = {
  topic?: string;
  namespaces?: Record<string, { accounts?: string[]; methods?: string[] }>;
  sessionProperties?: Record<string, unknown>;
};

type WalletConnectNamespaceRequest = {
  chains: string[];
  methods: string[];
  events: string[];
};

type WalletConnectConnectParams = {
  namespaces: Record<string, WalletConnectNamespaceRequest>;
  sessionProperties: {
    tron_method_version: string;
  };
};

const getConfiguredProjectId = (): string =>
  readConfiguredProjectId().projectId;

const hasUnsafeWalletConnectProjectIdCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

export const normalizeTronWalletConnectProjectId = (
  value: unknown,
): string | null => {
  const projectId = String(value ?? "").trim();
  if (!projectId) {
    return null;
  }
  if (
    projectId.length > 128 ||
    hasUnsafeWalletConnectProjectIdCharacter(projectId) ||
    /[/:?#@\\]/u.test(projectId)
  ) {
    throw new Error(WALLETCONNECT_PROJECT_ID_ERROR);
  }
  return projectId;
};

const readConfiguredProjectId = (): { projectId: string; error: string } => {
  try {
    return {
      projectId:
        normalizeTronWalletConnectProjectId(
          import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
        ) ?? "",
      error: "",
    };
  } catch (error) {
    return {
      projectId: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

let connectorPromise: Promise<UniversalConnector> | null = null;
let connectorProjectId = "";
let connectorNetworkKey = "";

const activeTronWalletConnectNetwork = {
  id: Number.parseInt(SCCP_TRON_NETWORK.chainIdHex.slice(2), 16),
  chainNamespace: WALLETCONNECT_TRON_NAMESPACE,
  caipNetworkId: SCCP_TRON_NETWORK.caipChainId,
  name: SCCP_TRON_NETWORK.label,
  nativeCurrency: {
    name: "TRON",
    symbol: "TRX",
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: [SCCP_TRON_NETWORK.rpcUrl],
    },
  },
} satisfies CustomCaipNetwork<typeof WALLETCONNECT_TRON_NAMESPACE>;

export const walletConnectProjectId = getConfiguredProjectId();

export const createTronWalletConnectConnectParams =
  (): WalletConnectConnectParams => ({
    namespaces: {
      [WALLETCONNECT_TRON_NAMESPACE]: {
        chains: [SCCP_TRON_NETWORK.caipChainId],
        methods: [WALLETCONNECT_TRON_SIGN_METHOD],
        events: ["accountsChanged", "chainChanged"],
      },
    },
    sessionProperties: {
      tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
    },
  });

const listActiveTronSessionAddresses = (
  session: WalletConnectSessionLike | null | undefined,
): string[] => {
  const accounts =
    session?.namespaces?.[WALLETCONNECT_TRON_NAMESPACE]?.accounts ?? [];
  if (!Array.isArray(accounts)) {
    return [];
  }
  const addresses = accounts
    .filter(
      (item) =>
        typeof item === "string" &&
        item.startsWith(`${SCCP_TRON_NETWORK.caipChainId}:`),
    )
    .map((account) =>
      normalizeTronAddress(
        account.slice(`${SCCP_TRON_NETWORK.caipChainId}:`.length),
      ),
    );
  return Array.from(new Set(addresses));
};

export const extractTronAddressFromSession = (
  session: WalletConnectSessionLike | null | undefined,
): string | null => {
  const addresses = listActiveTronSessionAddresses(session);
  if (addresses.length === 0) {
    return null;
  }
  if (addresses.length > 1) {
    throw new Error(
      `Connected wallet exposed multiple ${SCCP_TRON_NETWORK.label} accounts; select one account and reconnect.`,
    );
  }
  return addresses[0];
};

export const tronWalletConnectSessionSupportsRequiredSigning = (
  session: WalletConnectSessionLike | null | undefined,
): boolean => {
  const methods =
    session?.namespaces?.[WALLETCONNECT_TRON_NAMESPACE]?.methods ?? [];
  const methodVersion = session?.sessionProperties?.tron_method_version;
  return (
    Array.isArray(methods) &&
    methods.includes(WALLETCONNECT_TRON_SIGN_METHOD) &&
    typeof methodVersion === "string" &&
    methodVersion === WALLETCONNECT_TRON_METHOD_VERSION
  );
};

export const tronWalletConnectSessionMatchesSnapshot = (
  session: WalletConnectSessionLike | null | undefined,
  snapshot: WalletConnectSessionSnapshot | null | undefined,
): boolean => {
  if (!snapshot?.address) {
    return false;
  }
  let sessionAddress: string | null;
  let snapshotAddress: string;
  try {
    sessionAddress = extractTronAddressFromSession(session);
    snapshotAddress = normalizeTronAddress(snapshot.address);
  } catch (_error) {
    return false;
  }
  if (!sessionAddress || sessionAddress !== snapshotAddress) {
    return false;
  }
  if (!tronWalletConnectSessionSupportsRequiredSigning(session)) {
    return false;
  }
  if (!snapshot.topic || snapshot.topic !== session?.topic) {
    return false;
  }
  if (!isFreshTronWalletConnectSessionTimestamp(snapshot.connectedAtMs)) {
    return false;
  }
  return true;
};

const hasUnsafeStoredTextCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

const isRecordLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertNoSecretLikeTransactionRequestFields = (
  value: unknown,
  path = "TRON transaction request",
  seen = new WeakSet<object>(),
): void => {
  if (isSecretLikeTextValue(value)) {
    throw new Error(
      `${path} must not contain recovery phrases or private key material before WalletConnect signing.`,
    );
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    value.forEach((entry, index) => {
      assertNoSecretLikeTransactionRequestFields(
        entry,
        `${path}[${index}]`,
        seen,
      );
    });
    return;
  }
  if (!isRecordLike(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (TRON_WALLETCONNECT_SECRET_KEY_PATTERN.test(key)) {
      throw new Error(
        `${path}.${key} must not be sent to the connected wallet.`,
      );
    }
    if (TRON_WALLETCONNECT_SIGNING_HELPER_KEY_PATTERN.test(key)) {
      throw new Error(
        "TRON transaction request must not already contain signatures or signing helper payloads before WalletConnect signing.",
      );
    }
    assertNoSecretLikeTransactionRequestFields(child, `${path}.${key}`, seen);
  }
};

const normalizeStoredWalletConnectTopic = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("Stored WalletConnect topic must be text.");
  }
  const topic = value.trim();
  if (
    topic.length === 0 ||
    topic.length > MAX_WALLETCONNECT_TOPIC_LENGTH ||
    hasUnsafeStoredTextCharacter(topic) ||
    isSecretLikeTextValue(topic)
  ) {
    throw new Error("Stored WalletConnect topic is invalid.");
  }
  return topic;
};

const requireStoredWalletConnectTopic = (
  value: unknown,
  label = "WalletConnect topic",
): string => {
  const topic = normalizeStoredWalletConnectTopic(value);
  if (!topic) {
    throw new Error(`${label} is required.`);
  }
  return topic;
};

export const isFreshTronWalletConnectSessionTimestamp = (
  connectedAtMs: unknown,
  nowMs = Date.now(),
): connectedAtMs is number => {
  if (
    typeof connectedAtMs !== "number" ||
    !Number.isSafeInteger(connectedAtMs) ||
    connectedAtMs <= 0
  ) {
    return false;
  }
  if (connectedAtMs > nowMs + TRON_WALLETCONNECT_SESSION_FUTURE_SKEW_MS) {
    return false;
  }
  return nowMs - connectedAtMs <= TRON_WALLETCONNECT_SESSION_MAX_AGE_MS;
};

export const readStoredTronWalletConnectSession =
  (): WalletConnectSessionSnapshot | null => {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "null",
      ) as WalletConnectSessionSnapshot | null;
      if (!parsed?.address) {
        return null;
      }
      if (
        parsed.chainId !== SCCP_TRON_NETWORK.caipChainId ||
        parsed.namespace !== WALLETCONNECT_TRON_NAMESPACE ||
        parsed.methodVersion !== WALLETCONNECT_TRON_METHOD_VERSION
      ) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      const connectedAtMs = Number(parsed.connectedAtMs);
      if (!isFreshTronWalletConnectSessionTimestamp(connectedAtMs)) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      const snapshot = walletConnectSessionFromAddress(
        parsed.address,
        requireStoredWalletConnectTopic(
          parsed.topic,
          "Stored WalletConnect topic",
        ),
      );
      snapshot.connectedAtMs = connectedAtMs;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          topic: snapshot.topic,
          address: snapshot.address,
          chainId: snapshot.chainId,
          namespace: snapshot.namespace,
          methodVersion: snapshot.methodVersion,
          connectedAtMs: snapshot.connectedAtMs,
        }),
      );
      return snapshot;
    } catch (_error) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  };

export const writeStoredTronWalletConnectSession = (
  snapshot: WalletConnectSessionSnapshot | null,
): void => {
  if (!snapshot) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  if (!isFreshTronWalletConnectSessionTimestamp(snapshot.connectedAtMs)) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  if (
    snapshot.chainId !== SCCP_TRON_NETWORK.caipChainId ||
    snapshot.namespace !== WALLETCONNECT_TRON_NAMESPACE ||
    snapshot.methodVersion !== WALLETCONNECT_TRON_METHOD_VERSION
  ) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  let normalizedTopic: string;
  try {
    normalizedTopic = requireStoredWalletConnectTopic(
      snapshot.topic,
      "Stored WalletConnect topic",
    );
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  let normalizedAddress: string;
  try {
    normalizedAddress = normalizeTronAddress(snapshot.address ?? "");
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      topic: normalizedTopic,
      address: normalizedAddress,
      chainId: snapshot.chainId,
      namespace: snapshot.namespace,
      methodVersion: snapshot.methodVersion,
      connectedAtMs: snapshot.connectedAtMs,
    }),
  );
};

const getConnector = async (): Promise<UniversalConnector> => {
  const { projectId, error } = readConfiguredProjectId();
  if (error) {
    throw new Error(error);
  }
  if (!projectId) {
    throw new Error("WalletConnect project ID is not configured.");
  }
  if (
    connectorProjectId !== projectId ||
    connectorNetworkKey !== SCCP_TRON_NETWORK.key
  ) {
    connectorPromise = null;
    connectorProjectId = projectId;
    connectorNetworkKey = SCCP_TRON_NETWORK.key;
  }
  if (!connectorPromise) {
    connectorPromise = import("@reown/appkit-universal-connector")
      .then(({ UniversalConnector }) =>
        UniversalConnector.init({
          projectId,
          metadata: {
            name: "Iroha Wallet",
            description: "TAIRA SCCP bridge",
            url: "https://sora.org",
            icons: ["https://sora.org/favicon.ico"],
          },
          networks: [
            {
              namespace: WALLETCONNECT_TRON_NAMESPACE,
              chains: [activeTronWalletConnectNetwork],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD],
              events: ["accountsChanged", "chainChanged"],
            },
          ],
          modalConfig: {
            features: {
              analytics: false,
              email: false,
              socials: [],
            },
          },
        }),
      )
      .catch((error) => {
        if (connectorProjectId === projectId) {
          connectorPromise = null;
          connectorProjectId = "";
          connectorNetworkKey = "";
        }
        throw error;
      });
  }
  return connectorPromise;
};

export const cloneTronWalletConnectTransactionRequest = (
  transaction: Record<string, unknown>,
): Record<string, unknown> => {
  try {
    const cloned = structuredClone(transaction);
    if (
      typeof cloned !== "object" ||
      cloned === null ||
      Array.isArray(cloned)
    ) {
      throw new Error("TRON transaction request must be an object.");
    }
    if (Object.prototype.hasOwnProperty.call(cloned, "signature")) {
      throw new Error(
        "TRON transaction request must not already contain signatures before WalletConnect signing.",
      );
    }
    assertNoSecretLikeTransactionRequestFields(cloned);
    return cloned as Record<string, unknown>;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "TRON transaction request must be an object." ||
        error.message.startsWith(
          "TRON transaction request must not already contain signatures",
        ) ||
        error.message.endsWith("must not be sent to the connected wallet.") ||
        error.message.endsWith(
          "must not contain recovery phrases or private key material before WalletConnect signing.",
        ))
    ) {
      throw error;
    }
    throw new Error(
      "TRON transaction request must be structured-cloneable before WalletConnect signing.",
    );
  }
};

export const useTronWalletConnect = () => {
  const stored = readStoredTronWalletConnectSession();
  const address = ref(stored?.address ?? "");
  const sessionTopic = ref(stored?.topic ?? "");
  const connecting = ref(false);
  const disconnecting = ref(false);
  const error = ref("");
  const sessionConnectedAtMs = ref(stored?.connectedAtMs ?? 0);
  const testSignerStatus = ref<SccpNileTestTronSignerStatus>({
    enabled: false,
    network: "nile",
    address: "",
  });
  const testSignerChecking = ref(false);
  const testSignerError = ref("");

  const connected = computed(() => Boolean(address.value));
  const projectConfigurationError = computed(
    () => readConfiguredProjectId().error,
  );
  const projectId = computed(() => getConfiguredProjectId());
  const testSignerEnabled = computed(
    () => NILE_TEST_SIGNER_ALLOWED && testSignerStatus.value.enabled,
  );
  const testSignerAddress = computed(() =>
    testSignerEnabled.value ? testSignerStatus.value.address : "",
  );
  const projectConfigured = computed(
    () =>
      !projectConfigurationError.value &&
      (Boolean(getConfiguredProjectId()) || testSignerEnabled.value),
  );
  const isTestSignerSession = computed(
    () =>
      sessionTopic.value === TEST_SIGNER_SESSION_TOPIC &&
      Boolean(address.value) &&
      address.value === testSignerStatus.value.address &&
      testSignerEnabled.value,
  );
  const shortAddress = computed(() =>
    address.value
      ? `${address.value.slice(0, 6)}...${address.value.slice(-6)}`
      : "",
  );

  const clearSession = () => {
    address.value = "";
    sessionTopic.value = "";
    sessionConnectedAtMs.value = 0;
    writeStoredTronWalletConnectSession(null);
  };

  const currentSnapshot = (): WalletConnectSessionSnapshot | null => {
    if (!address.value) {
      return null;
    }
    if (!sessionTopic.value) {
      return null;
    }
    const snapshot = walletConnectSessionFromAddress(
      address.value,
      sessionTopic.value,
    );
    snapshot.connectedAtMs = sessionConnectedAtMs.value;
    return snapshot;
  };

  const persist = () => {
    writeStoredTronWalletConnectSession(currentSnapshot());
  };

  const refreshTestSigner = async () => {
    if (!NILE_TEST_SIGNER_ALLOWED) {
      testSignerStatus.value = {
        enabled: false,
        network: "nile",
        address: "",
      };
      testSignerError.value = "";
      if (sessionTopic.value === TEST_SIGNER_SESSION_TOPIC) {
        clearSession();
      }
      return;
    }
    testSignerChecking.value = true;
    try {
      const status = await getSccpNileTestTronSigner();
      testSignerStatus.value = status.enabled
        ? {
            ...status,
            address: normalizeTronAddress(status.address),
          }
        : status;
      testSignerError.value = status.reason ?? "";
      if (
        sessionTopic.value === TEST_SIGNER_SESSION_TOPIC &&
        !isTestSignerSession.value
      ) {
        clearSession();
      }
    } catch (statusError) {
      testSignerStatus.value = {
        enabled: false,
        network: "nile",
        address: "",
      };
      testSignerError.value =
        statusError instanceof Error ? statusError.message : String(statusError);
      if (sessionTopic.value === TEST_SIGNER_SESSION_TOPIC) {
        clearSession();
      }
    } finally {
      testSignerChecking.value = false;
    }
  };

  void refreshTestSigner();

  const connect = async () => {
    error.value = "";
    connecting.value = true;
    let shouldClearRejectedSession = false;
    let connector: UniversalConnector | null = null;
    try {
      if (!getConfiguredProjectId()) {
        await refreshTestSigner();
        if (testSignerEnabled.value) {
          address.value = testSignerStatus.value.address;
          sessionTopic.value = TEST_SIGNER_SESSION_TOPIC;
          sessionConnectedAtMs.value = Date.now();
          writeStoredTronWalletConnectSession(null);
          return;
        }
      }
      connector = await getConnector();
      const { session } = await connector.connect(
        createTronWalletConnectConnectParams(),
      );
      shouldClearRejectedSession = true;
      const nextAddress = extractTronAddressFromSession(session);
      if (!nextAddress) {
        throw new Error(
          `Connected wallet did not provide a ${SCCP_TRON_NETWORK.label} account.`,
        );
      }
      if (!tronWalletConnectSessionSupportsRequiredSigning(session)) {
        throw new Error(
          "Connected wallet did not approve TRON v1 transaction signing.",
        );
      }
      const snapshot = walletConnectSessionFromAddress(
        nextAddress,
        requireStoredWalletConnectTopic(
          session.topic,
          "Connected WalletConnect topic",
        ),
      );
      address.value = snapshot.address ?? "";
      sessionTopic.value = snapshot.topic ?? "";
      sessionConnectedAtMs.value = snapshot.connectedAtMs;
      persist();
    } catch (connectError) {
      if (shouldClearRejectedSession) {
        try {
          await connector?.disconnect();
        } catch {
          // Preserve the validation error that rejected this session.
        }
        clearSession();
      }
      error.value =
        connectError instanceof Error
          ? connectError.message
          : String(connectError);
      throw connectError;
    } finally {
      connecting.value = false;
    }
  };

  const disconnect = async () => {
    error.value = "";
    disconnecting.value = true;
    try {
      if (!isTestSignerSession.value) {
        const connector = connectorPromise ? await connectorPromise : null;
        await connector?.disconnect();
      }
    } catch (disconnectError) {
      error.value =
        disconnectError instanceof Error
          ? disconnectError.message
          : String(disconnectError);
    } finally {
      clearSession();
      disconnecting.value = false;
    }
  };

  const signTransaction = async (transaction: Record<string, unknown>) => {
    if (!address.value) {
      throw new Error("Connect a TRON wallet before signing.");
    }
    const transactionForWallet =
      cloneTronWalletConnectTransactionRequest(transaction);
    if (isTestSignerSession.value) {
      return signSccpNileTestTronTransaction({
        transaction: transactionForWallet,
        ownerAddress: address.value,
      });
    }
    const snapshot = currentSnapshot();
    if (
      !snapshot ||
      !isFreshTronWalletConnectSessionTimestamp(snapshot.connectedAtMs)
    ) {
      clearSession();
      throw new Error("Reconnect your TRON wallet before signing.");
    }
    const connector = await getConnector();
    const activeSession = connector.provider.session as
      | WalletConnectSessionLike
      | null
      | undefined;
    if (!tronWalletConnectSessionMatchesSnapshot(activeSession, snapshot)) {
      clearSession();
      throw new Error("Reconnect your TRON wallet before signing.");
    }
    return connector.request(
      {
        method: WALLETCONNECT_TRON_SIGN_METHOD,
        params: {
          address: address.value,
          transaction: transactionForWallet,
        },
      },
      SCCP_TRON_NETWORK.caipChainId,
    );
  };

  return {
    address,
    sessionTopic,
    connected,
    connecting,
    disconnecting,
    error,
    projectConfigured,
    projectConfigurationError,
    projectId,
    shortAddress,
    testSignerAddress,
    testSignerChecking,
    testSignerEnabled,
    testSignerError,
    connect,
    disconnect,
    refreshTestSigner,
    signTransaction,
  };
};
