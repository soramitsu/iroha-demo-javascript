import { computed, ref } from "vue";
import type { CustomCaipNetwork } from "@reown/appkit-universal-connector";
import type { UniversalConnector } from "@reown/appkit-universal-connector";
import {
  bscWalletConnectSessionFromAddress,
  normalizeEvmAddress,
  SCCP_BSC_NETWORK,
  type WalletConnectSessionSnapshot,
} from "@/utils/sccp";
import { parseJsonWithoutDuplicateObjectKeys } from "@/utils/json";
import { isSecretLikeTextValue } from "@/utils/secretLike";
import { snapshotSccpJsonDataValue } from "@/utils/sccpDataSnapshot";

const LEGACY_STORAGE_KEY = "iroha-demo:sccp:bsc-walletconnect";
const STORAGE_KEY = `${LEGACY_STORAGE_KEY}:${SCCP_BSC_NETWORK.caipChainId.replace(
  /[^a-z0-9_-]/giu,
  "-",
)}`;
const BSC_WALLETCONNECT_NAMESPACE = "eip155";
const BSC_WALLETCONNECT_SEND_TRANSACTION_METHOD = "eth_sendTransaction";
const BSC_WALLETCONNECT_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BSC_WALLETCONNECT_SESSION_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_WALLETCONNECT_TOPIC_LENGTH = 256;
const WALLETCONNECT_PROJECT_ID_ERROR =
  "WalletConnect project ID must be a non-empty opaque identifier without URL syntax.";
const BSC_WALLETCONNECT_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret)/iu;
const BSC_WALLETCONNECT_UNSUPPORTED_FIELD_REDACTION_PATTERN =
  /(?:verifier[_-]?material|prover[_-]?material|proof[_-]?material|groth|alpha1|beta2|gamma2|delta2|vk_|private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password)/iu;
const BSC_WALLETCONNECT_SIGNING_HELPER_KEY_PATTERN =
  /^(?:signatures?|privateSignature|private_signature|signatureB64|signature_b64|signedTransaction|signed_transaction|walletSignature|wallet_signature)$/iu;
const BSC_WALLETCONNECT_CALL_DATA_PATTERN =
  /^0x[0-9a-fA-F]{8}(?:[0-9a-fA-F]{2})*$/u;
const BSC_WALLETCONNECT_QUANTITY_PATTERN = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/u;
const BSC_WALLETCONNECT_TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/u;
const BSC_WALLETCONNECT_MAX_CALL_DATA_BYTES = 128 * 1024;
const BSC_WALLETCONNECT_MAX_QUANTITY_HEX_DIGITS = 64;
const BSC_WALLETCONNECT_SECRET_INPUT_ERROR =
  "BSC transaction request must not contain secret-like material before WalletConnect approval.";
const BSC_WALLETCONNECT_PLAIN_DATA_INPUT_ERROR =
  "BSC transaction request must contain only enumerable string-keyed data fields before WalletConnect approval.";
const BSC_WALLETCONNECT_UNDEFINED_INPUT_ERROR =
  "BSC transaction request must not contain undefined fields before WalletConnect approval.";
const BSC_WALLETCONNECT_SESSION_DATA_ERROR =
  "BSC WalletConnect session must expose only enumerable string-keyed metadata fields.";
