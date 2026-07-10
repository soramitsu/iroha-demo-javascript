import { computed, ref } from "vue";
import type { CustomCaipNetwork } from "@reown/appkit-universal-connector";
import type { UniversalConnector } from "@reown/appkit-universal-connector";
import {
  normalizeSolanaAddress,
  normalizeSolanaTransactionSignature,
  SCCP_SOLANA_NETWORK,
  SOLANA_TESTNET_WALLET_STANDARD_CHAIN_ID,
  solanaWalletConnectSessionFromAddress,
  type WalletConnectSessionSnapshot,
} from "@/utils/sccp";
import { parseJsonWithoutDuplicateObjectKeys } from "@/utils/json";
import { isSecretLikeTextValue } from "@/utils/secretLike";

const LEGACY_STORAGE_KEY = "iroha-demo:sccp:solana-walletconnect";
const STORAGE_KEY = `${LEGACY_STORAGE_KEY}:${SCCP_SOLANA_NETWORK.caipChainId.replace(
  /[^a-z0-9_-]/giu,
  "-",
)}`;
const SOLANA_WALLETCONNECT_NAMESPACE = "solana";
const SOLANA_WALLETCONNECT_SIGN_TRANSACTION_METHOD = "solana_signTransaction";
const SOLANA_WALLETCONNECT_SIGN_AND_SEND_TRANSACTION_METHOD =
  "solana_signAndSendTransaction";
const SOLANA_CAIP_CHAIN_ID =
  SCCP_SOLANA_NETWORK.caipChainId as `solana:${string}`;
const SOLANA_COMPATIBLE_WALLETCONNECT_CHAIN_IDS = new Set<string>([
  SOLANA_CAIP_CHAIN_ID,
  SOLANA_TESTNET_WALLET_STANDARD_CHAIN_ID,
]);
const SOLANA_WALLETCONNECT_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SOLANA_WALLETCONNECT_SESSION_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_WALLETCONNECT_TOPIC_LENGTH = 256;
const WALLETCONNECT_PROJECT_ID_ERROR =
  "WalletConnect project ID must be a 32-character hex WalletConnect Cloud project ID.";
const SOLANA_WALLETCONNECT_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret)/iu;
const SOLANA_WALLETCONNECT_BASE64_TRANSACTION_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const SOLANA_SIGNATURE_BASE58_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/u;
const SOLANA_WALLETCONNECT_STORED_SESSION_FIELDS = new Set<string>([
  "topic",
  "address",
  "chainId",
  "namespace",
  "methodVersion",
  "connectedAtMs",
]);
const containsSecretLikeText = isSecretLikeTextValue as (
  value: unknown,
) => boolean;

type WalletConnectSessionLike = {
  topic?: unknown;
  namespaces?: Record<
    string,
    { accounts?: unknown; chains?: unknown; methods?: unknown }
  >;
};

type WalletConnectNamespaceRequest = {
  chains: string[];
  methods: string[];
  events: string[];
};

type WalletConnectConnectParams = {
  namespaces: Record<string, WalletConnectNamespaceRequest>;
};

type SolanaE2eWalletHarness = {
  connect?: () => Promise<{
    address?: unknown;
    topic?: unknown;
    connectedAtMs?: unknown;
  }>;
  disconnect?: () => Promise<void>;
  signAndSendTransaction?: (transactionB64: string) => Promise<unknown>;
  signTransaction?: (transactionB64: string) => Promise<unknown>;
};

declare global {
  interface Window {
    __irohaSolanaWalletHarness?: SolanaE2eWalletHarness;
  }
}

const SOLANA_WALLETCONNECT_ACCOUNT_PREFIX = `${SOLANA_WALLETCONNECT_NAMESPACE}:`;

const splitSolanaWalletConnectAccount = (
  account: string,
): { chainId: string; address: string } | null => {
  if (!account.startsWith(SOLANA_WALLETCONNECT_ACCOUNT_PREFIX)) {
    return null;
  }
  const first = account.indexOf(":");
  const second = account.indexOf(":", first + 1);
  if (first < 0 || second < 0) {
    return null;
  }
  return {
    chainId: account.slice(0, second),
    address: account.slice(second + 1),
  };
};

