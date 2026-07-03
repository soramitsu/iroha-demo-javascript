import { computed, ref } from "vue";
import { THEME, TonConnectUI } from "@tonconnect/ui";
import {
  CHAIN,
  type SendTransactionRequest,
  type SendTransactionResponse,
} from "@tonconnect/sdk";
import {
  normalizeTonRawAddress,
  SCCP_TON_NETWORK,
  tonWalletConnectSessionFromAddress,
  type WalletConnectSessionSnapshot,
} from "@/utils/sccp";
import { parseJsonWithoutDuplicateObjectKeys } from "@/utils/json";
import { isSecretLikeTextValue } from "@/utils/secretLike";
import { snapshotSccpJsonDataValue } from "@/utils/sccpDataSnapshot";

const STORAGE_KEY = `iroha-demo:sccp:ton-walletconnect:${SCCP_TON_NETWORK.key}`;
const TEST_HARNESS_SESSION_TOPIC = "sccp-ton-testnet-test-signer";
const TONCONNECT_SESSION_TOPIC_PREFIX = "tonconnect";
const TON_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TON_SESSION_FUTURE_SKEW_MS = 5 * 60 * 1000;
const TON_SEND_TRANSACTION_DEFAULT_MAX_MESSAGES = 1;
const TON_SEND_TRANSACTION_HARNESS_DEFAULT_MAX_MESSAGES = 16;
const TON_SEND_TRANSACTION_APP_MAX_MESSAGES = 16;
const TONCONNECT_MANIFEST_URL_ERROR =
  "TON Connect manifest URL must be an HTTPS URL without credentials, query string, or fragment.";
const TON_STORED_SESSION_FIELDS = new Set<string>([
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

type TonWalletHarness = {
  connect?: () => Promise<{
    address?: unknown;
    topic?: unknown;
    connectedAtMs?: unknown;
  }>;
  disconnect?: () => Promise<void>;
  maxMessages?: number | (() => number | Promise<number>);
  sendTransaction?: (transaction: SendTransactionRequest) => Promise<unknown>;
};

declare global {
  interface Window {
    __irohaTonWalletHarness?: TonWalletHarness;
  }
}

const runtimeTonE2eWalletEnabled = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.iroha?.getRuntimeConfig?.().sccpTonE2eWallet === "1";
  } catch (_error) {
    return false;
  }
};

const tonHarnessEnabled = (): boolean =>
  import.meta.env.VITE_SCCP_TON_E2E_WALLET === "1" ||
  runtimeTonE2eWalletEnabled();

const readHarness = (): TonWalletHarness | null => {
  if (!tonHarnessEnabled() || typeof window === "undefined") {
    return null;
  }
  const harness = window.__irohaTonWalletHarness;
  return typeof harness === "object" && harness !== null ? harness : null;
};

const hasUnsafeUrlTextCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

export const normalizeTonConnectManifestUrl = (
  value: unknown,
): string | null => {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  if (text.length > 2048 || hasUnsafeUrlTextCharacter(text)) {
    throw new Error(TONCONNECT_MANIFEST_URL_ERROR);
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch (_error) {
    throw new Error(TONCONNECT_MANIFEST_URL_ERROR);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(TONCONNECT_MANIFEST_URL_ERROR);
  }
  return url.toString();
};

const readRuntimeTonConnectManifestUrl = (): string => {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.iroha?.getRuntimeConfig?.().sccpTonConnectManifestUrl ?? "";
  } catch (_error) {
    return "";
  }
};

const readConfiguredManifestUrl = (): {
  manifestUrl: string;
  error: string;
} => {
  try {
    return {
      manifestUrl:
        normalizeTonConnectManifestUrl(
          import.meta.env.VITE_SCCP_TONCONNECT_MANIFEST_URL ||
            readRuntimeTonConnectManifestUrl(),
        ) ?? "",
      error: "",
    };
  } catch (error) {
    return {
      manifestUrl: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const sanitizeTopic = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("Stored TON session topic must be text.");
  }
  const topic = value.trim();
  if (
    topic.length === 0 ||
    topic.length > 256 ||
    containsSecretLikeText(topic)
  ) {
    throw new Error("Stored TON session topic is invalid.");
  }
  for (let index = 0; index < topic.length; index += 1) {
    const code = topic.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      throw new Error("Stored TON session topic is invalid.");
    }
  }
  return topic;
};

