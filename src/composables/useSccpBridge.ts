import { computed, ref, unref, type MaybeRef } from "vue";
import { useSessionStore } from "@/stores/session";
import {
  fetchAccountAssets,
  getParameters,
  getSccpCapabilities,
  getSccpProofManifests,
  getSccpSoraOutboundMaterial,
  listSccpRecentMessages,
} from "@/services/iroha";
import {
  classifySccpRouteLoadFailure,
  mergeSccpLaneMaterialsIntoManifestSet,
  pickSolanaSccpManifest,
  resolveSccpRouteReadiness,
  SCCP_SOLANA_XOR_ROUTE_ID,
  SCCP_SOLANA_XOR_ROUTE_REVISION,
  SCCP_XOR_ROUTE,
  type SccpRouteConfig,
  type SccpRouteLoadFailure,
  type SccpRouteReadiness,
} from "@/utils/sccp";
import type {
  AccountAssetItem,
  SccpCapabilitiesResponse,
  SccpProofManifestSetResponse,
  SccpSoraOutboundMaterialResponse,
} from "@/types/iroha";

const exactSolanaRouteAllowsOutboundMaterial = (
  manifestSet: unknown,
): boolean => {
  try {
    const route = pickSolanaSccpManifest(manifestSet, "testnet");
    if (!route) {
      return false;
    }
    const lane = route.lane_id;
    const activation = route.activation;
    if (
      typeof lane !== "object" ||
      lane === null ||
      Array.isArray(lane) ||
      typeof activation !== "object" ||
      activation === null ||
      Array.isArray(activation)
    ) {
      return false;
    }
    const laneRecord = lane as Record<string, unknown>;
    const source = laneRecord.source as Record<string, unknown> | undefined;
    const target = laneRecord.target as Record<string, unknown> | undefined;
    const activationRecord = activation as Record<string, unknown>;
    return (
      route.route_id === SCCP_SOLANA_XOR_ROUTE_ID &&
      route.asset_key === "xor" &&
      route.revision === SCCP_SOLANA_XOR_ROUTE_REVISION &&
      source?.network === "solana_testnet" &&
      source?.profile === null &&
      target?.network === "sora_taira" &&
      target?.profile === null &&
      activationRecord.direction === null &&
      activationRecord.activation === "bidirectional"
    );
  } catch {
    return false;
  }
};

export type SccpBridgeState = {
  route: SccpRouteConfig;
  readiness: SccpRouteReadiness;
  capabilities: SccpCapabilitiesResponse | null;
  manifestSet: SccpProofManifestSetResponse | null;
  soraOutboundMaterial: SccpSoraOutboundMaterialResponse | null;
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
  const soraOutboundMaterial = ref<SccpSoraOutboundMaterialResponse | null>(
    null,
  );
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
    soraOutboundMaterial.value = null;
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
      soraOutboundMaterial: soraOutboundMaterial.value,
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
    soraOutboundMaterial: soraOutboundMaterial.value,
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
    soraOutboundMaterial.value = null;
    loading.value = true;
    try {
      const activeRoute = unref(route);
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
      let nextSoraOutboundMaterial: SccpSoraOutboundMaterialResponse | null =
        null;
      let nextMaterialFailure: SccpRouteLoadFailure | null = null;
      if (
        activeRoute.counterparty === "solana" &&
        exactSolanaRouteAllowsOutboundMaterial(nextManifestSet)
      ) {
        try {
          nextSoraOutboundMaterial = await getSccpSoraOutboundMaterial({
            toriiUrl,
            sourceProfile: "solana-testnet",
            routeId: SCCP_SOLANA_XOR_ROUTE_ID,
            assetKey: activeRoute.assetKey,
            revision: SCCP_SOLANA_XOR_ROUTE_REVISION,
          });
        } catch (materialError) {
          const classified = classifySccpRouteLoadFailure(materialError, {
            toriiUrl,
            stage: "manifest",
          });
          // An exact route-scoped endpoint intentionally returns 404 when the
          // route is not outbound-enabled or governed material is unavailable.
          // Preserve the authoritative registry and let readiness fail closed
          // on the missing material instead of misreporting total route loss.
          if (classified.status !== 404) {
            nextMaterialFailure = classified;
          }
        }
      }
      if (
        refreshSerial !== routeRefreshSerial ||
        connectionKey !== currentConnectionKey()
      ) {
        return;
      }
      capabilities.value = nextCapabilities;
      manifestSet.value = nextManifestSet;
      soraOutboundMaterial.value = nextSoraOutboundMaterial;
      routeLoadFailure.value = nextMaterialFailure;
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
      soraOutboundMaterial.value = null;
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
    soraOutboundMaterial,
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
