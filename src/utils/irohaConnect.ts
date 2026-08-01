import {
  buildConnectTokenProtocol as buildConnectTokenProtocolBase,
  buildConnectWebSocketUrl as buildConnectWebSocketUrlBase,
} from "@iroha/iroha-js/connect-browser";
import type {
  EndpointInspection,
  EndpointNetworkContext,
} from "@/types/endpointInspection";
import { normalizeEndpointUrl } from "@/utils/endpoint";

export type IrohaConnectRole = "app" | "wallet";

export interface ParsedIrohaConnectUri {
  raw: string;
  canonicalUri: string;
  launchUri: string;
  sid: string;
  chainId: string | null;
  node: string | null;
  networkPrefix: number | null;
  role: IrohaConnectRole;
  token: string | null;
  relayToken: string | null;
  version: string | null;
}

export interface IrohaConnectNetworkClaim {
  node?: string | null;
  chainId?: string | null;
  networkPrefix?: unknown;
}

export interface IrohaConnectApprovalRequestInput {
  session: ParsedIrohaConnectUri;
  accountId: string;
  fallbackToriiUrl: string;
}

export interface IrohaConnectApprovalRequest {
  url: string;
  protocols: string[];
}

const CONNECT_PROTOCOLS = new Set(["iroha:", "irohaconnect:"]);
const CONNECT_HOST = "connect";
const CONNECT_LAUNCH_PROTOCOL = "irohaconnect:";
const CONNECT_FIXED_KEY_LENGTH = 32;

const decodeSidBytes = (sid: string | Uint8Array) => {
  if (sid instanceof Uint8Array) {
    if (sid.length !== CONNECT_FIXED_KEY_LENGTH) {
      throw new RangeError("IrohaConnect session id must be 32 bytes.");
    }
    return new Uint8Array(sid);
  }
  const body = sid.trim().replace(/=+$/u, "");
  const remainder = body.length % 4;
  const padded = `${body.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat(
    (4 - remainder) % 4,
  )}`;
  const bytes = Uint8Array.from(atob(padded), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length !== CONNECT_FIXED_KEY_LENGTH) {
    throw new RangeError("IrohaConnect session id must decode to 32 bytes.");
  }
  return bytes;
};

const requireConnectParam = (url: URL, name: string) => {
  const value = url.searchParams.get(name)?.trim() ?? "";
  if (!value) {
    throw new Error(`IrohaConnect URI is missing ${name}.`);
  }
  return value;
};

const normalizeRole = (value: string | null): IrohaConnectRole => {
  if (value === "app" || value === "wallet") {
    return value;
  }
  throw new Error("IrohaConnect URI role must be app or wallet.");
};

const normalizeIrohaConnectNetworkPrefix = (
  value: unknown,
  label: string,
): number => {
  const normalized =
    typeof value === "string" && /^(?:0|[1-9]\d*)$/u.test(value.trim())
      ? Number(value.trim())
      : value;
  if (
    typeof normalized !== "number" ||
    !Number.isInteger(normalized) ||
    normalized < 0 ||
    normalized > 0x3fff
  ) {
    throw new Error(`${label} must be an integer between 0 and 16383.`);
  }
  return normalized;
};

const optionalIrohaConnectNetworkPrefix = (url: URL): number | null => {
  if (!url.searchParams.has("network_prefix")) {
    return null;
  }
  return normalizeIrohaConnectNetworkPrefix(
    url.searchParams.get("network_prefix"),
    "IrohaConnect URI network_prefix",
  );
};

const normalizeEndpointOrigin = (value: string, label: string): string => {
  try {
    const endpoint = new URL(normalizeEndpointUrl(value));
    if (endpoint.username || endpoint.password) {
      throw new Error("credentials are not allowed");
    }
    return endpoint.origin;
  } catch (_error) {
    throw new Error(`${label} must be a valid HTTP(S) Torii endpoint.`);
  }
};