const normalizeSession = (value: unknown): WalletConnectSessionSnapshot => {
  const snapshot = snapshotSccpJsonDataValue(value, "TON wallet session");
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    Array.isArray(snapshot)
  ) {
    throw new Error("TON wallet session must be stored as an object.");
  }
  const record = snapshot as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!TON_STORED_SESSION_FIELDS.has(key)) {
      throw new Error("TON wallet session contains unsupported metadata.");
    }
  }
  const address = normalizeTonRawAddress(String(record.address ?? ""));
  const topic = sanitizeTopic(record.topic);
  const chainId = String(record.chainId ?? "").trim();
  if (chainId !== SCCP_TON_NETWORK.caipChainId) {
    throw new Error("Stored TON session targets a different network.");
  }
  if (record.namespace !== "ton" || record.methodVersion !== "tonconnect-v1") {
    throw new Error("Stored TON session uses an unsupported signing method.");
  }
  const connectedAtMs = Number(record.connectedAtMs);
  const now = Date.now();
  if (
    !Number.isFinite(connectedAtMs) ||
    connectedAtMs <= 0 ||
    connectedAtMs > now + TON_SESSION_FUTURE_SKEW_MS ||
    now - connectedAtMs > TON_SESSION_MAX_AGE_MS
  ) {
    throw new Error("Stored TON session has expired.");
  }
  return {
    topic,
    address,
    chainId,
    namespace: "ton",
    methodVersion: "tonconnect-v1",
    connectedAtMs,
  };
};

const loadStoredSession = (): WalletConnectSessionSnapshot | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return normalizeSession(
      parseJsonWithoutDuplicateObjectKeys(raw, "TON wallet session"),
    );
  } catch (_error) {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

const storeSession = (session: WalletConnectSessionSnapshot | null): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

const shortAddress = (value: string): string =>
  value.length > 22 ? `${value.slice(0, 8)}...${value.slice(-8)}` : value;

let tonConnectUiPromise: Promise<TonConnectUI> | null = null;
let tonConnectUiManifestUrl = "";

const createTonConnectUi = (manifestUrl: string): TonConnectUI => {
  const ui = new TonConnectUI({
    manifestUrl,
    buttonRootId: null,
    restoreConnection: true,
    uiPreferences: {
      theme: THEME.DARK,
      borderRadius: "s",
    },
    actionsConfiguration: {
      modals: ["before", "error"],
      notifications: ["error"],
      returnStrategy: "back",
    },
  });
  ui.setConnectionNetwork(CHAIN.TESTNET);
  return ui;
};

const getTonConnectUi = async (): Promise<TonConnectUI> => {
  const { manifestUrl, error: manifestError } = readConfiguredManifestUrl();
  if (manifestError) {
    throw new Error(manifestError);
  }
  if (!manifestUrl) {
    throw new Error("TON Connect manifest URL is not configured.");
  }
  if (!tonConnectUiPromise || tonConnectUiManifestUrl !== manifestUrl) {
    tonConnectUiManifestUrl = manifestUrl;
    tonConnectUiPromise = Promise.resolve(createTonConnectUi(manifestUrl));
  }
  const ui = await tonConnectUiPromise;
  ui.setConnectionNetwork(CHAIN.TESTNET);
  return ui;
};

const sessionFromTonConnectUi = (
  ui: TonConnectUI,
): WalletConnectSessionSnapshot | null => {
  const account = ui.account;
  if (!account) {
    return null;
  }
  if (account.chain !== CHAIN.TESTNET) {
    throw new Error(
      `Connected TON wallet is on chain ${String(
        account.chain,
      )}; reconnect a TON testnet wallet.`,
    );
  }
  const address = normalizeTonRawAddress(account.address);
  return tonWalletConnectSessionFromAddress(
    address,
    `${TONCONNECT_SESSION_TOPIC_PREFIX}:${SCCP_TON_NETWORK.caipChainId}:${address}`,
  );
};

const normalizeTonSendTransactionMaxMessages = (
  value: unknown,
  fallback: number,
): number => {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(numeric, TON_SEND_TRANSACTION_APP_MAX_MESSAGES));
};

