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
  addressFormat?: "ih58" | "canonical" | "compressed";
}): Promise<OfflineAllowanceSnapshot> => {
  const response = await listOfflineAllowances({
    toriiUrl: params.toriiUrl,
    controllerId: params.controllerId,
    addressFormat: params.addressFormat ?? "ih58",
    limit: 200,
  });
  const total = sumAllowances(response.items);
  const nextPolicyExpiryMs =
    response.items
      .map((item) => item.policy_expires_at_ms)
      .filter((value) => typeof value === "number" && value > 0)
      .sort((a, b) => a - b)[0] ?? null;
  const nextRefreshMs =
    response.items
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
    allowances: response.items,
  };
};