const activeSolanaWalletConnectNetwork = {
  id: SCCP_SOLANA_NETWORK.caipReference,
  chainNamespace: SOLANA_WALLETCONNECT_NAMESPACE,
  caipNetworkId: SOLANA_CAIP_CHAIN_ID,
  name: SCCP_SOLANA_NETWORK.label,
  nativeCurrency: {
    name: "Solana",
    symbol: "SOL",
    decimals: 9,
  },
  rpcUrls: {
    default: {
      http: [SCCP_SOLANA_NETWORK.rpcUrl],
    },
  },
} satisfies CustomCaipNetwork<typeof SOLANA_WALLETCONNECT_NAMESPACE>;

const activeSolanaWalletConnectNamespace = {
  namespace: SOLANA_WALLETCONNECT_NAMESPACE,
  chains: [activeSolanaWalletConnectNetwork],
  methods: [
    SOLANA_WALLETCONNECT_SIGN_TRANSACTION_METHOD,
    SOLANA_WALLETCONNECT_SIGN_AND_SEND_TRANSACTION_METHOD,
  ],
  events: ["accountsChanged", "chainChanged"],
};

let connectorPromise: Promise<UniversalConnector> | null = null;
let connectorProjectId = "";

const hasUnsafeWalletConnectProjectIdCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

export const normalizeSolanaWalletConnectProjectId = (
  value: unknown,
): string | null => {
  const projectId = String(value ?? "").trim();
  if (!projectId) {
    return null;
  }
  if (
    !/^[0-9a-f]{32}$/iu.test(projectId) ||
    hasUnsafeWalletConnectProjectIdCharacter(projectId) ||
    /[/:?#@\\]/u.test(projectId)
  ) {
    throw new Error(WALLETCONNECT_PROJECT_ID_ERROR);
  }
  return projectId;
};

const readRuntimeWalletConnectProjectId = (): string => {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.iroha?.getRuntimeConfig?.().walletConnectProjectId ?? "";
  } catch (_error) {
    return "";
  }
};

const runtimeSolanaE2eWalletEnabled = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.iroha?.getRuntimeConfig?.().sccpSolanaE2eWallet === "1";
  } catch (_error) {
    return false;
  }
};

