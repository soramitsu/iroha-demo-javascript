import { normalizeAssetDefinitionId } from "@iroha/iroha-js/normalizers";

export const normalizeFirstReleaseAssetDefinitionId = (
  value: unknown,
  label = "assetDefinitionId",
) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required.`);
  }
  let normalized: string;
  try {
    normalized = normalizeAssetDefinitionId(value, label);
  } catch {
    throw new Error(
      `${label} must be an exact canonical Base58 asset definition ID.`,
    );
  }
  if (normalized !== value) {
    throw new Error(
      `${label} must be an exact canonical Base58 asset definition ID.`,
    );
  }
  return normalized;
};
