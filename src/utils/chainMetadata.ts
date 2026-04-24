export type ChainMetadata = {
  chainId: string;
  networkPrefix: number;
};

export type ChainMetadataDraft = {
  chainId?: unknown;
  networkPrefix?: unknown;
};

const MAX_NETWORK_PREFIX = 0x3fff;

const trimString = (value: unknown): string => String(value ?? "").trim();

const normalizeKey = (key: string): string =>
  key.replace(/[-_\s]/g, "").toLowerCase();

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

const isChainIdKey = (key: string, path: string[]): boolean => {
  const normalized = normalizeKey(key);
  if (["chainid", "genesisid", "networkchainid"].includes(normalized)) {
    return true;
  }
  if (normalized !== "id") {
    return false;
  }
  return path.some((segment) => normalizeKey(segment).includes("chain"));
};

const isNetworkPrefixKey = (key: string, path: string[]): boolean => {
  const normalized = normalizeKey(key);
  if (
    [
      "networkprefix",
      "addressprefix",
      "accountprefix",
      "accountaddressprefix",
      "chaindiscriminant",
      "networkdiscriminant",
    ].includes(normalized)
  ) {
    return true;
  }
  if (normalized !== "prefix") {
    return false;
  }
  return path.some((segment) =>
    ["account", "address", "chain", "i105", "network"].some((marker) =>
      normalizeKey(segment).includes(marker),
    ),
  );
};

export const extractChainMetadataFromPayload = (
  payload: unknown,
): ChainMetadataDraft => {
  const draft: ChainMetadataDraft = {};

  const visit = (value: unknown, path: string[]) => {
    if (draft.chainId && draft.networkPrefix !== undefined) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, path);
      }
      return;
    }

    if (!isPlainRecord(value)) {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (!draft.chainId && isChainIdKey(key, path)) {
        const chainId = normalizeChainIdValue(child);
        if (chainId) {
          draft.chainId = chainId;
        }
      }

      if (draft.networkPrefix === undefined && isNetworkPrefixKey(key, path)) {
        const networkPrefix = normalizeNetworkPrefixValue(child);
        if (networkPrefix !== null) {
          draft.networkPrefix = networkPrefix;
        }
      }

      visit(child, [...path, key]);
    }
  };

  visit(payload, []);
  return draft;
};