const readConfiguredProjectId = (): { projectId: string; error: string } => {
  try {
    return {
      projectId:
        normalizeSolanaWalletConnectProjectId(
          import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
            readRuntimeWalletConnectProjectId(),
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

const e2eWalletHarnessEnabled = (): boolean =>
  import.meta.env.VITE_SCCP_SOLANA_E2E_WALLET === "1" ||
  runtimeSolanaE2eWalletEnabled();

const readE2eWalletHarness = (): SolanaE2eWalletHarness | null => {
  if (!e2eWalletHarnessEnabled() || typeof window === "undefined") {
    return null;
  }
  const harness = window.__irohaSolanaWalletHarness;
  return typeof harness === "object" && harness !== null ? harness : null;
};

export const createSolanaWalletConnectConnectParams =
  (): WalletConnectConnectParams => ({
    namespaces: {
      [SOLANA_WALLETCONNECT_NAMESPACE]: {
        chains: [SCCP_SOLANA_NETWORK.caipChainId],
        methods: [
          SOLANA_WALLETCONNECT_SIGN_TRANSACTION_METHOD,
          SOLANA_WALLETCONNECT_SIGN_AND_SEND_TRANSACTION_METHOD,
        ],
        events: ["accountsChanged", "chainChanged"],
      },
    },
  });

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
    SOLANA_WALLETCONNECT_SECRET_KEY_PATTERN.test(topic) ||
    containsSecretLikeText(topic)
  ) {
    throw new Error("Stored WalletConnect topic is invalid.");
  }
  for (let index = 0; index < topic.length; index += 1) {
    const code = topic.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      throw new Error("Stored WalletConnect topic is invalid.");
    }
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

const listWalletConnectStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const listActiveSolanaSessionAddresses = (
  session: WalletConnectSessionLike | null | undefined,
): string[] => {
  const accounts = listWalletConnectStrings(
    session?.namespaces?.[SOLANA_WALLETCONNECT_NAMESPACE]?.accounts,
  );
  const addresses = accounts
    .map(splitSolanaWalletConnectAccount)
    .filter(
      (account): account is { chainId: string; address: string } =>
        account !== null &&
        SOLANA_COMPATIBLE_WALLETCONNECT_CHAIN_IDS.has(account.chainId),
    )
    .map((account) => normalizeSolanaAddress(account.address));
  return Array.from(new Set(addresses));
};

const listUnsupportedSolanaSessionChains = (
  session: WalletConnectSessionLike | null | undefined,
): string[] => {
  const accounts = listWalletConnectStrings(
    session?.namespaces?.[SOLANA_WALLETCONNECT_NAMESPACE]?.accounts,
  );
  return Array.from(
    new Set(
      accounts
        .map(splitSolanaWalletConnectAccount)
        .filter(
          (account): account is { chainId: string; address: string } =>
            account !== null &&
            !SOLANA_COMPATIBLE_WALLETCONNECT_CHAIN_IDS.has(account.chainId),
        )
        .map((account) => account.chainId),
    ),
  ).sort();
};

export const extractSolanaAddressFromSession = (
  session: WalletConnectSessionLike | null | undefined,
): string | null => {
  const unsupportedChains = listUnsupportedSolanaSessionChains(session);
  if (unsupportedChains.length > 0) {
    throw new Error(
      `Connected wallet exposed unsupported Solana accounts (${unsupportedChains.join(", ")}); approve only ${SCCP_SOLANA_NETWORK.label} and reconnect.`,
    );
  }
  const addresses = listActiveSolanaSessionAddresses(session);
  if (addresses.length > 1) {
    throw new Error(
      "Connected wallet exposed multiple Solana accounts; approve exactly one and reconnect.",
    );
  }
  return addresses[0] ?? null;
};

export const solanaWalletConnectSessionSupportsRequiredSigning = (
  session: WalletConnectSessionLike | null | undefined,
): boolean => {
  const namespace = session?.namespaces?.[SOLANA_WALLETCONNECT_NAMESPACE];
  const methods = listWalletConnectStrings(namespace?.methods);
  const chains = listWalletConnectStrings(namespace?.chains);
  const supportsChain = chains.some((chainId) =>
    SOLANA_COMPATIBLE_WALLETCONNECT_CHAIN_IDS.has(chainId),
  );
  return (
    supportsChain &&
    methods.includes(SOLANA_WALLETCONNECT_SIGN_TRANSACTION_METHOD) &&
    methods.includes(SOLANA_WALLETCONNECT_SIGN_AND_SEND_TRANSACTION_METHOD)
  );
};

export const solanaWalletConnectSessionMatchesSnapshot = (
  session: WalletConnectSessionLike | null | undefined,
  snapshot: WalletConnectSessionSnapshot | null | undefined,
): boolean => {
  if (!snapshot) {
    return false;
  }
  let address: string | null = null;
  try {
    address = extractSolanaAddressFromSession(session);
  } catch (_error) {
    return false;
  }
  return (
    address === snapshot.address &&
    normalizeStoredWalletConnectTopic(session?.topic) === snapshot.topic &&
    solanaWalletConnectSessionSupportsRequiredSigning(session)
  );
};

export const isFreshSolanaWalletConnectSessionTimestamp = (
  value: unknown,
  now = Date.now(),
): boolean => {
  const parsed = Number(value);
  return (
    Number.isSafeInteger(parsed) &&
    parsed > 0 &&
    parsed <= now + SOLANA_WALLETCONNECT_SESSION_FUTURE_SKEW_MS &&
    now - parsed <= SOLANA_WALLETCONNECT_SESSION_MAX_AGE_MS
  );
};

const isStoredWalletConnectSessionRecord = (
  value: unknown,
): value is WalletConnectSessionSnapshot => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).every((key) =>
    SOLANA_WALLETCONNECT_STORED_SESSION_FIELDS.has(key),
  );
};

export const readStoredSolanaWalletConnectSession =
  (): WalletConnectSessionSnapshot | null => {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = parseJsonWithoutDuplicateObjectKeys(
        raw,
        "Stored Solana WalletConnect session",
      ) as WalletConnectSessionSnapshot | null;
      if (!isStoredWalletConnectSessionRecord(parsed)) {
        throw new Error("Stored Solana WalletConnect session is invalid.");
      }
      if (
        parsed.namespace !== SOLANA_WALLETCONNECT_NAMESPACE ||
        parsed.methodVersion !== "solana-wallet-standard-v1" ||
        parsed.chainId !== SOLANA_CAIP_CHAIN_ID ||
        !isFreshSolanaWalletConnectSessionTimestamp(parsed.connectedAtMs)
      ) {
        return null;
      }
      const snapshot = solanaWalletConnectSessionFromAddress(
        normalizeSolanaAddress(String(parsed.address ?? "")),
        requireStoredWalletConnectTopic(parsed.topic),
        SOLANA_CAIP_CHAIN_ID,
      );
      snapshot.connectedAtMs = parsed.connectedAtMs;
      return snapshot;
    } catch (_error) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return null;
    }
  };