const readTonWalletSendTransactionMaxMessages = (wallet: unknown): number => {
  if (!wallet || typeof wallet !== "object") {
    return TON_SEND_TRANSACTION_DEFAULT_MAX_MESSAGES;
  }
  const device = (wallet as { device?: unknown }).device;
  if (!device || typeof device !== "object") {
    return TON_SEND_TRANSACTION_DEFAULT_MAX_MESSAGES;
  }
  const features = (device as { features?: unknown }).features;
  if (!Array.isArray(features)) {
    return TON_SEND_TRANSACTION_DEFAULT_MAX_MESSAGES;
  }
  const sendTransactionFeature = features.find(
    (feature): feature is { name: string; maxMessages?: unknown } =>
      typeof feature === "object" &&
      feature !== null &&
      (feature as { name?: unknown }).name === "SendTransaction",
  );
  return normalizeTonSendTransactionMaxMessages(
    sendTransactionFeature?.maxMessages,
    TON_SEND_TRANSACTION_DEFAULT_MAX_MESSAGES,
  );
};

const readHarnessMaxMessages = async (
  harness: TonWalletHarness | null,
): Promise<number> => {
  if (!harness) {
    return TON_SEND_TRANSACTION_DEFAULT_MAX_MESSAGES;
  }
  if (typeof harness.maxMessages === "function") {
    return normalizeTonSendTransactionMaxMessages(
      await harness.maxMessages(),
      TON_SEND_TRANSACTION_HARNESS_DEFAULT_MAX_MESSAGES,
    );
  }
  return normalizeTonSendTransactionMaxMessages(
    harness.maxMessages,
    TON_SEND_TRANSACTION_HARNESS_DEFAULT_MAX_MESSAGES,
  );
};

const assertTonTransactionRequest = (
  transaction: SendTransactionRequest,
  fromAddress: string,
  maxMessages = TON_SEND_TRANSACTION_DEFAULT_MAX_MESSAGES,
): SendTransactionRequest => {
  const snapshot = snapshotSccpJsonDataValue(
    transaction,
    "TON transaction request",
  ) as SendTransactionRequest;
  if (snapshot.network && snapshot.network !== CHAIN.TESTNET) {
    throw new Error("TON transaction request must target TON testnet.");
  }
  if (snapshot.from && normalizeTonRawAddress(snapshot.from) !== fromAddress) {
    throw new Error(
      "TON transaction request sender does not match the connected wallet.",
    );
  }
  const validUntil = Number(snapshot.validUntil);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(validUntil) ||
    validUntil <= nowSeconds ||
    validUntil > nowSeconds + 60 * 60
  ) {
    throw new Error("TON transaction request validUntil is outside bounds.");
  }
  if (!("messages" in snapshot) || !Array.isArray(snapshot.messages)) {
    throw new Error("TON transaction request must include raw messages.");
  }
  if (snapshot.messages.length < 1 || snapshot.messages.length > maxMessages) {
    throw new Error(
      `TON bridge transactions must contain between 1 and ${maxMessages} message(s).`,
    );
  }
  for (const message of snapshot.messages) {
    if (
      typeof message.address !== "string" ||
      !message.address.trim() ||
      typeof message.amount !== "string" ||
      !/^(?:0|[1-9]\d*)$/u.test(message.amount) ||
      BigInt(message.amount) <= 0n
    ) {
      throw new Error("TON transaction message is invalid.");
    }
    if (
      message.payload !== undefined &&
      (typeof message.payload !== "string" || !message.payload.trim())
    ) {
      throw new Error("TON transaction message payload is invalid.");
    }
  }
  return {
    ...snapshot,
    network: CHAIN.TESTNET,
    from: fromAddress,
  };
};

