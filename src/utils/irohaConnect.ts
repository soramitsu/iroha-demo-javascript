import {
  buildConnectTokenProtocol as buildConnectTokenProtocolBase,
  buildConnectWebSocketUrl as buildConnectWebSocketUrlBase,
} from "@iroha/iroha-js/connect-browser";
import { NetworkId } from "@iroha/iroha-js/connect-browser";
import type {
  EndpointInspection,
  EndpointNetworkContext,
} from "@/types/endpointInspection";
import { normalizeEndpointUrl } from "@/utils/endpoint";
import { trustedNetworkIdFromInspection } from "@/utils/networkIdentity";
import {
  assertConnectSessionCommitment,
  bytesToHex,
} from "@/utils/soraswapConnectWire";

export type IrohaConnectRole = "app" | "wallet";

export interface ParsedIrohaConnectUri {
  raw: string;
  canonicalUri: string;
  launchUri: string;
  sid: string;
  networkId: string;
  appPublicKeyBase64Url: string;
  appPublicKeyHex: string;
  nonceBase64Url: string;
  node: string;
  role: "wallet";
  token: string;
  relayToken: string;
  version: "1";
}

/** Active wallet connection plus its endpoint-derived, pinned NetworkId. */
export type IrohaConnectNetworkContext = EndpointNetworkContext & {
  networkId: string;
};

export interface IrohaConnectNetworkClaim {
  node?: string | null;
  networkId?: string | null;
}

export interface IrohaConnectApprovalRequestInput {
  session: ParsedIrohaConnectUri;
  accountId: string;
}

export interface IrohaConnectApprovalRequest {
  url: string;
  protocols: string[];
}

const CONNECT_PROTOCOLS = new Set(["iroha:", "irohaconnect:"]);
const CONNECT_HOST = "connect";
const CONNECT_LAUNCH_PROTOCOL = "irohaconnect:";
const CONNECT_FIXED_KEY_LENGTH = 32;
const CONNECT_URI_FIELDS = new Set([
  "sid",
  "network_id",
  "app_pk",
  "nonce",
  "node",
  "v",
  "role",
  "token",
  "relay",
]);
const CONNECT_WALLET_REQUIRED_FIELDS = [...CONNECT_URI_FIELDS];
const MAX_CONNECT_URI_LENGTH = 4_096;

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
};

const decodeCanonicalBase64Url = (
  value: string,
  byteLength: number,
  label: string,
) => {
  if (
    typeof value !== "string" ||
    value.length !== Math.ceil((byteLength * 8) / 6) ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new RangeError(
      `${label} must be canonical ${byteLength}-byte base64url.`,
    );
  }
  const body = value;
  const remainder = body.length % 4;
  const padded = `${body.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat(
    (4 - remainder) % 4,
  )}`;
  const bytes = Uint8Array.from(atob(padded), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length !== byteLength) {
    throw new RangeError(`${label} must decode to ${byteLength} bytes.`);
  }
  if (encodeBase64Url(bytes) !== value) {
    throw new RangeError(
      `${label} must be canonical ${byteLength}-byte base64url.`,
    );
  }
  return bytes;
};

const decodeSidBytes = (sid: string) =>
  decodeCanonicalBase64Url(
    sid,
    CONNECT_FIXED_KEY_LENGTH,
    "IrohaConnect session id",
  );

const requireConnectParam = (query: Map<string, string>, name: string) => {
  const value = query.get(name);
  if (value === undefined || !value || value.trim() !== value) {
    throw new Error(`IrohaConnect URI is missing ${name}.`);
  }
  return value;
};

const requireCanonicalConnectText = (
  value: string,
  label: string,
  maxLength: number,
): string => {
  if (
    value.length > maxLength ||
    value.normalize("NFC") !== value ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new Error(`${label} must be canonical text.`);
  }
  return value;
};

const requireConnectToken = (value: string, label: string): string => {
  try {
    decodeSidBytes(value);
  } catch {
    throw new Error(`${label} must be canonical 32-byte base64url.`);
  }
  return value;
};

const normalizeRole = (value: string | null): "wallet" => {
  if (value === "wallet") {
    return "wallet";
  }
  throw new Error("IrohaConnect QR must use role=wallet.");
};

const normalizeIrohaConnectNetworkPrefix = (
  value: unknown,
  label: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0x3fff
  ) {
    throw new Error(`${label} must be an integer between 0 and 16383.`);
  }
  return value;
};

