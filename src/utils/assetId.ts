import { blake3 } from "@noble/hashes/blake3.js";

export type ParsedAssetReference = {
  definitionId: string;
  accountId: string;
};

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_ASSET_DEFINITION_ID_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{28}$/u;
const ASSET_DEFINITION_ADDRESS_VERSION = 1;
const ASSET_DEFINITION_ADDRESS_LENGTH = 21;
const ASSET_DEFINITION_UUID_OFFSET = 1;
const ASSET_DEFINITION_UUID_LENGTH = 16;
const ASSET_DEFINITION_CHECKSUM_LENGTH = 4;
const DATASPACE_SCOPE_PATTERN = /^dataspace:(?:0|[1-9]\d*)$/u;
const MAX_DATASPACE_ID = 0xffff_ffff_ffff_ffffn;
const SORA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";

const bytesEqual = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length &&
  left.every((byte, index) => byte === right[index]);

const decodeBase58 = (literal: string): Uint8Array | null => {
  if (!BASE58_ASSET_DEFINITION_ID_PATTERN.test(literal)) {
    return null;
  }

  const bytes = [0];
  for (const character of literal) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) {
      return null;
    }
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const next = bytes[index]! * 58 + carry;
      bytes[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let leadingZeroCount = 0;
  while (literal[leadingZeroCount] === "1") {
    leadingZeroCount += 1;
  }
  while (leadingZeroCount > 0) {
    bytes.push(0);
    leadingZeroCount -= 1;
  }
  return Uint8Array.from(bytes.reverse());
};

const isUuidV4 = (bytes: Uint8Array) =>
  bytes.length === ASSET_DEFINITION_UUID_LENGTH &&
  bytes[6]! >> 4 === 0b0100 &&
  (bytes[8]! & 0b1100_0000) === 0b1000_0000;

export const isCanonicalAssetDefinitionId = (
  value: string | null | undefined,
) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    return false;
  }
  const decoded = decodeBase58(value);
  if (
    decoded === null ||
    decoded.length !== ASSET_DEFINITION_ADDRESS_LENGTH ||
    decoded[0] !== ASSET_DEFINITION_ADDRESS_VERSION
  ) {
    return false;
  }
  const uuid = decoded.subarray(
    ASSET_DEFINITION_UUID_OFFSET,
    ASSET_DEFINITION_UUID_OFFSET + ASSET_DEFINITION_UUID_LENGTH,
  );
  if (!isUuidV4(uuid)) {
    return false;
  }
  const checksumOffset =
    ASSET_DEFINITION_ADDRESS_LENGTH - ASSET_DEFINITION_CHECKSUM_LENGTH;
  return bytesEqual(
    decoded.subarray(checksumOffset),
    blake3(decoded.subarray(0, checksumOffset)).subarray(
      0,
      ASSET_DEFINITION_CHECKSUM_LENGTH,
    ),
  );
};

const isCanonicalAccountSegment = (value: string) =>
  value.length > 0 &&
  value.trim() === value &&
  !value.includes("#") &&
  Array.from(value).every((character) => character >= " ");

const normalizeDataspaceScope = (value: string) => {
  if (!DATASPACE_SCOPE_PATTERN.test(value)) {
    return null;
  }
  const id = BigInt(value.slice("dataspace:".length));
  return id <= MAX_DATASPACE_ID ? value : null;
};

export const splitAssetReference = (
  value: string | null | undefined,
): ParsedAssetReference => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    return { definitionId: "", accountId: "" };
  }
  if (isCanonicalAssetDefinitionId(value)) {
    return { definitionId: value, accountId: "" };
  }

  const parts = value.split("#");
  if (
    (parts.length === 2 || parts.length === 3) &&
    isCanonicalAssetDefinitionId(parts[0]) &&
    isCanonicalAccountSegment(parts[1]!) &&
    (parts.length === 2 || normalizeDataspaceScope(parts[2]!) !== null)
  ) {
    return {
      definitionId: parts[0]!,
      accountId: parts.slice(1).join("#"),
    };
  }
  return { definitionId: "", accountId: "" };
};

export const extractAssetDefinitionId = (
  value: string | null | undefined,
): string => splitAssetReference(value).definitionId;

