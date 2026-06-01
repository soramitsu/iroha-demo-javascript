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
    error.value = "";
    loading.value = true;
    try {
      const [nextCapabilities, nextManifestSet, nextRecentMessages] =
        await Promise.all([
          getSccpCapabilities({ toriiUrl: session.connection.toriiUrl }),
          getSccpProofManifests({ toriiUrl: session.connection.toriiUrl }),
          listSccpRecentMessages({
            toriiUrl: session.connection.toriiUrl,
            routeId: SCCP_XOR_ROUTE.id,
            limit: 8,
          }).catch(() => ({ items: [], total: 0 })),
        ]);
      capabilities.value = nextCapabilities;
      manifestSet.value = nextManifestSet;
      recentMessages.value = nextRecentMessages.items;
    } catch (routeError) {
      error.value =
        routeError instanceof Error ? routeError.message : String(routeError);
    } finally {
      loading.value = false;
    }
  };

  const refreshBalances = async () => {
    const accountId = session.activeAccount?.accountId;
    if (!accountId) {
      balances.value = [];
      return;
    }
    balanceLoading.value = true;
    try {
      const response = await fetchAccountAssets({
        toriiUrl: session.connection.toriiUrl,
        accountId,
        networkPrefix: session.connection.networkPrefix,
        limit: 50,
      });
      balances.value = response.items;
    } catch (balanceError) {
      balances.value = [];
      error.value =
        balanceError instanceof Error
          ? balanceError.message
          : String(balanceError);
    } finally {
      balanceLoading.value = false;
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
    refreshRoute,
    refreshBalances,
  };
};
