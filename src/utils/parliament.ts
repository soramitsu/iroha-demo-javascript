import type {
  GovernanceCitizenCountResponse,
  GovernanceCitizenStatusResponse,
} from "@/types/iroha";
import {
  areAssetDefinitionIdsEquivalent,
  extractAssetDefinitionId,
} from "@/utils/assetId";

export const resolveGovernanceBondBalance = (
  assets: Array<{ asset_id: string; quantity: string }>,
  citizenshipAssetDefinitionId: string | null | undefined,
) => {
  const expectedDefinitionId = extractAssetDefinitionId(
    citizenshipAssetDefinitionId,
  ).trim();
  if (!expectedDefinitionId) return "0";
  return (
    assets.find((asset) =>
      areAssetDefinitionIdsEquivalent(asset.asset_id, expectedDefinitionId),
    )?.quantity ?? "0"
  );
};

export const isRegisteredGovernanceCitizen = (
  status: Pick<GovernanceCitizenStatusResponse, "state"> | null | undefined,
) => status?.state === "citizen";

export const resolveGovernanceCitizenCount = (
  council: Pick<GovernanceCitizenCountResponse, "total"> | null | undefined,
) => {
  const count = Number(council?.total);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
};
