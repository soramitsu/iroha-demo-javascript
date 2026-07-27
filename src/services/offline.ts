import { getOfflineReadiness } from "./iroha";
import type { OfflineAllowanceItem, OfflineReadinessView } from "@/types/iroha";

export type OfflineReadinessSnapshot = OfflineReadinessView & {
  allowanceSupported: false;
  allowances: OfflineAllowanceItem[];
};

export const fetchOfflineReadiness = async (params: {
  toriiUrl: string;
  assetDefinitionId: string;
}): Promise<OfflineReadinessSnapshot> => {
  const readiness = await getOfflineReadiness(params);
  return {
    ...readiness,
    allowanceSupported: false,
    allowances: [],
  };
};