const BSC_WALLETCONNECT_QUANTITY_FIELDS = [
  "gas",
  "gasLimit",
  "gasPrice",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "nonce",
  "value",
] as const;
const BSC_WALLETCONNECT_ALLOWED_TRANSACTION_FIELDS = new Set<string>([
  "from",
  "to",
  "data",
  "chainId",
  "chain_id",
  ...BSC_WALLETCONNECT_QUANTITY_FIELDS,
]);
const BSC_WALLETCONNECT_STORED_SESSION_FIELDS = new Set<string>([
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
const publicUnsupportedTransactionField = (key: string): string =>
  BSC_WALLETCONNECT_UNSUPPORTED_FIELD_REDACTION_PATTERN.test(key)
    ? "[redacted unsupported field]"
    : key;

type WalletConnectSessionLike = {
  topic?: unknown;
  namespaces?: unknown;
};

type WalletConnectNamespaceRequest = {
  chains: string[];
  methods: string[];
  events: string[];
};

type WalletConnectConnectParams = {
  namespaces: Record<string, WalletConnectNamespaceRequest>;
};

type BscWalletConnectSendTransactionOptions = {
  allowedToAddresses?: readonly string[];
  allowedToAddressLabel?: string;
  allowedCallDataSelectors?: readonly string[];
  allowedCallDataSelectorLabel?: string;
};

type BscE2eWalletHarness = {
  connect?: () => Promise<{
    address?: unknown;
    topic?: unknown;
    connectedAtMs?: unknown;
  }>;
  disconnect?: () => Promise<void>;
  sendTransaction?: (transaction: Record<string, unknown>) => Promise<unknown>;
};

declare global {
  interface Window {
    __irohaBscWalletHarness?: BscE2eWalletHarness;
  }
}

const BSC_WALLETCONNECT_ACCOUNT_PREFIX = `${BSC_WALLETCONNECT_NAMESPACE}:`;
const ACTIVE_BSC_WALLETCONNECT_ACCOUNT_PREFIX = `${SCCP_BSC_NETWORK.caipChainId}:`;

const hasUnsafeWalletConnectProjectIdCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

export const normalizeBscWalletConnectProjectId = (
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

const runtimeBscE2eWalletEnabled = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.iroha?.getRuntimeConfig?.().sccpBscE2eWallet === "1";
  } catch (_error) {
    return false;
  }
};

const readConfiguredProjectId = (): { projectId: string; error: string } => {
  try {
    return {
      projectId:
        normalizeBscWalletConnectProjectId(
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
  import.meta.env.VITE_SCCP_BSC_E2E_WALLET === "1" ||
  runtimeBscE2eWalletEnabled();

const readE2eWalletHarness = (): BscE2eWalletHarness | null => {
  if (!e2eWalletHarnessEnabled() || typeof window === "undefined") {
    return null;
  }
  const harness = window.__irohaBscWalletHarness;
  if (typeof harness !== "object" || harness === null) {
    return null;
  }
  return harness;
};

const activeBscWalletConnectNetwork = {
  id: Number.parseInt(SCCP_BSC_NETWORK.chainIdHex.slice(2), 16),
  chainNamespace: BSC_WALLETCONNECT_NAMESPACE,
  caipNetworkId: SCCP_BSC_NETWORK.caipChainId,
  name: SCCP_BSC_NETWORK.label,
  nativeCurrency: {
    name: "BNB",
    symbol: "BNB",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [SCCP_BSC_NETWORK.rpcUrl],
    },
  },
} satisfies CustomCaipNetwork<typeof BSC_WALLETCONNECT_NAMESPACE>;

let connectorPromise: Promise<UniversalConnector> | null = null;
let connectorProjectId = "";

export const createBscWalletConnectConnectParams =
  (): WalletConnectConnectParams => ({
    namespaces: {
      [BSC_WALLETCONNECT_NAMESPACE]: {
        chains: [SCCP_BSC_NETWORK.caipChainId],
        methods: [BSC_WALLETCONNECT_SEND_TRANSACTION_METHOD],
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
    BSC_WALLETCONNECT_SECRET_KEY_PATTERN.test(topic) ||
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

const isPlainWalletConnectDataRecord = (
  value: unknown,
): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const requirePlainWalletConnectDataRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isPlainWalletConnectDataRecord(value)) {
    throw new Error(`${label} ${BSC_WALLETCONNECT_SESSION_DATA_ERROR}`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      throw new Error(`${label} ${BSC_WALLETCONNECT_SESSION_DATA_ERROR}`);
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} ${BSC_WALLETCONNECT_SESSION_DATA_ERROR}`);
    }
  }
  return value;
};

const readWalletConnectDataProperty = (
  value: Record<string, unknown>,
  key: string,
  label: string,
): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    return undefined;
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new Error(`${label} ${BSC_WALLETCONNECT_SESSION_DATA_ERROR}`);
  }
  return descriptor.value;
};

const readWalletConnectStringArray = (
  value: unknown,
  label: string,
): string[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} ${BSC_WALLETCONNECT_SESSION_DATA_ERROR}`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(descriptors, String(index))) {
      throw new Error(`${label} ${BSC_WALLETCONNECT_SESSION_DATA_ERROR}`);
    }
  }
  const values: string[] = [];
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") {
      continue;
    }
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)) {
      throw new Error(`${label} ${BSC_WALLETCONNECT_SESSION_DATA_ERROR}`);
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= value.length) {
      throw new Error(`${label} ${BSC_WALLETCONNECT_SESSION_DATA_ERROR}`);
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} ${BSC_WALLETCONNECT_SESSION_DATA_ERROR}`);
    }
    if (typeof descriptor.value !== "string") {
      throw new Error(`${label} ${BSC_WALLETCONNECT_SESSION_DATA_ERROR}`);
    }
    values[index] = descriptor.value;
  }
  return values;
};

const readBscWalletConnectSessionTopic = (
  session: WalletConnectSessionLike | null | undefined,
): unknown => {
  if (session === null || session === undefined) {
    return undefined;
  }
  const sessionRecord = requirePlainWalletConnectDataRecord(
    session,
    "Connected BSC WalletConnect session",
  );
  return readWalletConnectDataProperty(
    sessionRecord,
    "topic",
    "Connected BSC WalletConnect session",
  );
};

const readBscWalletConnectNamespaceData = (
  session: WalletConnectSessionLike | null | undefined,
): {
  namespaceKeys: string[];
  accounts: string[];
  chains: string[];
  methods: string[];
} => {
  if (session === null || session === undefined) {
    return { namespaceKeys: [], accounts: [], chains: [], methods: [] };
  }
  const sessionRecord = requirePlainWalletConnectDataRecord(
    session,
    "Connected BSC WalletConnect session",
  );
  const namespacesValue = readWalletConnectDataProperty(
    sessionRecord,
    "namespaces",
    "Connected BSC WalletConnect session",
  );
  if (namespacesValue === undefined || namespacesValue === null) {
    return { namespaceKeys: [], accounts: [], chains: [], methods: [] };
  }
  const namespaces = requirePlainWalletConnectDataRecord(
    namespacesValue,
    "Connected BSC WalletConnect namespaces",
  );
  const namespaceKeys = Object.keys(namespaces);
  const namespaceValue = readWalletConnectDataProperty(
    namespaces,
    BSC_WALLETCONNECT_NAMESPACE,
    "Connected BSC WalletConnect namespace",
  );
  if (namespaceValue === undefined || namespaceValue === null) {
    return { namespaceKeys, accounts: [], chains: [], methods: [] };
  }
  const namespace = requirePlainWalletConnectDataRecord(
    namespaceValue,
    "Connected BSC WalletConnect namespace",
  );
  return {
    namespaceKeys,
    accounts: readWalletConnectStringArray(
      readWalletConnectDataProperty(
        namespace,
        "accounts",
        "Connected BSC WalletConnect accounts",
      ),
      "Connected BSC WalletConnect accounts",
    ),
    chains: readWalletConnectStringArray(
      readWalletConnectDataProperty(
        namespace,
        "chains",
        "Connected BSC WalletConnect chains",
      ),
      "Connected BSC WalletConnect chains",
    ),
    methods: readWalletConnectStringArray(
      readWalletConnectDataProperty(
        namespace,
        "methods",
        "Connected BSC WalletConnect methods",
      ),
      "Connected BSC WalletConnect methods",
    ),
  };
};

const isStoredWalletConnectSessionRecord = (
  value: unknown,
): value is WalletConnectSessionSnapshot => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  return Object.keys(value).every((key) =>
    BSC_WALLETCONNECT_STORED_SESSION_FIELDS.has(key),
  );
};

export const isFreshBscWalletConnectSessionTimestamp = (
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
  if (connectedAtMs > nowMs + BSC_WALLETCONNECT_SESSION_FUTURE_SKEW_MS) {
    return false;
  }
  return nowMs - connectedAtMs <= BSC_WALLETCONNECT_SESSION_MAX_AGE_MS;
};

export const readStoredBscWalletConnectSession =
  (): WalletConnectSessionSnapshot | null => {
    const stored =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    const storedKey =
      localStorage.getItem(STORAGE_KEY) === stored
        ? STORAGE_KEY
        : LEGACY_STORAGE_KEY;
    if (!stored) {
      return null;
    }
    try {
      const parsed = parseJsonWithoutDuplicateObjectKeys(
        stored,
        "Stored BSC WalletConnect session",
      ) as WalletConnectSessionSnapshot | null;
      if (parsed === null) {
        localStorage.removeItem(storedKey);
        return null;
      }
      if (!isStoredWalletConnectSessionRecord(parsed)) {
        localStorage.removeItem(storedKey);
        return null;
      }
      if (!parsed?.address) {
        localStorage.removeItem(storedKey);
        return null;
      }
      if (
        parsed.chainId !== SCCP_BSC_NETWORK.caipChainId ||
        parsed.namespace !== BSC_WALLETCONNECT_NAMESPACE ||
        parsed.methodVersion !== "eip155-v1"
      ) {
        localStorage.removeItem(storedKey);
        return null;
      }
      const connectedAtMs = Number(parsed.connectedAtMs);
      if (!isFreshBscWalletConnectSessionTimestamp(connectedAtMs)) {
        localStorage.removeItem(storedKey);
        return null;
      }
      const snapshot = bscWalletConnectSessionFromAddress(
        parsed.address,
        requireStoredWalletConnectTopic(parsed.topic),
      );
      snapshot.connectedAtMs = connectedAtMs;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return snapshot;
    } catch (_error) {
      localStorage.removeItem(storedKey);
      return null;
    }
  };

export const writeStoredBscWalletConnectSession = (
  snapshot: WalletConnectSessionSnapshot | null,
): void => {
  if (!snapshot) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return;
  }
  if (!isFreshBscWalletConnectSessionTimestamp(snapshot.connectedAtMs)) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return;
  }
  if (
    snapshot.chainId !== SCCP_BSC_NETWORK.caipChainId ||
    snapshot.namespace !== BSC_WALLETCONNECT_NAMESPACE ||
    snapshot.methodVersion !== "eip155-v1"
  ) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return;
  }
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        topic: requireStoredWalletConnectTopic(snapshot.topic),
        address: normalizeEvmAddress(snapshot.address ?? ""),
        chainId: snapshot.chainId,
        namespace: snapshot.namespace,
        methodVersion: snapshot.methodVersion,
        connectedAtMs: snapshot.connectedAtMs,
      }),
    );
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
};

const getConnector = async (): Promise<UniversalConnector> => {
  const { projectId, error } = readConfiguredProjectId();
  if (error) {
    throw new Error(error);
  }
  if (!projectId) {
    throw new Error("WalletConnect project ID is not configured.");
  }
  if (connectorProjectId !== projectId) {
    connectorPromise = null;
    connectorProjectId = projectId;
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
              namespace: BSC_WALLETCONNECT_NAMESPACE,
              chains: [activeBscWalletConnectNetwork],
              methods: [BSC_WALLETCONNECT_SEND_TRANSACTION_METHOD],
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
        }
        throw error;
      });
  }
  return connectorPromise;
};

const listActiveBscSessionAddresses = (
  session: WalletConnectSessionLike | null | undefined,
): string[] => {
  const { accounts } = readBscWalletConnectNamespaceData(session);
  const addresses = accounts
    .filter((item) => item.startsWith(ACTIVE_BSC_WALLETCONNECT_ACCOUNT_PREFIX))
    .map((account) =>
      normalizeEvmAddress(
        account.slice(ACTIVE_BSC_WALLETCONNECT_ACCOUNT_PREFIX.length),
      ),
    );
  return Array.from(new Set(addresses));
};

const listUnsupportedEip155SessionChains = (
  session: WalletConnectSessionLike | null | undefined,
): string[] => {
  const { accounts } = readBscWalletConnectNamespaceData(session);
  const chains = accounts
    .filter(
      (account) =>
        account.startsWith(BSC_WALLETCONNECT_ACCOUNT_PREFIX) &&
        !account.startsWith(ACTIVE_BSC_WALLETCONNECT_ACCOUNT_PREFIX),
    )
    .map((account) => {
      const [, reference = "unknown"] = account.split(":");
      return `${BSC_WALLETCONNECT_NAMESPACE}:${reference}`;
    });
  return Array.from(new Set(chains)).sort();
};

export const extractBscAddressFromSession = (
  session: WalletConnectSessionLike | null | undefined,
): string | null => {
  const unsupportedChains = listUnsupportedEip155SessionChains(session);
  if (unsupportedChains.length > 0) {
    throw new Error(
      `Connected wallet exposed unsupported EIP-155 accounts (${unsupportedChains.join(", ")}); approve only ${SCCP_BSC_NETWORK.label} and reconnect.`,
    );
  }
  const addresses = listActiveBscSessionAddresses(session);
  if (addresses.length === 0) {
    return null;
  }
  if (addresses.length > 1) {
    throw new Error(
      `Connected wallet exposed multiple ${SCCP_BSC_NETWORK.label} accounts; select one account and reconnect.`,
    );
  }
  return addresses[0];
};

export const bscWalletConnectSessionSupportsRequiredSigning = (
  session: WalletConnectSessionLike | null | undefined,
): boolean => {
  try {
    const { namespaceKeys, chains, methods } =
      readBscWalletConnectNamespaceData(session);
    const namespaceScopeAccepted =
      namespaceKeys.length === 1 &&
      namespaceKeys[0] === BSC_WALLETCONNECT_NAMESPACE;
    const chainScopeAccepted =
      chains.length === 1 && chains[0] === SCCP_BSC_NETWORK.caipChainId;
    return (
      namespaceScopeAccepted &&
      methods.length === 1 &&
      methods[0] === BSC_WALLETCONNECT_SEND_TRANSACTION_METHOD &&
      chainScopeAccepted
    );
  } catch (_error) {
    return false;
  }
};

const isRecordLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPlainRecordLike = (value: Record<string, unknown>): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const normalizeTransactionChainIdValue = (value: unknown): bigint | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "string" && value === SCCP_BSC_NETWORK.chainIdHex) {
    return BigInt(activeBscWalletConnectNetwork.id);
  }
  throw new Error(
    `BSC transaction request chainId must be ${SCCP_BSC_NETWORK.chainIdHex}.`,
  );
};

const hasTransactionChainIdValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== "";

const assertBscWalletConnectTransactionChainId = (
  transaction: Record<string, unknown>,
): void => {
  if (
    hasTransactionChainIdValue(transaction.chainId) &&
    hasTransactionChainIdValue(transaction.chain_id) &&
    transaction.chainId !== transaction.chain_id
  ) {
    throw new Error("BSC transaction request chainId aliases must match.");
  }
  const camel = normalizeTransactionChainIdValue(transaction.chainId);
  const snake = normalizeTransactionChainIdValue(transaction.chain_id);
  const chainId = camel ?? snake;
  if (chainId === null) {
    throw new Error(
      `BSC transaction request must include chainId ${SCCP_BSC_NETWORK.chainIdHex}.`,
    );
  }
  if (chainId !== BigInt(activeBscWalletConnectNetwork.id)) {
    throw new Error(
      `BSC transaction request chainId must be ${SCCP_BSC_NETWORK.chainIdHex}.`,
    );
  }
};

const assertBscWalletConnectTransactionShape = (
  transaction: Record<string, unknown>,
): void => {
  for (const key of Object.keys(transaction)) {
    if (!BSC_WALLETCONNECT_ALLOWED_TRANSACTION_FIELDS.has(key)) {
      throw new Error(
        `BSC transaction request contains unsupported field ${publicUnsupportedTransactionField(
          key,
        )}.`,
      );
    }
  }

  const from = transaction.from;
  if (typeof from !== "string" || !from.trim()) {
    throw new Error(
      "BSC transaction request must include the connected account in the from field.",
    );
  }
  let normalizedFrom = "";
  try {
    normalizedFrom = normalizeEvmAddress(from);
  } catch (error) {
    throw new Error(
      `BSC transaction request from address is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  transaction.from = normalizedFrom;

  const to = transaction.to;
  if (typeof to !== "string" || !to.trim()) {
    throw new Error(
      "BSC transaction request must include a non-zero to address.",
    );
  }
  let normalizedTo = "";
  try {
    normalizedTo = normalizeEvmAddress(to);
  } catch (error) {
    throw new Error(
      `BSC transaction request to address is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  transaction.to = normalizedTo;

  const data = transaction.data;
  if (
    typeof data !== "string" ||
    !BSC_WALLETCONNECT_CALL_DATA_PATTERN.test(data)
  ) {
    throw new Error(
      "BSC transaction request data must be 0x-prefixed byte hex with a 4-byte function selector.",
    );
  }
  if ((data.length - 2) / 2 > BSC_WALLETCONNECT_MAX_CALL_DATA_BYTES) {
    throw new Error(
      `BSC transaction request data must be at most ${BSC_WALLETCONNECT_MAX_CALL_DATA_BYTES} bytes.`,
    );
  }

  for (const field of BSC_WALLETCONNECT_QUANTITY_FIELDS) {
    const value = transaction[field];
    if (value === undefined || value === null) {
      continue;
    }
    if (
      typeof value !== "string" ||
      !BSC_WALLETCONNECT_QUANTITY_PATTERN.test(value)
    ) {
      throw new Error(
        `BSC transaction request ${field} must be a canonical 0x-prefixed JSON-RPC quantity.`,
      );
    }
    if (value.length - 2 > BSC_WALLETCONNECT_MAX_QUANTITY_HEX_DIGITS) {
      throw new Error(
        `BSC transaction request ${field} must fit within a 256-bit JSON-RPC quantity.`,
      );
    }
  }
  const readQuantity = (
    field: (typeof BSC_WALLETCONNECT_QUANTITY_FIELDS)[number],
  ): bigint | null => {
    const value = transaction[field];
    return typeof value === "string" ? BigInt(value) : null;
  };
  if (
    transaction.value !== undefined &&
    transaction.value !== null &&
    transaction.value !== "0x0"
  ) {
    throw new Error("BSC transaction request native BNB value must be 0x0.");
  }
  if (
    transaction.gas !== undefined &&
    transaction.gas !== null &&
    transaction.gasLimit !== undefined &&
    transaction.gasLimit !== null &&
    transaction.gas !== transaction.gasLimit
  ) {
    throw new Error(
      "BSC transaction request gas and gasLimit aliases must match.",
    );
  }
  const gas = readQuantity("gas");
  const gasLimit = readQuantity("gasLimit");
  const effectiveGasLimit = gas ?? gasLimit;
  if (effectiveGasLimit !== null && effectiveGasLimit <= 0n) {
    throw new Error(
      "BSC transaction request gas limit must be greater than zero.",
    );
  }
  const hasLegacyGasPrice =
    transaction.gasPrice !== undefined && transaction.gasPrice !== null;
  const hasMaxFee =
    transaction.maxFeePerGas !== undefined && transaction.maxFeePerGas !== null;
  const hasMaxPriorityFee =
    transaction.maxPriorityFeePerGas !== undefined &&
    transaction.maxPriorityFeePerGas !== null;
  if (hasLegacyGasPrice && (hasMaxFee || hasMaxPriorityFee)) {
    throw new Error(
      "BSC transaction request must not mix legacy gasPrice and EIP-1559 fee fields.",
    );
  }
  if (hasMaxFee !== hasMaxPriorityFee) {
    throw new Error(
      "BSC transaction request EIP-1559 fee fields must include both maxFeePerGas and maxPriorityFeePerGas.",
    );
  }
  const gasPrice = readQuantity("gasPrice");
  if (gasPrice !== null && gasPrice <= 0n) {
    throw new Error(
      "BSC transaction request gasPrice must be greater than zero.",
    );
  }
  const maxFeePerGas = readQuantity("maxFeePerGas");
  const maxPriorityFeePerGas = readQuantity("maxPriorityFeePerGas");
  if (maxFeePerGas !== null && maxFeePerGas <= 0n) {
    throw new Error(
      "BSC transaction request maxFeePerGas must be greater than zero.",
    );
  }
  if (
    maxFeePerGas !== null &&
    maxPriorityFeePerGas !== null &&
    maxPriorityFeePerGas > maxFeePerGas
  ) {
    throw new Error(
      "BSC transaction request maxPriorityFeePerGas must not exceed maxFeePerGas.",
    );
  }
  if (
    transaction.gas === undefined &&
    typeof transaction.gasLimit === "string"
  ) {
    transaction.gas = transaction.gasLimit;
  }
  delete transaction.gasLimit;
};

const assertNoSecretLikeTransactionRequestFields = (
  value: unknown,
  path = "BSC transaction request",
  seen = new WeakSet<object>(),
): void => {
  if (isSecretLikeTextValue(value)) {
    throw new Error(BSC_WALLETCONNECT_SECRET_INPUT_ERROR);
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
    if (BSC_WALLETCONNECT_SECRET_KEY_PATTERN.test(key)) {
      throw new Error(BSC_WALLETCONNECT_SECRET_INPUT_ERROR);
    }
    if (BSC_WALLETCONNECT_SIGNING_HELPER_KEY_PATTERN.test(key)) {
      throw new Error(
        "BSC transaction request must not already contain signatures or signing helper payloads before WalletConnect approval.",
      );
    }
    assertNoSecretLikeTransactionRequestFields(child, `${path}.${key}`, seen);
  }
};

const assertNoUndefinedTransactionRequestFields = (
  value: unknown,
  seen = new WeakSet<object>(),
): void => {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === "length") {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        continue;
      }
      if (descriptor.value === undefined) {
        throw new Error(BSC_WALLETCONNECT_UNDEFINED_INPUT_ERROR);
      }
      assertNoUndefinedTransactionRequestFields(descriptor.value, seen);
    }
    return;
  }
  if (!isRecordLike(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (Array.isArray(value) && key === "length") {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      continue;
    }
    if (descriptor.value === undefined) {
      throw new Error(BSC_WALLETCONNECT_UNDEFINED_INPUT_ERROR);
    }
    assertNoUndefinedTransactionRequestFields(descriptor.value, seen);
  }
};

export const cloneBscWalletConnectTransactionRequest = (
  transaction: Record<string, unknown>,
): Record<string, unknown> => {
  if (!isRecordLike(transaction) || !isPlainRecordLike(transaction)) {
    throw new Error("BSC transaction request must be a plain object.");
  }
  assertNoUndefinedTransactionRequestFields(transaction);
  const cloned = snapshotSccpJsonDataValue(
    transaction,
    BSC_WALLETCONNECT_PLAIN_DATA_INPUT_ERROR,
  );
  if (
    typeof cloned !== "object" ||
    cloned === null ||
    Array.isArray(cloned) ||
    !isPlainRecordLike(cloned as Record<string, unknown>)
  ) {
    throw new Error("BSC transaction request must be a plain object.");
  }
  const transactionForWallet = cloned as Record<string, unknown>;
  assertNoSecretLikeTransactionRequestFields(transactionForWallet);
  assertBscWalletConnectTransactionChainId(transactionForWallet);
  assertBscWalletConnectTransactionShape(transactionForWallet);
  delete transactionForWallet.chain_id;
  transactionForWallet.chainId = SCCP_BSC_NETWORK.chainIdHex;
  return transactionForWallet;
};

export const normalizeBscWalletConnectTransactionHash = (
  value: unknown,
): string => {
  if (
    typeof value !== "string" ||
    !BSC_WALLETCONNECT_TX_HASH_PATTERN.test(value)
  ) {
    throw new Error(
      "BSC WalletConnect response must be a 32-byte transaction hash.",
    );
  }
  if (/^0x0{64}$/iu.test(value)) {
    throw new Error("BSC WalletConnect response hash must be non-zero.");
  }
  return value.toLowerCase();
};

const assertTransactionFromMatchesActiveAccount = (
  transaction: Record<string, unknown>,
  activeAddress: string | null | undefined,
): void => {
  if (!activeAddress) {
    throw new Error("Reconnect your BSC wallet before sending.");
  }
  const from = transaction.from;
  if (typeof from !== "string" || !from.trim()) {
    throw new Error(
      "BSC transaction request must include the connected account in the from field.",
    );
  }
  if (normalizeEvmAddress(from) !== activeAddress) {
    throw new Error(
      "BSC transaction request from address must match the connected wallet.",
    );
  }
};

export const normalizeBscWalletConnectAllowedToAddresses = (
  addresses: readonly string[] | undefined,
): string[] => {
  if (!addresses) {
    return [];
  }
  return Array.from(
    new Set(
      addresses.map((address) => normalizeEvmAddress(String(address ?? ""))),
    ),
  ).sort();
};

export const normalizeBscWalletConnectAllowedCallDataSelectors = (
  selectors: readonly string[] | undefined,
): string[] => {
  if (!selectors) {
    return [];
  }
  return Array.from(
    new Set(
      selectors.map((selector) => {
        const normalizedSelector = String(selector ?? "")
          .trim()
          .toLowerCase();
        if (!/^0x[0-9a-f]{8}$/u.test(normalizedSelector)) {
          throw new Error(
            "BSC WalletConnect allowed call data selectors must be 0x-prefixed 4-byte hex values.",
          );
        }
        return normalizedSelector;
      }),
    ),
  ).sort();
};

const assertTransactionToMatchesAllowedTargets = (
  transaction: Record<string, unknown>,
  options: BscWalletConnectSendTransactionOptions | undefined,
): void => {
  const allowedToAddresses = normalizeBscWalletConnectAllowedToAddresses(
    options?.allowedToAddresses,
  );
  if (allowedToAddresses.length === 0) {
    throw new Error(
      "BSC transaction request must declare approved SCCP route contract targets before WalletConnect approval.",
    );
  }
  const to = transaction.to;
  if (typeof to !== "string" || !to.trim()) {
    throw new Error(
      "BSC transaction request must include a non-zero to address.",
    );
  }
  const normalizedTo = normalizeEvmAddress(to);
  if (!allowedToAddresses.includes(normalizedTo)) {
    throw new Error(
      `BSC transaction request to address must match ${
        options?.allowedToAddressLabel || "an approved SCCP route contract"
      }.`,
    );
  }
};

const assertTransactionDataMatchesAllowedSelectors = (
  transaction: Record<string, unknown>,
  options: BscWalletConnectSendTransactionOptions | undefined,
): void => {
  const allowedSelectors = normalizeBscWalletConnectAllowedCallDataSelectors(
    options?.allowedCallDataSelectors,
  );
  if (allowedSelectors.length === 0) {
    throw new Error(
      "BSC transaction request must declare approved SCCP route method selectors before WalletConnect approval.",
    );
  }
  const data = transaction.data;
  if (
    typeof data !== "string" ||
    !BSC_WALLETCONNECT_CALL_DATA_PATTERN.test(data)
  ) {
    throw new Error(
      "BSC transaction request data must be 0x-prefixed byte hex with a 4-byte function selector.",
    );
  }
  if ((data.length - 2) / 2 > BSC_WALLETCONNECT_MAX_CALL_DATA_BYTES) {
    throw new Error(
      `BSC transaction request data must be at most ${BSC_WALLETCONNECT_MAX_CALL_DATA_BYTES} bytes.`,
    );
  }
  const selector = data.slice(0, 10).toLowerCase();
  if (!allowedSelectors.includes(selector)) {
    throw new Error(
      `BSC transaction request call data selector must match ${
        options?.allowedCallDataSelectorLabel || "an approved SCCP route method"
      }.`,
    );
  }
};

export const useBscWalletConnect = () => {
  const stored = readStoredBscWalletConnectSession();
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
      ? `${address.value.slice(0, 6)}...${address.value.slice(-4)}`
      : "",
  );

  const clearSession = () => {
    address.value = "";
    sessionTopic.value = "";
    sessionConnectedAtMs.value = 0;
    writeStoredBscWalletConnectSession(null);
  };

  const currentSnapshot = (): WalletConnectSessionSnapshot | null => {
    if (!address.value || !sessionTopic.value) {
      return null;
    }
    const snapshot = bscWalletConnectSessionFromAddress(
      address.value,
      sessionTopic.value,
    );
    snapshot.connectedAtMs = sessionConnectedAtMs.value;
    return snapshot;
  };

  const persist = () => {
    writeStoredBscWalletConnectSession(currentSnapshot());
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
          throw new Error("BSC E2E wallet harness connect hook is missing.");
        }
        const connectedHarness = await harness.connect();
        const nextAddress = normalizeEvmAddress(
          String(connectedHarness?.address ?? ""),
        );
        const snapshot = bscWalletConnectSessionFromAddress(
          nextAddress,
          requireStoredWalletConnectTopic(
            connectedHarness?.topic ?? "e2e-bsc-wallet-harness",
            "BSC E2E wallet topic",
          ),
        );
        if (
          connectedHarness?.connectedAtMs !== undefined &&
          connectedHarness.connectedAtMs !== null
        ) {
          const connectedAtMs = Number(connectedHarness.connectedAtMs);
          if (!isFreshBscWalletConnectSessionTimestamp(connectedAtMs)) {
            throw new Error("BSC E2E wallet session timestamp is invalid.");
          }
          snapshot.connectedAtMs = connectedAtMs;
        }
        address.value = snapshot.address ?? "";
        sessionTopic.value = snapshot.topic ?? "";
        sessionConnectedAtMs.value = snapshot.connectedAtMs;
        persist();
        return;
      }
      connector = await getConnector();
      const { session } = await connector.connect(
        createBscWalletConnectConnectParams(),
      );
      shouldClearRejectedSession = true;
      const nextAddress = extractBscAddressFromSession(session);
      if (!nextAddress) {
        throw new Error(
          `Connected wallet did not provide a ${SCCP_BSC_NETWORK.label} account.`,
        );
      }
      if (!bscWalletConnectSessionSupportsRequiredSigning(session)) {
        throw new Error(
          "Connected wallet did not approve BSC transaction sending.",
        );
      }
      const snapshot = bscWalletConnectSessionFromAddress(
        nextAddress,
        requireStoredWalletConnectTopic(
          readBscWalletConnectSessionTopic(session),
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

  const sendTransaction = async (
    transaction: Record<string, unknown>,
    options?: BscWalletConnectSendTransactionOptions,
  ) => {
    if (!address.value) {
      throw new Error("Connect a BSC wallet before sending.");
    }
    const transactionForWallet =
      cloneBscWalletConnectTransactionRequest(transaction);
    const snapshot = currentSnapshot();
    if (
      !snapshot ||
      !isFreshBscWalletConnectSessionTimestamp(snapshot.connectedAtMs)
    ) {
      clearSession();
      throw new Error("Reconnect your BSC wallet before sending.");
    }
    const harness = readE2eWalletHarness();
    if (harness) {
      if (typeof harness.sendTransaction !== "function") {
        throw new Error(
          "BSC E2E wallet harness sendTransaction hook is missing.",
        );
      }
      assertTransactionFromMatchesActiveAccount(
        transactionForWallet,
        snapshot.address,
      );
      assertTransactionToMatchesAllowedTargets(transactionForWallet, options);
      assertTransactionDataMatchesAllowedSelectors(
        transactionForWallet,
        options,
      );
      Object.freeze(transactionForWallet);
      return normalizeBscWalletConnectTransactionHash(
        await harness.sendTransaction(transactionForWallet),
      );
    }
    const connector = await getConnector();
    const activeSession = connector.provider.session as
      | WalletConnectSessionLike
      | null
      | undefined;
    let activeAddress: string | null = null;
    let activeTopic: string | null = null;
    try {
      activeAddress = extractBscAddressFromSession(activeSession);
      activeTopic = normalizeStoredWalletConnectTopic(
        readBscWalletConnectSessionTopic(activeSession),
      );
    } catch (sessionError) {
      clearSession();
      throw sessionError;
    }
    if (
      !activeAddress ||
      activeAddress !== snapshot.address ||
      !bscWalletConnectSessionSupportsRequiredSigning(activeSession) ||
      activeTopic !== snapshot.topic
    ) {
      clearSession();
      throw new Error("Reconnect your BSC wallet before sending.");
    }
    assertTransactionFromMatchesActiveAccount(
      transactionForWallet,
      snapshot.address,
    );
    assertTransactionToMatchesAllowedTargets(transactionForWallet, options);
    assertTransactionDataMatchesAllowedSelectors(transactionForWallet, options);
    Object.freeze(transactionForWallet);
    const walletConnectRequest = Object.freeze({
      method: BSC_WALLETCONNECT_SEND_TRANSACTION_METHOD,
      params: Object.freeze([transactionForWallet]),
    });
    const result = await connector.request(
      walletConnectRequest,
      SCCP_BSC_NETWORK.caipChainId,
    );
    return normalizeBscWalletConnectTransactionHash(result);
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
    sendTransaction,
  };
};
