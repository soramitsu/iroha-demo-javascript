const BASE58_ASSET_DEFINITION_ID_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{28}$/u;
const NORITO_ASSET_DEFINITION_ID_PATTERN = /^norito:[0-9a-f]{32}$/u;

export const normalizeFirstReleaseAssetDefinitionId = (
  value: unknown,
  label = "assetDefinitionId",
) => {
  const literal = String(value ?? "").trim();
  if (!literal) {
    throw new Error(`${label} is required.`);
  }
  if (
    !BASE58_ASSET_DEFINITION_ID_PATTERN.test(literal) &&
    !NORITO_ASSET_DEFINITION_ID_PATTERN.test(literal)
  ) {
    throw new Error(
      `${label} must be an exact first-release asset definition literal: a 28-character Base58 address or lowercase norito: followed by 32 lowercase hex characters.`,
    );
  }
  return literal;
};
