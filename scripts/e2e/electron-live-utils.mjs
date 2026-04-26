import { normalizeAccountId } from "@iroha/iroha-js";

export function buildToriiSurfaceProbeUrls(baseUrl) {
  const normalizedBase = String(baseUrl ?? "").trim();
  if (!normalizedBase) {
    throw new Error("Torii base URL must not be empty.");
  }
  const rootedBase = normalizedBase.endsWith("/")
    ? normalizedBase
    : `${normalizedBase}/`;
  return {
    healthUrls: ["v1/health", "health"].map((path) =>
      new URL(path, rootedBase).toString(),
    ),
    mcpUrl: new URL("v1/mcp", rootedBase).toString(),
    openApiUrl: new URL("openapi.json", rootedBase).toString(),
    vpnProfileUrl: new URL("v1/vpn/profile", rootedBase).toString(),
  };
}

export function formatSurfaceProbeAttempt(
  url,
  status,
  statusText = "",
  bodySnippet = "",
) {
  const normalizedStatusText = String(statusText ?? "").trim();
  const normalizedBody = String(bodySnippet ?? "").trim();
  return `${url} -> ${status}${normalizedStatusText ? ` ${normalizedStatusText}` : ""}${normalizedBody ? `: ${normalizedBody.slice(0, 120)}` : ""}`;
}

const requiredToriiVpnOpenApiPaths = [
  "/v1/vpn/profile",
  "/v1/vpn/sessions",
  "/v1/vpn/sessions/{session_id}",
  "/v1/vpn/receipts",
];

const requiredToriiVpnMcpToolNames = [
  "iroha.vpn.profile",
  "iroha.vpn.sessions.create",
  "iroha.vpn.sessions.get",
  "iroha.vpn.sessions.delete",
  "iroha.vpn.receipts.list",
];

export function buildToriiMcpToolsListRequest(id = "torii-vpn-surface") {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/list",
    params: {},
  };
}

export function extractToriiMcpToolNames(payload) {
  const tools = payload?.result?.tools;
  if (!Array.isArray(tools)) {
    return [];
  }
  return tools.map((tool) => String(tool?.name ?? "").trim()).filter(Boolean);
}

export function findMissingToriiVpnMcpTools(payload) {
  const availableNames = new Set(extractToriiMcpToolNames(payload));
  return requiredToriiVpnMcpToolNames.filter(
    (name) => !availableNames.has(name),
  );
}

export function findMissingToriiVpnOpenApiPaths(payload) {
  const paths = payload?.paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    return [...requiredToriiVpnOpenApiPaths];
  }
  return requiredToriiVpnOpenApiPaths.filter((path) => !(path in paths));
}

export function parseNetworkPrefix(rawValue) {
  if (!rawValue) return 369;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0x3fff) {
    throw new Error("E2E_NETWORK_PREFIX must be an integer from 0 to 16383.");
  }
  return parsed;
}

export function isSupportedAccountIdLiteral(value) {
  const accountId = String(value ?? "").trim();
  if (!accountId) return false;
  try {
    normalizeAccountId(accountId, "accountId");
    return true;
  } catch {
    return false;
  }
}

export function isOnboardingDisabledError(detail) {
  return /\bstatus(?:\s|[^a-z0-9_])+403\b/i.test(String(detail ?? ""));
}

export function isOnboardingBadRequestError(detail) {
  return /\bstatus(?:\s|[^a-z0-9_])+400\b/i.test(String(detail ?? ""));
}

export function isOnboardingConflictError(detail) {
  return /\bstatus(?:\s|[^a-z0-9_])+409\b/i.test(String(detail ?? ""));
}

export function isRetryableFaucetBadRequest(detail) {
  const normalizedDetail = String(detail ?? "");
  return (
    /\bFaucet request failed\s*\(400\)/i.test(normalizedDetail) &&
    /stale faucet proof challenges/i.test(normalizedDetail)
  );
}

function normalizeDecimalQuantity(value) {
  const normalizedValue = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalizedValue)) {
    return null;
  }

  const [wholePart, fractionalPart = ""] = normalizedValue.split(".");
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, "");
  const normalizedFractionalPart = fractionalPart.replace(/0+$/, "");
  return normalizedFractionalPart
    ? `${normalizedWholePart}.${normalizedFractionalPart}`
    : normalizedWholePart;
}

