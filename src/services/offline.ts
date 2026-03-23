import { listOfflineAllowances } from "./iroha";
import type { OfflineAllowanceItem } from "@/types/iroha";
import { sumAllowances } from "@/utils/offline";

export type OfflineAllowanceSnapshot = {
  total: string;
  syncedAtMs: number;
  nextPolicyExpiryMs: number | null;
  nextRefreshMs: number | null;
  allowances: OfflineAllowanceItem[];
};

export const fetchOfflineAllowances = async (params: {
  toriiUrl: string;
  controllerId: string;
  assetDefinitionId?: string;
}): Promise<OfflineAllowanceSnapshot> => {
  const response = await listOfflineAllowances({
    toriiUrl: params.toriiUrl,
    controllerId: params.controllerId,
    limit: 200,
  });
  const normalizedAssetDefinitionId = params.assetDefinitionId?.trim() ?? "";
  const allowances = normalizedAssetDefinitionId
    ? response.items.filter(
        (item) => item.asset_id === normalizedAssetDefinitionId,
      )
    : response.items;
  const total = sumAllowances(allowances);
  const nextPolicyExpiryMs =
    allowances
      .map((item) => item.policy_expires_at_ms)
      .filter((value) => typeof value === "number" && value > 0)
      .sort((a, b) => a - b)[0] ?? null;
  const nextRefreshMs =
    allowances
      .map((item) => item.refresh_at_ms)
      .filter(
        (value): value is number => typeof value === "number" && value > 0,
      )
      .sort((a, b) => a - b)[0] ?? null;
  return {
    total,
    syncedAtMs: Date.now(),
    nextPolicyExpiryMs,
    nextRefreshMs,
    allowances,
  };
};