export const validateIrohaConnectNetworkClaim = (
  claim: IrohaConnectNetworkClaim,
  active: EndpointNetworkContext,
  options: {
    label?: string;
    requireChainId?: boolean;
    requireNode?: boolean;
  } = {},
): EndpointNetworkContext => {
  const label = options.label?.trim() || "IrohaConnect pairing QR";
  const activeChainId = String(active.chainId ?? "").trim();
  if (!activeChainId) {
    throw new Error("The active wallet connection is missing its chain ID.");
  }
  const activeNetworkPrefix = normalizeIrohaConnectNetworkPrefix(
    active.networkPrefix,
    "Active wallet network prefix",
  );
  const activeToriiUrl = normalizeEndpointUrl(active.toriiUrl);
  const activeOrigin = normalizeEndpointOrigin(
    activeToriiUrl,
    "Active wallet endpoint",
  );

  const claimedChainId = String(claim.chainId ?? "").trim();
  if (options.requireChainId && !claimedChainId) {
    throw new Error(`${label} is missing its chain ID.`);
  }
  if (claimedChainId && claimedChainId !== activeChainId) {
    throw new Error(
      `${label} targets a different chain than the active wallet.`,
    );
  }

  const claimedNode = String(claim.node ?? "").trim();
  if (options.requireNode && !claimedNode) {
    throw new Error(`${label} is missing its endpoint.`);
  }
  if (
    claimedNode &&
    normalizeEndpointOrigin(claimedNode, `${label} endpoint`) !== activeOrigin
  ) {
    throw new Error(
      `${label} targets a different endpoint than the active wallet.`,
    );
  }

  if (
    claim.networkPrefix !== undefined &&
    claim.networkPrefix !== null &&
    normalizeIrohaConnectNetworkPrefix(
      claim.networkPrefix,
      `${label} network prefix`,
    ) !== activeNetworkPrefix
  ) {
    throw new Error(
      `${label} targets a different network prefix than the active wallet.`,
    );
  }

  return {
    toriiUrl: activeToriiUrl,
    chainId: activeChainId,
    networkPrefix: activeNetworkPrefix,
  };
};

export const assertIrohaConnectEndpointCanPair = (
  inspection: EndpointInspection,
): void => {
  if (inspection.accessMode !== "read-write") {
    throw new Error(inspection.diagnostic.message);
  }
  if (!inspection.features.irohaConnectSessions.supported) {
    throw new Error(
      "The active endpoint does not advertise IrohaConnect session writes.",
    );
  }
};

export const parseIrohaConnectUri = (input: string): ParsedIrohaConnectUri => {
  const raw = input.trim();
  if (!raw) {
    throw new Error("IrohaConnect URI is empty.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch (_error) {
    throw new Error("IrohaConnect URI is invalid.");
  }

  if (!CONNECT_PROTOCOLS.has(url.protocol) || url.hostname !== CONNECT_HOST) {
    throw new Error("QR is not an IrohaConnect session.");
  }

  const sid = requireConnectParam(url, "sid");
  decodeSidBytes(sid);
  const role = normalizeRole(url.searchParams.get("role"));
  const version = url.searchParams.get("v")?.trim() || null;
  if (version !== "1") {
    throw new Error("IrohaConnect URI version must be v=1.");
  }
  const canonical = new URL(url.toString());
  canonical.protocol = "iroha:";
  const launch = new URL(url.toString());
  launch.protocol = CONNECT_LAUNCH_PROTOCOL;

  return {
    raw,
    canonicalUri: canonical.toString(),
    launchUri: launch.toString(),
    sid,
    chainId: url.searchParams.get("chain_id")?.trim() || null,
    node: url.searchParams.get("node")?.trim() || null,
    networkPrefix: optionalIrohaConnectNetworkPrefix(url),
    role,
    token: url.searchParams.get("token")?.trim() || null,
    relayToken: url.searchParams.get("relay")?.trim() || null,
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
  const normalized = token.trim();
  if (!normalized) {
    throw new Error("IrohaConnect token is missing.");
  }
  return buildConnectTokenProtocolBase(normalized);
};

export const buildIrohaConnectWebSocketUrl = (
  session: ParsedIrohaConnectUri,
  fallbackToriiUrl: string,
) => {
  const baseUrl = (session.node || fallbackToriiUrl).replace(/\/+$/u, "");
  return buildConnectWebSocketUrlBase(baseUrl, session.sid, session.role);
};

export const buildIrohaConnectApprovalRequest = ({
  session,
  accountId,
  fallbackToriiUrl,
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
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) {
    throw new Error("Choose an active wallet before approving IrohaConnect.");
  }

  return {
    url: buildIrohaConnectWebSocketUrl(session, fallbackToriiUrl),
    protocols: [buildIrohaConnectTokenProtocol(session.token)],
  };
};