export function decimalQuantityEquals(actual, expected) {
  const normalizedActual = normalizeDecimalQuantity(actual);
  const normalizedExpected = normalizeDecimalQuantity(expected);
  return (
    normalizedActual !== null &&
    normalizedExpected !== null &&
    normalizedActual === normalizedExpected
  );
}

export function resolveOptionalAliasRegistrationOutcome(status, detail) {
  const normalizedStatus = String(status ?? "")
    .trim()
    .toLowerCase();
  const normalizedDetail = String(detail ?? "");
  if (normalizedStatus !== "error") {
    return "executed";
  }
  if (
    isOnboardingDisabledError(normalizedDetail) ||
    isOnboardingBadRequestError(normalizedDetail)
  ) {
    return "skipped";
  }
  if (isOnboardingConflictError(normalizedDetail)) {
    return "executed";
  }
  throw new Error(
    `Optional alias registration probe failed: ${normalizedDetail || "unknown error"}`,
  );
}

const defaultOnboardingAlias = "e2e-onboarding-shared@universal";
const defaultOnboardingPrivateKeyHex =
  "c1f4e0837b224bf67dd4bd8fb94f8f78e6d1856e6f6a2f89f5cb9184160a95c7";
const defaultOnboardingOfflineBalance = "100";
const defaultFundedDomain = "default";
const deprecatedOnboardingEnvVarMap = {
  E2E_STATEFUL_ALIAS: "E2E_ONBOARDING_ALIAS",
  E2E_STATEFUL_PRIVATE_KEY_HEX: "E2E_ONBOARDING_PRIVATE_KEY_HEX",
  E2E_STATEFUL_OFFLINE_BALANCE: "E2E_ONBOARDING_OFFLINE_BALANCE",
};
const deprecatedOnboardingEnvVarNames = Object.keys(
  deprecatedOnboardingEnvVarMap,
);

function parseFundedWalletPrivateKeyHex(privateKeyHex, sourceLabel) {
  const normalizedPrivateKeyHex = String(privateKeyHex ?? "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/i.test(normalizedPrivateKeyHex)) {
    throw new Error(
      `${sourceLabel} must be a 64-character hexadecimal string.`,
    );
  }
  return normalizedPrivateKeyHex;
}

function normalizeFundedWalletDomain(domain) {
  return String(domain ?? "").trim() || defaultFundedDomain;
}

export function parseOnboardingEnvConfig(env = process.env) {
  const deprecated = deprecatedOnboardingEnvVarNames.filter((name) =>
    String(env?.[name] ?? "").trim(),
  );
  if (deprecated.length) {
    const renameGuide = deprecated
      .map((name) => `${name} -> ${deprecatedOnboardingEnvVarMap[name]}`)
      .join(", ");
    throw new Error(
      `Deprecated onboarding env vars are no longer supported: ${deprecated.join(
        ", ",
      )}. Rename to: ${renameGuide}.`,
    );
  }

  const alias =
    String(env?.E2E_ONBOARDING_ALIAS ?? "").trim() || defaultOnboardingAlias;
  const privateKeyHex = (
    String(env?.E2E_ONBOARDING_PRIVATE_KEY_HEX ?? "").trim() ||
    defaultOnboardingPrivateKeyHex
  ).toLowerCase();
  const offlineBalance =
    String(env?.E2E_ONBOARDING_OFFLINE_BALANCE ?? "").trim() ||
    defaultOnboardingOfflineBalance;

  if (!/^[0-9a-f]{64}$/i.test(privateKeyHex)) {
    throw new Error(
      "E2E_ONBOARDING_PRIVATE_KEY_HEX must be a 64-character hexadecimal string.",
    );
  }
  if (!Number.isFinite(Number(offlineBalance)) || Number(offlineBalance) <= 0) {
    throw new Error(
      "E2E_ONBOARDING_OFFLINE_BALANCE must be a positive numeric string.",
    );
  }

  return {
    alias,
    privateKeyHex,
    offlineBalance,
  };
}

export function parseFundedEnvConfig(env = process.env) {
  const privateKeyHex = String(env?.E2E_FUNDED_PRIVATE_KEY_HEX ?? "").trim();
  if (!privateKeyHex) {
    return null;
  }

  return {
    privateKeyHex: parseFundedWalletPrivateKeyHex(
      privateKeyHex,
      "E2E_FUNDED_PRIVATE_KEY_HEX",
    ),
    domain: normalizeFundedWalletDomain(env?.E2E_FUNDED_DOMAIN),
  };
}

