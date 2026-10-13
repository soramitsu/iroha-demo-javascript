import { NetworkId } from "@iroha/iroha-js/connect-browser";
import type { EndpointInspection } from "../types/endpointInspection";

/**
 * Endpoint-derived network identity.
 *
 * Public Torii deployments (TAIRA in particular) are reset periodically, and a
 * reset changes the genesis block and therefore the transaction-binding
 * `NetworkId`. The wallet does not pin a release-time literal. Instead it
 * derives the identity at connection time from two independent public reads
 * on the configured endpoint and requires them to agree:
 *
 * - `GET /v1/accounts/capabilities` -> `network_id` and `network_prefix`
 * - `GET /v1/explorer/blocks/1` -> the genesis block `hash` literal, which is
 *   the canonical `NetworkId` literal (`hash:<UPPER HEX>#<CRC>`).
 *
 * The first agreeing observation for an endpoint is persisted (trust on first
 * use). A later observation that differs from the persisted identity is never
 * adopted silently: writes stay blocked until the user explicitly re-confirms.
 */

export const ACCOUNT_CAPABILITIES_PATH = "/v1/accounts/capabilities";
export const GENESIS_BLOCK_PATH = "/v1/explorer/blocks/1";
export const NETWORK_IDENTITY_PIN_SCHEMA =
  "iroha.wallet.network-identity-pin.v1";

const MAX_NETWORK_PREFIX = 0x3fff;
const LOWER_HASH_HEX = /^[0-9a-f]{64}$/u;

export type ObservedNetworkIdentity = {
  /** Canonical checksummed `NetworkId` literal. */
  networkId: string;
  networkPrefix: number;
  /** Lowercase hex of the 32 genesis-hash bytes the `NetworkId` commits to. */
  genesisHashHex: string;
};

export type NetworkIdentityPin = {
  schema: typeof NETWORK_IDENTITY_PIN_SCHEMA;
  toriiUrl: string;
  networkId: string;
  networkPrefix: number;
  confirmedAtMs: number;
  /** `first-use` for TOFU pins, `user-confirmed` after an explicit re-confirmation. */
  confirmation: "first-use" | "user-confirmed";
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const normalizeNetworkPrefixValue = (
  value: unknown,
  label = "network prefix",
): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < 0 ||
    value > MAX_NETWORK_PREFIX
  ) {
    throw new Error(`${label} must be an integer between 0 and 16383.`);
  }
  return value;
};

/**
 * Parse a Torii hash literal into a canonical `NetworkId` literal.
 *
 * Current Torii renders hashes as checksummed `hash:<UPPER HEX>#<CRC>`
 * literals; older builds used bare lowercase hex. Both are accepted and
 * normalized to the checksummed literal.
 */
export const parseNetworkIdLiteral = (
  value: unknown,
  label = "NetworkId",
): ObservedNetworkIdentity["networkId"] => {
  if (typeof value !== "string" || value.length > 128) {
    throw new Error(`${label} must be a canonical Iroha hash literal.`);
  }
  let parsed: NetworkId;
  try {
    parsed = LOWER_HASH_HEX.test(value)
      ? NetworkId.fromBytes(hexToBytes(value))
      : NetworkId.parse(value);
  } catch {
    throw new Error(`${label} must be a canonical Iroha hash literal.`);
  }
  const literal = parsed.toString();
  if (!LOWER_HASH_HEX.test(value) && literal !== value) {
    throw new Error(`${label} must be a canonical Iroha hash literal.`);
  }
  return literal;
};

export const networkIdGenesisHashHex = (networkId: string): string =>
  bytesToHex(NetworkId.parse(networkId).toBytes());

/** `GET /v1/accounts/capabilities` identity projection. */
export const parseAccountCapabilitiesIdentity = (
  payload: unknown,
): Pick<ObservedNetworkIdentity, "networkId" | "networkPrefix"> => {
  const record = asRecord(payload);
  if (!record || record.schema_version !== 1) {
    throw new Error(
      "Account capabilities must be a schema_version 1 JSON object.",
    );
  }
  return {
    networkId: parseNetworkIdLiteral(
      record.network_id,
      "Account capabilities network_id",
    ),
    networkPrefix: normalizeNetworkPrefixValue(
      record.network_prefix,
      "Account capabilities network_prefix",
    ),
  };
};

/** `GET /v1/explorer/blocks/1` genesis projection. */
export const parseGenesisBlockIdentity = (
  payload: unknown,
): Pick<ObservedNetworkIdentity, "networkId"> => {
  const record = asRecord(payload);
  if (!record || record.height !== 1) {
    throw new Error("Genesis block response must describe block height 1.");
  }
  if (record.prev_block_hash !== null && record.prev_block_hash !== undefined) {
    throw new Error("Genesis block response must not have a previous block.");
  }
  return {
    networkId: parseNetworkIdLiteral(record.hash, "Genesis block hash"),
  };
};

/**
 * Require the two independent public identity sources to agree.
 * Returns `null` when they disagree.
 */
export const combineNetworkIdentitySources = (
  capabilities: Pick<ObservedNetworkIdentity, "networkId" | "networkPrefix">,
  genesis: Pick<ObservedNetworkIdentity, "networkId">,
): ObservedNetworkIdentity | null =>
  capabilities.networkId === genesis.networkId
    ? {
        networkId: capabilities.networkId,
        networkPrefix: capabilities.networkPrefix,
        genesisHashHex: networkIdGenesisHashHex(capabilities.networkId),
      }
    : null;

export const isNetworkIdentityPin = (
  value: unknown,
): value is NetworkIdentityPin => {
  const record = asRecord(value);
  if (!record) return false;
  const keys = Object.keys(record).sort();
  const expected = [
    "confirmation",
    "confirmedAtMs",
    "networkId",
    "networkPrefix",
    "schema",
    "toriiUrl",
  ];
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    return false;
  }
  try {
    return (
      record.schema === NETWORK_IDENTITY_PIN_SCHEMA &&
      typeof record.toriiUrl === "string" &&
      record.toriiUrl.length > 0 &&
      parseNetworkIdLiteral(record.networkId) === record.networkId &&
      normalizeNetworkPrefixValue(record.networkPrefix) ===
        record.networkPrefix &&
      typeof record.confirmedAtMs === "number" &&
      Number.isSafeInteger(record.confirmedAtMs) &&
      record.confirmedAtMs >= 0 &&
      (record.confirmation === "first-use" ||
        record.confirmation === "user-confirmed")
    );
  } catch {
    return false;
  }
};

/**
 * The transaction-binding NetworkId for a write-authorized inspection: both
 * public sources agree and the identity matches the endpoint's pin.
 */
export const trustedNetworkIdFromInspection = (
  inspection: EndpointInspection | null | undefined,
): string | null => {
  const networkId = inspection?.observed?.networkId;
  if (
    !inspection ||
    inspection.identityStatus !== "matched" ||
    !networkId ||
    inspection.networkIdentity?.pinned?.networkId !== networkId
  ) {
    return null;
  }
  return networkId;
};

export const pinMatchesIdentity = (
  pin: Pick<NetworkIdentityPin, "networkId" | "networkPrefix">,
  identity: Pick<ObservedNetworkIdentity, "networkId" | "networkPrefix">,
): boolean =>
  pin.networkId === identity.networkId &&
  pin.networkPrefix === identity.networkPrefix;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}