export const writeStoredSolanaWalletConnectSession = (
  snapshot: WalletConnectSessionSnapshot | null,
): void => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  if (!snapshot) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  if (!isFreshSolanaWalletConnectSessionTimestamp(snapshot.connectedAtMs)) {
    throw new Error("Solana WalletConnect session timestamp is invalid.");
  }
  const normalized = solanaWalletConnectSessionFromAddress(
    normalizeSolanaAddress(String(snapshot.address ?? "")),
    requireStoredWalletConnectTopic(snapshot.topic),
    SOLANA_CAIP_CHAIN_ID,
  );
  normalized.connectedAtMs = snapshot.connectedAtMs;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
};

const getConnector = async (): Promise<UniversalConnector> => {
  const projectId = readConfiguredProjectId().projectId;
  if (!projectId) {
    throw new Error("WalletConnect project ID is not configured.");
  }
  if (connectorPromise && connectorProjectId === projectId) {
    return connectorPromise;
  }
  connectorProjectId = projectId;
  connectorPromise = import("@reown/appkit-universal-connector").then(
    ({ UniversalConnector }) =>
      UniversalConnector.init({
        projectId,
        metadata: {
          name: "SORA Wallet SCCP",
          description: "SORA SCCP bridge wallet connection",
          url:
            typeof window === "undefined"
              ? "https://sora.org"
              : window.location.origin,
          icons: ["https://sora.org/favicon.ico"],
        },
        networks: [activeSolanaWalletConnectNamespace],
      }),
  );
  return connectorPromise;
};