export function extractTransactionHashHex(detail) {
  const match = String(detail ?? "").match(/\b([0-9a-f]{64})\b/i);
  return match ? match[1].toLowerCase() : null;
}

const normalizeOptionalNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeOptionalString = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

export function summarizePublicFinalityDiagnostic({
  txHashHex = "",
  txStatusPayload = null,
  statusPayload = null,
  sumeragiPayload = null,
  blocksPayload = null,
} = {}) {
  const lastBlock = Array.isArray(blocksPayload)
    ? blocksPayload[0]
    : Array.isArray(blocksPayload?.items)
      ? blocksPayload.items[0]
      : null;
  const statusSumeragi =
    statusPayload &&
    typeof statusPayload === "object" &&
    !Array.isArray(statusPayload) &&
    statusPayload.sumeragi &&
    typeof statusPayload.sumeragi === "object" &&
    !Array.isArray(statusPayload.sumeragi)
      ? statusPayload.sumeragi
      : null;
  const viewChangeCauses =
    sumeragiPayload &&
    typeof sumeragiPayload === "object" &&
    !Array.isArray(sumeragiPayload) &&
    sumeragiPayload.view_change_causes &&
    typeof sumeragiPayload.view_change_causes === "object" &&
    !Array.isArray(sumeragiPayload.view_change_causes)
      ? sumeragiPayload.view_change_causes
      : null;
  const txStatus =
    normalizeOptionalString(txStatusPayload?.status?.kind) ??
    normalizeOptionalString(txStatusPayload?.status);
  const latestBlockHeight =
    normalizeOptionalNumber(lastBlock?.height) ??
    normalizeOptionalNumber(statusPayload?.blocks);
  const commitQcHeight =
    normalizeOptionalNumber(statusSumeragi?.commit_qc_height) ??
    normalizeOptionalNumber(sumeragiPayload?.commit_qc?.height);
  const viewChangeCause = normalizeOptionalString(viewChangeCauses?.last_cause);
  return {
    txHashHex: normalizeOptionalString(txHashHex),
    txStatus,
    blocks: normalizeOptionalNumber(statusPayload?.blocks),
    queueSize: normalizeOptionalNumber(statusPayload?.queue_size),
    txQueueDepth: normalizeOptionalNumber(statusSumeragi?.tx_queue_depth),
    txQueueSaturated:
      typeof statusSumeragi?.tx_queue_saturated === "boolean"
        ? statusSumeragi.tx_queue_saturated
        : null,
    commitQcHeight,
    highestQcHeight:
      normalizeOptionalNumber(statusSumeragi?.highest_qc_height) ??
      normalizeOptionalNumber(sumeragiPayload?.highest_qc?.height),
    lockedQcHeight:
      normalizeOptionalNumber(statusSumeragi?.locked_qc_height) ??
      normalizeOptionalNumber(sumeragiPayload?.locked_qc?.height),
    membershipHeight: normalizeOptionalNumber(
      sumeragiPayload?.membership?.height,
    ),
    viewChanges:
      normalizeOptionalNumber(statusPayload?.view_changes) ??
      normalizeOptionalNumber(sumeragiPayload?.view_change_index),
    viewChangeCause,
    latestBlockHeight,
    latestBlockCreatedAt: normalizeOptionalString(lastBlock?.created_at),
    likelyFinalityStall:
      txStatus === "Queued" &&
      latestBlockHeight !== null &&
      commitQcHeight !== null &&
      latestBlockHeight === commitQcHeight &&
      (viewChangeCause === "missing_qc" ||
        viewChangeCause === "quorum_timeout"),
  };
}

export function parseCachedFundedWalletRecord(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const privateKeyHex = String(payload.privateKeyHex ?? "").trim();
  if (!privateKeyHex) {
    return null;
  }

  return {
    privateKeyHex: parseFundedWalletPrivateKeyHex(
      privateKeyHex,
      "Cached funded wallet privateKeyHex",
    ),
    domain: normalizeFundedWalletDomain(payload.domain),
    accountId: String(payload.accountId ?? "").trim(),
    assetId: String(payload.assetId ?? "").trim(),
    assetDefinitionId: String(payload.assetDefinitionId ?? "").trim(),
    cachedAt: String(payload.cachedAt ?? "").trim(),
  };
}