export const extractAssetHoldingDataspaceSuffix = (
  value: string | null | undefined,
): string => {
  const parsed = splitAssetReference(value);
  const scope = parsed.accountId.split("#")[1];
  return scope ? `#${scope}` : "";
};

export const buildAssetHoldingIdLiteral = (input: {
  assetDefinitionId: string | null | undefined;
  accountId: string | null | undefined;
  dataspaceSuffix?: string | null | undefined;
}): string => {
  const definitionId = extractAssetDefinitionId(input.assetDefinitionId);
  const accountId = input.accountId;
  if (
    !definitionId ||
    typeof accountId !== "string" ||
    !isCanonicalAccountSegment(accountId)
  ) {
    throw new Error(
      "Asset holding ID requires an exact Base58 asset definition and canonical account literal.",
    );
  }

  const inheritedSuffix = extractAssetHoldingDataspaceSuffix(
    input.assetDefinitionId,
  );
  const requestedSuffix = input.dataspaceSuffix ?? inheritedSuffix;
  if (requestedSuffix === null || requestedSuffix === "") {
    return `${definitionId}#${accountId}`;
  }
  if (
    typeof requestedSuffix !== "string" ||
    !requestedSuffix.startsWith("#") ||
    normalizeDataspaceScope(requestedSuffix.slice(1)) === null
  ) {
    throw new Error("Asset holding dataspace suffix must be canonical.");
  }
  return `${definitionId}#${accountId}${requestedSuffix}`;
};

export const areAssetDefinitionIdsEquivalent = (
  left: string | null | undefined,
  right: string | null | undefined,
) => {
  const normalizedLeft = extractAssetDefinitionId(left);
  const normalizedRight = extractAssetDefinitionId(right);
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
};

export const deriveAssetSymbol = (
  value: string | null | undefined,
  fallback = "ASSET",
) =>
  extractAssetDefinitionId(value) === SORA_XOR_ASSET_DEFINITION_ID
    ? "XOR"
    : fallback;

export const formatAssetDefinitionLabel = (
  value: string | null | undefined,
  fallback = "—",
) => extractAssetDefinitionId(value) || fallback;

export const formatAssetReferenceLabel = (
  value: string | null | undefined,
  fallback = "—",
) => {
  const parsed = splitAssetReference(value);
  return parsed.definitionId ? String(value) : fallback;
};

export const resolveToriiXorAsset = <
  TAsset extends { asset_id: string; quantity: string },
>(
  assets: TAsset[],
  preferredAssetDefinitionIds: Array<string | null | undefined> = [],
) => {
  const preferredDefinitionIds = new Set(
    preferredAssetDefinitionIds
      .map((value) => extractAssetDefinitionId(value))
      .filter(Boolean),
  );
  if (preferredDefinitionIds.size === 0) {
    return null;
  }

  const candidates = assets.filter((asset) =>
    preferredDefinitionIds.has(extractAssetDefinitionId(asset.asset_id)),
  );
  return (
    candidates.find((asset) => {
      const quantity = Number(asset.quantity);
      return Number.isFinite(quantity) && quantity > 0;
    }) ??
    candidates[0] ??
    null
  );
};

export const shouldReplaceConfiguredAssetDefinitionId = (input: {
  configuredAssetDefinitionId: string | null | undefined;
  detectedAssetDefinitionId: string | null | undefined;
  knownAssetIds?: Array<string | null | undefined>;
}) => {
  const configuredLiteral =
    typeof input.configuredAssetDefinitionId === "string"
      ? input.configuredAssetDefinitionId
      : "";
  const configured = extractAssetDefinitionId(
    input.configuredAssetDefinitionId,
  );
  const detected = extractAssetDefinitionId(input.detectedAssetDefinitionId);
  if (
    !detected ||
    configured === detected ||
    (configuredLiteral.length > 0 && !configured)
  ) {
    return false;
  }

  const known = new Set(
    (input.knownAssetIds ?? [])
      .map((value) => extractAssetDefinitionId(value))
      .filter(Boolean),
  );
  if (known.size === 0) {
    return !configured;
  }
  return known.has(detected) && (!configured || !known.has(configured));
};
