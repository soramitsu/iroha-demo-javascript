import { computed, ref } from "vue";
import { useSessionStore } from "@/stores/session";
import {
  fetchAccountAssets,
  getSccpCapabilities,
  getSccpProofManifests,
  listSccpRecentMessages,
} from "@/services/iroha";
import {
  resolveSccpRouteReadiness,
  SCCP_XOR_ROUTE,
  type SccpRouteReadiness,
} from "@/utils/sccp";
import type {
  AccountAssetItem,
  SccpCapabilitiesResponse,
  SccpProofManifestSetResponse,
} from "@/types/iroha";

export type SccpBridgeState = {
  route: typeof SCCP_XOR_ROUTE;
  readiness: SccpRouteReadiness;
  capabilities: SccpCapabilitiesResponse | null;
  manifestSet: SccpProofManifestSetResponse | null;
  recentMessages: Record<string, unknown>[];
  balances: AccountAssetItem[];
  loading: boolean;
  balanceLoading: boolean;
  error: string;
};

export const useSccpBridge = () => {
  const session = useSessionStore();
  const capabilities = ref<SccpCapabilitiesResponse | null>(null);
  const manifestSet = ref<SccpProofManifestSetResponse | null>(null);
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
      manifestSet: manifestSet.value,
    }),
  );

  const snapshot = computed<SccpBridgeState>(() => ({
    route: SCCP_XOR_ROUTE,
    readiness: readiness.value,
    capabilities: capabilities.value,
    manifestSet: manifestSet.value,
    recentMessages: recentMessages.value,
    balances: balances.value,
    loading: loading.value,
    balanceLoading: balanceLoading.value,
    error: error.value,
  }));

  const refreshRoute = async () => {
    const refreshSerial = (routeRefreshSerial += 1);
    const connectionKey = currentConnectionKey();
    const toriiUrl = session.connection.toriiUrl;
    error.value = "";
    loading.value = true;
    try {
      const [nextCapabilities, nextManifestSet, nextRecentMessages] =
        await Promise.all([
          getSccpCapabilities({ toriiUrl }),
          getSccpProofManifests({ toriiUrl }),
          listSccpRecentMessages({
            toriiUrl,
            routeId: SCCP_XOR_ROUTE.id,
            limit: 8,
          }).catch(() => ({ items: [], total: 0 })),
        ]);
      if (
        refreshSerial !== routeRefreshSerial ||
        connectionKey !== currentConnectionKey()
      ) {
        return;
      }
      capabilities.value = nextCapabilities;
      manifestSet.value = nextManifestSet;
      recentMessages.value = nextRecentMessages.items;
    } catch (routeError) {
      if (
        refreshSerial !== routeRefreshSerial ||
        connectionKey !== currentConnectionKey()
      ) {
        return;
      }
      capabilities.value = null;
      manifestSet.value = null;
      recentMessages.value = [];
      error.value =
        routeError instanceof Error ? routeError.message : String(routeError);
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
