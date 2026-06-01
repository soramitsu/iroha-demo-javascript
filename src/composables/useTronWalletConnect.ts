import { computed, ref } from "vue";
import type { CustomCaipNetwork } from "@reown/appkit-universal-connector";
import type { UniversalConnector } from "@reown/appkit-universal-connector";
import {
  normalizeTronAddress,
  TRON_MAINNET_CAIP_CHAIN_ID,
  TRON_MAINNET_CHAIN_ID_HEX,
  TRON_MAINNET_RPC_URL,
  WALLETCONNECT_TRON_METHOD_VERSION,
  WALLETCONNECT_TRON_NAMESPACE,
  WALLETCONNECT_TRON_SIGN_METHOD,
  walletConnectSessionFromAddress,
  type WalletConnectSessionSnapshot,
} from "@/utils/sccp";

const STORAGE_KEY = "iroha-demo:sccp:tron-walletconnect";

type WalletConnectSessionLike = {
  topic?: string;
  namespaces?: Record<string, { accounts?: string[]; methods?: string[] }>;
  sessionProperties?: Record<string, unknown>;
};

const getConfiguredProjectId = (): string =>
  String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "").trim();

let connectorPromise: Promise<UniversalConnector> | null = null;
let connectorProjectId = "";

const tronMainnet = {
  id: Number.parseInt(TRON_MAINNET_CHAIN_ID_HEX.slice(2), 16),
  chainNamespace: WALLETCONNECT_TRON_NAMESPACE,
  caipNetworkId: TRON_MAINNET_CAIP_CHAIN_ID,
  name: "TRON Mainnet",
  nativeCurrency: {
    name: "TRON",
    symbol: "TRX",
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: [TRON_MAINNET_RPC_URL],
    },
  },
} satisfies CustomCaipNetwork<typeof WALLETCONNECT_TRON_NAMESPACE>;

export const walletConnectProjectId = getConfiguredProjectId();

export const extractTronAddressFromSession = (
  session: WalletConnectSessionLike | null | undefined,
): string | null => {
  const accounts =
    session?.namespaces?.[WALLETCONNECT_TRON_NAMESPACE]?.accounts ?? [];
  if (!Array.isArray(accounts)) {
    return null;
  }
  const account = accounts.find(
    (item) =>
      typeof item === "string" &&
      item.startsWith(`${TRON_MAINNET_CAIP_CHAIN_ID}:`),
  );
  if (!account) {
    return null;
  }
  const address = account.slice(`${TRON_MAINNET_CAIP_CHAIN_ID}:`.length);
  return normalizeTronAddress(address);
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
  if (snapshot.topic && snapshot.topic !== session?.topic) {
    return false;
  }
  return true;
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
        parsed.chainId !== TRON_MAINNET_CAIP_CHAIN_ID ||
        parsed.namespace !== WALLETCONNECT_TRON_NAMESPACE ||
        parsed.methodVersion !== WALLETCONNECT_TRON_METHOD_VERSION
      ) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      const snapshot = walletConnectSessionFromAddress(
        parsed.address,
        parsed.topic,
      );
      const connectedAtMs = Number(parsed.connectedAtMs);
      if (Number.isSafeInteger(connectedAtMs) && connectedAtMs > 0) {
        snapshot.connectedAtMs = connectedAtMs;
      }
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
};

const getConnector = async (): Promise<UniversalConnector> => {
  const projectId = getConfiguredProjectId();
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
              namespace: WALLETCONNECT_TRON_NAMESPACE,
              chains: [tronMainnet],
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
        }
        throw error;
      });
  }
  return connectorPromise;
};

export const useTronWalletConnect = () => {
  const stored = readStoredTronWalletConnectSession();
  const address = ref(stored?.address ?? "");
  const sessionTopic = ref(stored?.topic ?? "");
  const connecting = ref(false);
  const disconnecting = ref(false);
  const error = ref("");

  const connected = computed(() => Boolean(address.value));
  const projectConfigured = computed(() => Boolean(getConfiguredProjectId()));
  const projectId = computed(() => getConfiguredProjectId());
  const shortAddress = computed(() =>
    address.value
      ? `${address.value.slice(0, 6)}...${address.value.slice(-6)}`
      : "",
  );

  const persist = () => {
    writeStoredTronWalletConnectSession(
      address.value
        ? walletConnectSessionFromAddress(
            address.value,
            sessionTopic.value || null,
          )
        : null,
    );
  };

  const connect = async () => {
    error.value = "";
    connecting.value = true;
    try {
      const connector = await getConnector();
      const { session } = await connector.connect({
        sessionProperties: {
          tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
        },
      });
      const nextAddress = extractTronAddressFromSession(session);
      if (!nextAddress) {
        throw new Error(
          "Connected wallet did not provide a TRON mainnet account.",
        );
      }
      if (!tronWalletConnectSessionSupportsRequiredSigning(session)) {
        throw new Error(
          "Connected wallet did not approve TRON v1 transaction signing.",
        );
      }
      address.value = nextAddress;
      sessionTopic.value = session.topic ?? "";
      persist();
    } catch (connectError) {
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
      const connector = connectorPromise ? await connectorPromise : null;
      await connector?.disconnect();
    } catch (disconnectError) {
      error.value =
        disconnectError instanceof Error
          ? disconnectError.message
          : String(disconnectError);
    } finally {
      address.value = "";
      sessionTopic.value = "";
      writeStoredTronWalletConnectSession(null);
      disconnecting.value = false;
    }
  };

  const signTransaction = async (transaction: Record<string, unknown>) => {
    if (!address.value) {
      throw new Error("Connect a TRON wallet before signing.");
    }
    const connector = await getConnector();
    const activeSession = connector.provider.session as
      | WalletConnectSessionLike
      | null
      | undefined;
    const snapshot = walletConnectSessionFromAddress(
      address.value,
      sessionTopic.value || null,
    );
    if (!tronWalletConnectSessionMatchesSnapshot(activeSession, snapshot)) {
      address.value = "";
      sessionTopic.value = "";
      writeStoredTronWalletConnectSession(null);
      throw new Error("Reconnect your TRON wallet before signing.");
    }
    return connector.request(
      {
        method: WALLETCONNECT_TRON_SIGN_METHOD,
        params: {
          address: address.value,
          transaction,
        },
      },
      TRON_MAINNET_CAIP_CHAIN_ID,
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
    projectId,
    shortAddress,
    connect,
    disconnect,
    signTransaction,
  };
};
