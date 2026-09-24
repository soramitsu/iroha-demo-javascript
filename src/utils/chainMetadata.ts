export type ChainMetadata = {
  chainId: string;
  networkPrefix: number;
};

export type ChainMetadataDraft = {
  chainId?: unknown;
  networkPrefix?: unknown;
};

const MAX_NETWORK_PREFIX = 0x3fff;
const MAX_CHAIN_ID_CHARACTERS = 256;
const FIRST_RELEASE_CHAIN_METADATA_KEYS = [
  "chain_id",
  "network_prefix",
] as const;
const UNSAFE_TECHNICAL_TEXT = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u;

const readExactDataRecord = (
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> => {
  let prototype: object | null;
  let ownKeys: PropertyKey[];
  try {
    prototype =
      value !== null && typeof value === "object"
        ? Object.getPrototypeOf(value)
        : null;
    ownKeys =
      value !== null && typeof value === "object" ? Reflect.ownKeys(value) : [];
  } catch {
    throw new TypeError(`${label} must be an exact data object.`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (prototype !== Object.prototype && prototype !== null) ||
    ownKeys.length !== expectedKeys.length ||
    ownKeys.some(
      (key) => typeof key !== "string" || !expectedKeys.includes(key),
    )
  ) {
    throw new TypeError(`${label} contains missing or unknown fields.`);
  }

  const snapshot: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new TypeError(`${label} must be an exact data object.`);
    }
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label} must contain only enumerable data fields.`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
};

export const normalizeChainIdValue = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > MAX_CHAIN_ID_CHARACTERS ||
    normalized.normalize("NFC") !== normalized ||
    UNSAFE_TECHNICAL_TEXT.test(normalized)
  ) {
    return null;
  }
  return normalized;
};

export const normalizeNetworkPrefixValue = (value: unknown): number | null => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_NETWORK_PREFIX
  ) {
    return null;
  }
  return value;
};

export const normalizeChainMetadata = (
  draft: ChainMetadataDraft,
): ChainMetadata => {
  const exactDraft = readExactDataRecord(
    draft,
    ["chainId", "networkPrefix"],
    "Chain metadata",
  );
  const chainId = normalizeChainIdValue(exactDraft.chainId);
  const networkPrefix = normalizeNetworkPrefixValue(exactDraft.networkPrefix);

  if (!chainId || chainId !== exactDraft.chainId) {
    throw new Error("Chain metadata must contain an exact canonical chain ID.");
  }
  if (networkPrefix === null) {
    throw new Error(
      "Chain metadata must contain an integer network prefix between 0 and 16383.",
    );
  }

  return { chainId, networkPrefix };
};

export const parseFirstReleaseChainMetadataPayload = (
  payload: unknown,
): ChainMetadata => {
  const exactPayload = readExactDataRecord(
    payload,
    FIRST_RELEASE_CHAIN_METADATA_KEYS,
    "Chain metadata",
  );
  if (
    typeof exactPayload.chain_id !== "string" ||
    normalizeChainIdValue(exactPayload.chain_id) !== exactPayload.chain_id
  ) {
    throw new TypeError("Chain metadata chain_id must be canonical text.");
  }
  if (normalizeNetworkPrefixValue(exactPayload.network_prefix) === null) {
    throw new TypeError(
      "Chain metadata network_prefix must be an integer between 0 and 16383.",
    );
  }
  return {
    chainId: exactPayload.chain_id,
    networkPrefix: exactPayload.network_prefix as number,
  };
};