const normalizeSolanaTransactionB64 = (
  value: unknown,
  label = "Solana transaction",
): string => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a base64 serialized transaction.`);
  }
  const normalized = value.trim();
  if (
    !normalized ||
    !SOLANA_WALLETCONNECT_BASE64_TRANSACTION_PATTERN.test(normalized)
  ) {
    throw new Error(`${label} must be a base64 serialized transaction.`);
  }
  let decoded = "";
  try {
    decoded = globalThis.atob(normalized);
  } catch (_error) {
    throw new Error(`${label} must be a base64 serialized transaction.`);
  }
  if (
    decoded.length === 0 ||
    decoded.length > 1232 ||
    globalThis.btoa(decoded) !== normalized
  ) {
    throw new Error(`${label} must be canonical Solana transaction bytes.`);
  }
  return normalized;
};

export const normalizeSolanaWalletSignature = (value: unknown): string => {
  const record =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const signature = String(
    record?.signature ?? record?.txid ?? value ?? "",
  ).trim();
  if (!SOLANA_SIGNATURE_BASE58_PATTERN.test(signature)) {
    throw new Error(
      "Solana wallet did not return a valid transaction signature.",
    );
  }
  try {
    return normalizeSolanaTransactionSignature(
      signature,
      "Solana wallet transaction signature",
    );
  } catch (_error) {
    throw new Error(
      "Solana wallet did not return a valid transaction signature.",
    );
  }
};

export const normalizeSolanaWalletSignedTransaction = (
  value: unknown,
): string => {
  const record =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  return normalizeSolanaTransactionB64(
    record?.transaction ?? record?.signedTransaction ?? value,
    "Signed Solana transaction",
  );
};

export const createSolanaWalletConnectSignTransactionParams = (
  transactionB64: string,
  pubkey: string,
): Readonly<{ transaction: string; pubkey: string }> =>
  Object.freeze({
    transaction: normalizeSolanaTransactionB64(transactionB64),
    pubkey: normalizeSolanaAddress(pubkey),
  });

export const createSolanaWalletConnectSignAndSendTransactionParams = (
  transactionB64: string,
  pubkey: string,
): Readonly<{
  transaction: string;
  pubkey: string;
  sendOptions: Readonly<{
    preflightCommitment: "confirmed";
    skipPreflight: false;
  }>;
}> =>
  Object.freeze({
    ...createSolanaWalletConnectSignTransactionParams(transactionB64, pubkey),
    sendOptions: Object.freeze({
      preflightCommitment: "confirmed",
      skipPreflight: false,
    }),
  });

export const useSolanaWalletConnect = () => {
  const stored = readStoredSolanaWalletConnectSession();
  const address = ref(stored?.address ?? "");
  const sessionTopic = ref(stored?.topic ?? "");
  const sessionConnectedAtMs = ref(stored?.connectedAtMs ?? 0);
  const connecting = ref(false);
  const disconnecting = ref(false);
  const error = ref("");

  const connected = computed(() => Boolean(address.value));
  const projectConfigurationError = computed(() =>
    readE2eWalletHarness() ? "" : readConfiguredProjectId().error,
  );
  const projectId = computed(() => readConfiguredProjectId().projectId);
  const projectConfigured = computed(
    () =>
      Boolean(readE2eWalletHarness()) ||
      (!projectConfigurationError.value && Boolean(projectId.value)),
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
    writeStoredSolanaWalletConnectSession(null);
  };

  const currentSnapshot = (): WalletConnectSessionSnapshot | null => {
    if (!address.value || !sessionTopic.value) {
      return null;
    }
    const snapshot = solanaWalletConnectSessionFromAddress(
      address.value,
      sessionTopic.value,
    );
    snapshot.connectedAtMs = sessionConnectedAtMs.value;
    return snapshot;
  };

  const persist = () => {
    writeStoredSolanaWalletConnectSession(currentSnapshot());
  };

  const connect = async () => {
    error.value = "";
    connecting.value = true;
    let shouldClearRejectedSession = false;
    let connector: UniversalConnector | null = null;
    try {
      const harness = readE2eWalletHarness();
      if (harness) {
        if (typeof harness.connect !== "function") {
          throw new Error("Solana E2E wallet harness connect hook is missing.");
        }
        const connectedHarness = await harness.connect();
        const snapshot = solanaWalletConnectSessionFromAddress(
          String(connectedHarness?.address ?? ""),
          requireStoredWalletConnectTopic(
            connectedHarness?.topic ?? "e2e-solana-wallet-harness",
            "Solana E2E wallet topic",
          ),
        );
        if (connectedHarness?.connectedAtMs !== undefined) {
          if (
            !isFreshSolanaWalletConnectSessionTimestamp(
              connectedHarness.connectedAtMs,
            )
          ) {
            throw new Error("Solana E2E wallet session timestamp is invalid.");
          }
          snapshot.connectedAtMs = Number(connectedHarness.connectedAtMs);
        }
        address.value = snapshot.address ?? "";
        sessionTopic.value = snapshot.topic ?? "";
        sessionConnectedAtMs.value = snapshot.connectedAtMs;
        persist();
        return;
      }
      connector = await getConnector();
      const { session } = await connector.connect(
        createSolanaWalletConnectConnectParams(),
      );
      shouldClearRejectedSession = true;
      const nextAddress = extractSolanaAddressFromSession(session);
      if (!nextAddress) {
        throw new Error(
          `Connected wallet did not provide a ${SCCP_SOLANA_NETWORK.label} account.`,
        );
      }
      if (!solanaWalletConnectSessionSupportsRequiredSigning(session)) {
        throw new Error(
          "Connected wallet did not approve Solana transaction signing.",
        );
      }
      const snapshot = solanaWalletConnectSessionFromAddress(
        nextAddress,
        requireStoredWalletConnectTopic(session.topic),
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
      const harness = readE2eWalletHarness();
      if (harness && typeof harness.disconnect === "function") {
        await harness.disconnect();
      } else {
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

  const requireFreshSession =
    async (): Promise<WalletConnectSessionSnapshot> => {
      if (!address.value) {
        throw new Error("Connect a Solana wallet before signing.");
      }
      const snapshot = currentSnapshot();
      if (
        !snapshot ||
        !isFreshSolanaWalletConnectSessionTimestamp(snapshot.connectedAtMs)
      ) {
        clearSession();
        throw new Error("Reconnect your Solana wallet before signing.");
      }
      const connector = await getConnector();
      const activeSession = connector.provider.session as
        | WalletConnectSessionLike
        | null
        | undefined;
      if (!solanaWalletConnectSessionMatchesSnapshot(activeSession, snapshot)) {
        clearSession();
        throw new Error("Reconnect your Solana wallet before signing.");
      }
      return snapshot;
    };

  const signTransaction = async (transactionB64: string): Promise<string> => {
    const normalizedTransaction = normalizeSolanaTransactionB64(transactionB64);
    const harness = readE2eWalletHarness();
    if (harness) {
      if (typeof harness.signTransaction !== "function") {
        throw new Error(
          "Solana E2E wallet harness signTransaction hook is missing.",
        );
      }
      return normalizeSolanaWalletSignedTransaction(
        await harness.signTransaction(normalizedTransaction),
      );
    }
    const snapshot = await requireFreshSession();
    const snapshotAddress = normalizeSolanaAddress(
      String(snapshot.address ?? ""),
    );
    const connector = await getConnector();
    const result = await connector.request(
      Object.freeze({
        method: SOLANA_WALLETCONNECT_SIGN_TRANSACTION_METHOD,
        params: createSolanaWalletConnectSignTransactionParams(
          normalizedTransaction,
          snapshotAddress,
        ),
      }),
      SCCP_SOLANA_NETWORK.caipChainId,
    );
    return normalizeSolanaWalletSignedTransaction(result);
  };

  const signAndSendTransaction = async (
    transactionB64: string,
  ): Promise<string> => {
    const normalizedTransaction = normalizeSolanaTransactionB64(transactionB64);
    const harness = readE2eWalletHarness();
    if (harness) {
      if (typeof harness.signAndSendTransaction !== "function") {
        throw new Error(
          "Solana E2E wallet harness signAndSendTransaction hook is missing.",
        );
      }
      return normalizeSolanaWalletSignature(
        await harness.signAndSendTransaction(normalizedTransaction),
      );
    }
    const snapshot = await requireFreshSession();
    const snapshotAddress = normalizeSolanaAddress(
      String(snapshot.address ?? ""),
    );
    const connector = await getConnector();
    const result = await connector.request(
      Object.freeze({
        method: SOLANA_WALLETCONNECT_SIGN_AND_SEND_TRANSACTION_METHOD,
        params: createSolanaWalletConnectSignAndSendTransactionParams(
          normalizedTransaction,
          snapshotAddress,
        ),
      }),
      SCCP_SOLANA_NETWORK.caipChainId,
    );
    return normalizeSolanaWalletSignature(result);
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
    connect,
    disconnect,
    signTransaction,
    signAndSendTransaction,
  };
};