const requireCanonicalEndpointOrigin = (
  value: unknown,
  label: string,
): string => {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} is missing.`);
  }
  const normalized = normalizeEndpointUrl(value);
  const endpoint = new URL(normalized);
  if (value !== normalized || endpoint.pathname !== "/") {
    throw new Error(`${label} must be an exact canonical Torii origin.`);
  }
  return normalized;
};

export const validateIrohaConnectNetworkClaim = (
  claim: IrohaConnectNetworkClaim,
  active: IrohaConnectNetworkContext,
  options: {
    label?: string;
    requireNetworkId?: boolean;
    requireNode?: boolean;
  } = {},
): IrohaConnectNetworkContext => {
  const label = options.label?.trim() || "IrohaConnect pairing QR";
  if (
    typeof active.chainId !== "string" ||
    !active.chainId ||
    active.chainId.trim() !== active.chainId
  ) {
    throw new Error("The active wallet connection is missing its chain ID.");
  }
  const activeChainId = active.chainId;
  const activeNetworkPrefix = normalizeIrohaConnectNetworkPrefix(
    active.networkPrefix,
    "Active wallet network prefix",
  );
  const activeToriiUrl = requireCanonicalEndpointOrigin(
    active.toriiUrl,
    "Active wallet endpoint",
  );
  let activeNetworkId: string;
  try {
    activeNetworkId = NetworkId.parse(active.networkId).toString();
  } catch {
    throw new Error(
      "The active wallet connection has no verified endpoint NetworkId.",
    );
  }
  if (activeNetworkId !== active.networkId) {
    throw new Error(
      "The active wallet connection has no verified endpoint NetworkId.",
    );
  }

  const claimedNetworkId = claim.networkId;
  if (options.requireNetworkId && !claimedNetworkId) {
    throw new Error(`${label} is missing its NetworkId.`);
  }
  if (claimedNetworkId) {
    if (typeof claimedNetworkId !== "string") {
      throw new Error(`${label} has an invalid NetworkId.`);
    }
    let canonicalClaim: string;
    try {
      canonicalClaim = NetworkId.parse(claimedNetworkId).toString();
    } catch {
      throw new Error(`${label} has an invalid NetworkId.`);
    }
    if (
      canonicalClaim !== claimedNetworkId ||
      canonicalClaim !== activeNetworkId
    ) {
      throw new Error(
        `${label} targets a different NetworkId than the active wallet.`,
      );
    }
  }

  const claimedNode = claim.node;
  if (options.requireNode && !claimedNode) {
    throw new Error(`${label} is missing its endpoint.`);
  }
  if (
    claimedNode &&
    requireCanonicalEndpointOrigin(claimedNode, `${label} endpoint`) !==
      activeToriiUrl
  ) {
    throw new Error(
      `${label} targets a different endpoint than the active wallet.`,
    );
  }

  return {
    toriiUrl: activeToriiUrl,
    chainId: activeChainId,
    networkPrefix: activeNetworkPrefix,
    networkId: activeNetworkId,
  };
};

/**
 * Require a write-authorized endpoint that advertises Connect sessions and
 * return its pinned NetworkId.
 */
export const assertIrohaConnectEndpointCanPair = (
  inspection: EndpointInspection,
): string => {
  if (inspection.accessMode !== "read-write") {
    throw new Error(inspection.diagnostic.message);
  }
  if (!inspection.features.irohaConnectSessions.supported) {
    throw new Error(
      "The active endpoint does not advertise IrohaConnect session writes.",
    );
  }
  const networkId = trustedNetworkIdFromInspection(inspection);
  if (!networkId) {
    throw new Error(
      "The active endpoint has no pinned network identity for IrohaConnect.",
    );
  }
  return networkId;
};

export const parseIrohaConnectUri = (input: string): ParsedIrohaConnectUri => {
  const raw = input.trim();
  if (!raw) {
    throw new Error("IrohaConnect URI is empty.");
  }
  if (raw !== input || raw.length > MAX_CONNECT_URI_LENGTH) {
    throw new Error("IrohaConnect URI is not canonical.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch (_error) {
    throw new Error("IrohaConnect URI is invalid.");
  }

  if (
    !CONNECT_PROTOCOLS.has(url.protocol) ||
    url.host !== CONNECT_HOST ||
    url.pathname !== "" ||
    url.hash !== "" ||
    url.username ||
    url.password
  ) {
    throw new Error("QR is not an IrohaConnect session.");
  }

  const query = new Map<string, string>();
  for (const [name, value] of url.searchParams) {
    if (!CONNECT_URI_FIELDS.has(name)) {
      throw new Error(
        `IrohaConnect URI contains unsupported parameter ${name}.`,
      );
    }
    if (query.has(name)) {
      throw new Error(`IrohaConnect URI contains duplicate parameter ${name}.`);
    }
    query.set(name, value);
  }

  const sid = requireConnectParam(query, "sid");
  decodeSidBytes(sid);
  const role = normalizeRole(query.get("role") ?? null);
  const version = query.get("v") ?? null;
  if (version !== "1") {
    throw new Error("IrohaConnect URI version must be v=1.");
  }
  for (const name of CONNECT_WALLET_REQUIRED_FIELDS) {
    requireConnectParam(query, name);
  }

  const networkIdLiteral = requireCanonicalConnectText(
    requireConnectParam(query, "network_id"),
    "IrohaConnect network_id",
    80,
  );
  let networkId: string;
  try {
    networkId = NetworkId.parse(networkIdLiteral).toString();
  } catch {
    throw new Error("IrohaConnect network_id must be a canonical NetworkId.");
  }
  const appPublicKeyBase64Url = requireConnectParam(query, "app_pk");
  const appPublicKey = decodeCanonicalBase64Url(
    appPublicKeyBase64Url,
    32,
    "IrohaConnect app_pk",
  );
  const nonceBase64Url = requireConnectParam(query, "nonce");
  decodeCanonicalBase64Url(nonceBase64Url, 16, "IrohaConnect nonce");
  const node = requireCanonicalEndpointOrigin(
    requireConnectParam(query, "node"),
    "IrohaConnect node",
  );
  const token = requireConnectToken(
    requireConnectParam(query, "token"),
    "IrohaConnect wallet token",
  );
  const relayToken = requireConnectToken(
    requireConnectParam(query, "relay"),
    "IrohaConnect relay token",
  );
  assertConnectSessionCommitment({
    sid,
    networkId,
    appPublicKeyHex: bytesToHex(appPublicKey),
    nonceBase64Url,
  });
  const canonicalParams = new URLSearchParams();
  for (const name of [
    "sid",
    "network_id",
    "app_pk",
    "nonce",
    "node",
    "v",
    "role",
    "token",
    "relay",
  ]) {
    const value = query.get(name);
    if (value !== undefined) {
      canonicalParams.set(name, value);
    }
  }
  const canonicalQuery = canonicalParams.toString();

  return {
    raw,
    canonicalUri: `iroha://connect?${canonicalQuery}`,
    launchUri: `${CONNECT_LAUNCH_PROTOCOL}//connect?${canonicalQuery}`,
    sid,
    networkId,
    appPublicKeyBase64Url,
    appPublicKeyHex: bytesToHex(appPublicKey),
    nonceBase64Url,
    node,
    role,
    token,
    relayToken,
    version,
  };
};