export const useTonWalletConnect = () => {
  const session = ref<WalletConnectSessionSnapshot | null>(loadStoredSession());
  const connecting = ref(false);
  const disconnecting = ref(false);
  const error = ref("");

  const connected = computed(() => Boolean(session.value?.address));
  const address = computed(() => session.value?.address ?? "");
  const projectConfigured = computed(() => {
    const configured = readConfiguredManifestUrl();
    return Boolean(configured.manifestUrl || readHarness());
  });
  const projectConfigurationError = computed(() => {
    const configured = readConfiguredManifestUrl();
    if (configured.error) {
      return configured.error;
    }
    return tonHarnessEnabled() && !readHarness()
      ? "TON E2E wallet harness is enabled but not installed."
      : "";
  });
  const short = computed(() =>
    address.value ? shortAddress(address.value) : "",
  );

  const connectTonConnect = async (): Promise<void> => {
    const ui = await getTonConnectUi();
    await ui.connectionRestored.catch(() => false);
    if (!ui.connected) {
      await ui.connectWallet();
    }
    const nextSession = sessionFromTonConnectUi(ui);
    if (!nextSession) {
      throw new Error("TON wallet connection did not expose an account.");
    }
    session.value = nextSession;
    storeSession(nextSession);
  };

  const connectWithConfiguredProvider = async (): Promise<void> => {
    const harness = readHarness();
    if (harness?.connect) {
      const result = await harness.connect();
      const nextSession = tonWalletConnectSessionFromAddress(
        String(result?.address ?? ""),
        sanitizeTopic(result?.topic) ?? TEST_HARNESS_SESSION_TOPIC,
      );
      session.value = {
        ...nextSession,
        connectedAtMs: Number.isFinite(Number(result?.connectedAtMs))
          ? Number(result?.connectedAtMs)
          : nextSession.connectedAtMs,
      };
      storeSession(session.value);
      return;
    }
    await connectTonConnect();
  };

  const disconnect = async (): Promise<void> => {
    disconnecting.value = true;
    error.value = "";
    try {
      const harness = readHarness();
      if (harness?.disconnect) {
        await harness.disconnect();
      } else if (tonConnectUiPromise) {
        const ui = await tonConnectUiPromise;
        if (ui.connected) {
          await ui.disconnect();
        }
      }
    } catch (disconnectError) {
      error.value =
        disconnectError instanceof Error
          ? disconnectError.message
          : String(disconnectError);
    } finally {
      session.value = null;
      storeSession(null);
      disconnecting.value = false;
    }
  };

  const sendTransaction = async (
    transaction: SendTransactionRequest,
  ): Promise<SendTransactionResponse | unknown> => {
    error.value = "";
    const harness = readHarness();
    if (harness?.sendTransaction) {
      const fromAddress = normalizeTonRawAddress(address.value);
      const maxMessages = await readHarnessMaxMessages(harness);
      return harness.sendTransaction(
        assertTonTransactionRequest(transaction, fromAddress, maxMessages),
      );
    }
    const ui = await getTonConnectUi();
    await ui.connectionRestored.catch(() => false);
    const nextSession = sessionFromTonConnectUi(ui);
    if (!nextSession) {
      throw new Error("Connect a TON wallet before sending a transaction.");
    }
    if (
      session.value?.address &&
      normalizeTonRawAddress(session.value.address) !== nextSession.address
    ) {
      throw new Error(
        "Connected TON wallet changed; reconnect before submitting the bridge transaction.",
      );
    }
    session.value = nextSession;
    storeSession(nextSession);
    const maxMessages = readTonWalletSendTransactionMaxMessages(ui.wallet);
    return ui.sendTransaction(
      assertTonTransactionRequest(
        transaction,
        nextSession.address ?? "",
        maxMessages,
      ),
      {
        modals: ["before", "error"],
        notifications: ["error"],
        returnStrategy: "back",
      },
    );
  };

  const resolveMaxMessages = async (): Promise<number> => {
    const harness = readHarness();
    if (harness) {
      return readHarnessMaxMessages(harness);
    }
    const ui = await getTonConnectUi();
    await ui.connectionRestored.catch(() => false);
    return readTonWalletSendTransactionMaxMessages(ui.wallet);
  };

  return {
    connected,
    connecting,
    disconnecting,
    error,
    address,
    shortAddress: short,
    projectConfigured,
    projectConfigurationError,
    connect: async () => {
      error.value = "";
      connecting.value = true;
      try {
        await connectWithConfiguredProvider();
      } catch (connectError) {
        session.value = null;
        storeSession(null);
        error.value =
          connectError instanceof Error
            ? connectError.message
            : String(connectError);
      } finally {
        connecting.value = false;
      }
    },
    disconnect,
    sendTransaction,
    resolveMaxMessages,
  };
};
