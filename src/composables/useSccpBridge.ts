import { computed, ref, unref, type MaybeRef } from "vue";
import { useSessionStore } from "@/stores/session";
import {
  fetchAccountAssets,
  getParameters,
  getSccpCapabilities,
  getSccpProofManifests,
  listSccpRecentMessages,
} from "@/services/iroha";
import {
  classifySccpRouteLoadFailure,
  mergeSccpLaneMaterialsIntoManifestSet,
  resolveSccpRouteReadiness,
  SCCP_XOR_ROUTE,
  type SccpRouteConfig,
  type SccpRouteLoadFailure,
  type SccpRouteReadiness,
} from "@/utils/sccp";
import type {
  AccountAssetItem,
  SccpCapabilitiesResponse,
  SccpProofManifestSetResponse,
} from "@/types/iroha";

export type SccpBridgeState = {
  route: SccpRouteConfig;
  readiness: SccpRouteReadiness;
  capabilities: SccpCapabilitiesResponse | null;
  manifestSet: SccpProofManifestSetResponse | null;
  routeLoadFailure: SccpRouteLoadFailure | null;
  parameters: Record<string, unknown> | null;
  recentMessages: Record<string, unknown>[];
  balances: AccountAssetItem[];
  loading: boolean;
  balanceLoading: boolean;
  error: string;
};