export const isIrohaConnectUri = (input: string): boolean => {
  try {
    parseIrohaConnectUri(input);
    return true;
  } catch (_error) {
    return false;
  }
};

export const buildIrohaConnectTokenProtocol = (token: string) => {
  return buildConnectTokenProtocolBase(
    requireConnectToken(token, "IrohaConnect token"),
  );
};

export const buildIrohaConnectWebSocketUrl = (
  session: ParsedIrohaConnectUri,
) => {
  const node = requireCanonicalEndpointOrigin(
    session.node,
    "IrohaConnect node",
  );
  decodeSidBytes(session.sid);
  normalizeRole(session.role);
  return buildConnectWebSocketUrlBase(node, session.sid, session.role);
};

export const buildIrohaConnectApprovalRequest = ({
  session,
  accountId,
}: IrohaConnectApprovalRequestInput): IrohaConnectApprovalRequest => {
  if (session.role !== "wallet") {
    throw new Error("Scan the wallet-role IrohaConnect QR from the app.");
  }
  if (!session.token) {
    throw new Error("IrohaConnect wallet token is missing.");
  }
  if (!session.relayToken) {
    throw new Error("IrohaConnect relay token is missing.");
  }
  if (
    typeof accountId !== "string" ||
    !accountId ||
    accountId.trim() !== accountId ||
    accountId.normalize("NFC") !== accountId ||
    /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(accountId)
  ) {
    throw new Error("Choose an active wallet before approving IrohaConnect.");
  }

  return {
    url: buildIrohaConnectWebSocketUrl(session),
    protocols: [buildIrohaConnectTokenProtocol(session.token)],
  };
};
