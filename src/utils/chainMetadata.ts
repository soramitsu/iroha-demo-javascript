export type ChainMetadata = {
  chainId: string;
  networkPrefix: number;
};

export type ChainMetadataDraft = {
  chainId?: unknown;
  networkPrefix?: unknown;
};

const MAX_NETWORK_PREFIX = 0x3fff;
const FIRST_RELEASE_CHAIN_METADATA_KEYS = [
  "chain_id",
  "network_prefix",
] as const;

const trimString = (value: unknown): string => String(value ?? "").trim();

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const normalizeChainIdValue = (value: unknown): string | null => {
  const normalized = trimString(value);
  return normalized || null;
};

export const normalizeNetworkPrefixValue = (value: unknown): number | null => {
  const candidate = typeof value === "string" ? value.trim() : value;
  if (candidate === null || candidate === undefined || candidate === "") {
    return null;
  }
  const normalized = Number(candidate);
  if (
    !Number.isInteger(normalized) ||
    normalized < 0 ||
    normalized > MAX_NETWORK_PREFIX
  ) {
    return null;
  }
  return normalized;
};

export const normalizeChainMetadata = (
  draft: ChainMetadataDraft,
  fallback?: ChainMetadataDraft,
): ChainMetadata => {
  const chainId =
    normalizeChainIdValue(draft.chainId) ??
    normalizeChainIdValue(fallback?.chainId);
  const networkPrefix =
    normalizeNetworkPrefixValue(draft.networkPrefix) ??
    normalizeNetworkPrefixValue(fallback?.networkPrefix);

  if (!chainId) {
    throw new Error("Torii endpoint did not expose a chain ID.");
  }
  if (networkPrefix === null) {
    throw new Error("Torii endpoint did not expose a valid network prefix.");
  }

  return { chainId, networkPrefix };
};

export const parseFirstReleaseChainMetadataPayload = (
  payload: unknown,
): ChainMetadata => {
  if (!isPlainRecord(payload)) {
    throw new TypeError("Chain metadata must be an object.");
  }
  const actualKeys = Object.keys(payload).sort();
  const expectedKeys = [...FIRST_RELEASE_CHAIN_METADATA_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new TypeError("Chain metadata contains missing or unknown fields.");
  }
  if (
    typeof payload.chain_id !== "string" ||
    !payload.chain_id ||
    payload.chain_id.trim() !== payload.chain_id
  ) {
    throw new TypeError("Chain metadata chain_id must be canonical text.");
  }
  if (
    typeof payload.network_prefix !== "number" ||
    normalizeNetworkPrefixValue(payload.network_prefix) === null
  ) {
    throw new TypeError(
      "Chain metadata network_prefix must be an integer between 0 and 16383.",
    );
  }
  return {
    chainId: payload.chain_id,
    networkPrefix: payload.network_prefix,
  };
};