export const useSccpBridge = (
  route: MaybeRef<SccpRouteConfig> = SCCP_XOR_ROUTE,
) => {
  const session = useSessionStore();
  const capabilities = ref<SccpCapabilitiesResponse | null>(null);
  const manifestSet = ref<SccpProofManifestSetResponse | null>(null);
  const routeLoadFailure = ref<SccpRouteLoadFailure | null>(null);
  const parameters = ref<Record<string, unknown> | null>(null);
  const recentMessages = ref<Record<string, unknown>[]>([]);
  const balances = ref<AccountAssetItem[]>([]);
  const loading = ref(false);
  const balanceLoading = ref(false);
  const error = ref("");
  let routeRefreshSerial = 0;
  let balanceRefreshSerial = 0;

  const currentConnectionKey = () =>
    [
      session.connection.toriiUrl,
      session.connection.chainId,
      session.connection.networkPrefix,
    ].join("\n");

  const resetState = () => {
    routeRefreshSerial += 1;
    balanceRefreshSerial += 1;
    capabilities.value = null;
    manifestSet.value = null;
    routeLoadFailure.value = null;
    parameters.value = null;
    recentMessages.value = [];
    balances.value = [];
    loading.value = false;
    balanceLoading.value = false;
    error.value = "";
  };

  const readiness = computed(() =>
    resolveSccpRouteReadiness({
      connection: session.connection,
      capabilities: capabilities.value,
      manifestSet: mergeSccpLaneMaterialsIntoManifestSet(
        manifestSet.value,
        parameters.value,
        import.meta.env.VITE_SCCP_BSC_NETWORK || "testnet",
        import.meta.env.VITE_SCCP_TON_NETWORK || "testnet",
        import.meta.env.VITE_SCCP_SOLANA_NETWORK || "testnet",
      ) as Record<string, unknown> | null,
      route: unref(route),
      loadFailure: routeLoadFailure.value,
      bscNetwork: import.meta.env.VITE_SCCP_BSC_NETWORK || "testnet",
      tonNetwork: import.meta.env.VITE_SCCP_TON_NETWORK || "testnet",
      solanaNetwork: import.meta.env.VITE_SCCP_SOLANA_NETWORK || "testnet",
    }),
  );

  const snapshot = computed<SccpBridgeState>(() => ({
    route: unref(route),
    readiness: readiness.value,
    capabilities: capabilities.value,
    manifestSet: manifestSet.value,
    routeLoadFailure: routeLoadFailure.value,
    parameters: parameters.value,
    recentMessages: recentMessages.value,
    balances: balances.value,
    loading: loading.value,
    balanceLoading: balanceLoading.value,
    error: error.value,
  }));

  const refreshRecentMessages = async (
    refreshSerial: number,
    connectionKey: string,
  ) => {
    try {
      const nextRecentMessages = await listSccpRecentMessages({
        toriiUrl: session.connection.toriiUrl,
        routeId: unref(route).id,
        limit: 8,
      });
      if (
        refreshSerial !== routeRefreshSerial ||
        connectionKey !== currentConnectionKey()
      ) {
        return;
      }
      recentMessages.value = nextRecentMessages.items;
    } catch {
      if (
        refreshSerial !== routeRefreshSerial ||
        connectionKey !== currentConnectionKey()
      ) {
        return;
      }
      recentMessages.value = [];
    }
  };

  const refreshRoute = async () => {
    const refreshSerial = (routeRefreshSerial += 1);
    const connectionKey = currentConnectionKey();
    const toriiUrl = session.connection.toriiUrl;
    error.value = "";
    routeLoadFailure.value = null;
    loading.value = true;
    try {
      const [capabilitiesResult, manifestsResult, parametersResult] =
        await Promise.allSettled([
          getSccpCapabilities({ toriiUrl }),
          getSccpProofManifests({ toriiUrl }),
          getParameters({ toriiUrl }),
        ]);
      if (capabilitiesResult.status === "rejected") {
        throw classifySccpRouteLoadFailure(capabilitiesResult.reason, {
          toriiUrl,
          stage: "capabilities",
        });
      }
      if (manifestsResult.status === "rejected") {
        throw classifySccpRouteLoadFailure(manifestsResult.reason, {
          toriiUrl,
          stage: "manifest",
        });
      }
      const nextCapabilities = capabilitiesResult.value;
      const nextManifestSet = manifestsResult.value;
      const nextParameters =
        parametersResult.status === "fulfilled" ? parametersResult.value : null;
      if (
        refreshSerial !== routeRefreshSerial ||
        connectionKey !== currentConnectionKey()
      ) {
        return;
      }
      capabilities.value = nextCapabilities;
      manifestSet.value = nextManifestSet;
      routeLoadFailure.value = null;
      parameters.value = nextParameters;
      void refreshRecentMessages(refreshSerial, connectionKey);
    } catch (routeError) {
      if (
        refreshSerial !== routeRefreshSerial ||
        connectionKey !== currentConnectionKey()
      ) {
        return;
      }
      capabilities.value = null;
      manifestSet.value = null;
      routeLoadFailure.value =
        routeError &&
        typeof routeError === "object" &&
        "kind" in routeError &&
        "message" in routeError
          ? (routeError as SccpRouteLoadFailure)
          : classifySccpRouteLoadFailure(routeError, {
              toriiUrl,
              stage: "capabilities",
            });
      parameters.value = null;
      recentMessages.value = [];
      error.value = "";
    } finally {
      if (
        refreshSerial === routeRefreshSerial &&
        connectionKey === currentConnectionKey()
      ) {
        loading.value = false;
      }
    }
  };

  const refreshBalances = async () => {
    const accountId = session.activeAccount?.accountId;
    if (!accountId) {
      balances.value = [];
      return;
    }
    const refreshSerial = (balanceRefreshSerial += 1);
    const connectionKey = currentConnectionKey();
    const toriiUrl = session.connection.toriiUrl;
    const networkPrefix = session.connection.networkPrefix;
    balanceLoading.value = true;
    try {
      const response = await fetchAccountAssets({
        toriiUrl,
        accountId,
        networkPrefix,
        limit: 50,
      });
      if (
        refreshSerial !== balanceRefreshSerial ||
        connectionKey !== currentConnectionKey()
      ) {
        return;
      }
      balances.value = response.items;
    } catch (balanceError) {
      if (
        refreshSerial !== balanceRefreshSerial ||
        connectionKey !== currentConnectionKey()
      ) {
        return;
      }
      balances.value = [];
      error.value =
        balanceError instanceof Error
          ? balanceError.message
          : String(balanceError);
    } finally {
      if (
        refreshSerial === balanceRefreshSerial &&
        connectionKey === currentConnectionKey()
      ) {
        balanceLoading.value = false;
      }
    }
  };

  return {
    capabilities,
    manifestSet,
    routeLoadFailure,
    parameters,
    recentMessages,
    balances,
    loading,
    balanceLoading,
    error,
    readiness,
    snapshot,
    resetState,
    refreshRoute,
    refreshBalances,
  };
};
