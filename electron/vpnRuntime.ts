import { randomBytes } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { mkdirSync, rmSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import { NetworkId } from "@iroha/iroha-js/canonical-request";
import type { ToriiVpnQuote, ToriiVpnSession } from "@iroha/iroha-js";
import { normalizeCryptoAlgorithm } from "@iroha/iroha-js/crypto";
import { withBoundedHttpGetFetchRetry } from "./httpReadRetry";
import { nodeFetch } from "./nodeFetch";
import { readBoundedJsonResponse } from "./boundedJsonResponse";
import {
  BundledVpnController,
  type VpnControllerStatus,
  type VpnLocalController,
} from "./vpnController";
import type {
  VpnAvailability,
  VpnExitClass,
  VpnProfile,
  VpnReceipt,
  VpnStatus,
} from "../src/types/iroha";
import { normalizeEndpointUrl } from "../src/utils/endpoint";
import { resolveFirstReleaseNetworkIdLiteral } from "../src/utils/firstReleaseNetworkIdentity";
import { sanitizeErrorMessage } from "../src/utils/errorMessage";
import {
  DEFAULT_SIGNING_ALGORITHM,
  signingAlgorithmLabel,
} from "../src/utils/signingAlgorithms";
import { waitForFinalizedTransaction } from "./transactionFinality";
import { FirstReleaseVpnTransport } from "./firstReleaseVpnTransport";
import {
  buildFirstReleaseAuthorityTransactionDraft,
  signFirstReleaseAuthorityTransaction,
  submitFirstReleaseTransaction,
} from "./firstReleaseTransaction";
import {
  parseExactVpnProfile,
  parseExactVpnQuote,
  parseExactVpnReceipt,
  parseExactVpnReceiptList,
  parseExactVpnSession,
} from "./vpnResponseSchema";
import { requireFirstReleaseInputText } from "./firstReleaseReadInput";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";

type VpnAvailabilityInput = {
  toriiUrl: string;
};

type VpnAuthContext = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
  privateKeyHex: string;
  signingAlgorithm: string;
};

type VpnConnectInput = VpnAuthContext & {
  exitClass: VpnExitClass;
};

type VpnStatusInput = Pick<
  VpnAuthContext,
  "toriiUrl" | "chainId" | "accountId" | "networkPrefix"
> &
  Partial<Pick<VpnAuthContext, "privateKeyHex" | "signingAlgorithm">>;

type ActiveVpnSession = {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
  privateKeyHex: string;
  signingAlgorithm: string;
  sessionId: string;
  exitClass: VpnExitClass;
  relayEndpoint: string;
  leaseSecs: number;
  expiresAtMs: number;
  connectedAtMs: number;
  meterFamily: string;
  quoteId: string;
  paymentReference: string;
  paymentTxHash: string;
  feeAssetId: string;
  escrowAccountId: string;
  operatorAccountId: string;
  leaseFee: string;
  flowLabelBits: number;
  paddingBudgetMs: number;
  relayIdHex: string;
  relayMldsa65PublicKeyHex: string;
  descriptorCommitHex: string;
  tlsServerName: string;
  relayTlsSpkiSha256Hex: string;
  relayCertificateSha256Hex: string;
  directorySnapshotDigestHex: string;
  routePushes: string[];
  excludedRoutes: string[];
  dnsServers: string[];
  tunnelAddresses: string[];
  mtuBytes: number;
  helperTicketHex: string;
  bytesIn: number;
  bytesOut: number;
  status: "active";
  pendingRemoteExpiry: boolean;
};

type VpnRuntimeContext = {
  key: string;
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
};

const SUPPORTED_PLATFORMS = new Set(["darwin", "linux"]);
const VPN_PAYMENT_WAIT_TIMEOUT_MS = 60_000;
const VPN_PAYMENT_POLL_INTERVAL_MS = 1_000;
const MAX_VPN_FINALITY_JSON_BYTES = 1024 * 1024;
const vpnToriiFetch: typeof fetch = (input, init) =>
  withBoundedHttpGetFetchRetry(nodeFetch, input, init);

const fetchVpnFinalityJson = async (
  toriiUrl: string,
  path: string,
): Promise<unknown> => {
  const endpoint = new URL(path, `${normalizeEndpointUrl(toriiUrl)}/`);
  const response = await vpnToriiFetch(endpoint, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `VPN payment finality read ${path} failed with HTTP ${response.status}.`,
    );
  }
  return readBoundedJsonResponse(response, {
    label: `VPN payment finality read ${path}`,
    maximumBytes: MAX_VPN_FINALITY_JSON_BYTES,
    requireApplicationJson: true,
  });
};

const waitForVpnPaymentFinalizedBlock = async (
  client: FirstReleaseVpnTransport,
  toriiUrl: string,
  hashHex: string,
) =>
  waitForFinalizedTransaction({
    hashHex,
    timeoutMs: VPN_PAYMENT_WAIT_TIMEOUT_MS,
    intervalMs: VPN_PAYMENT_POLL_INTERVAL_MS,
    getGlobalStatus: () => client.getTransactionStatus(hashHex),
    getExplorerTransaction: () =>
      fetchVpnFinalityJson(
        toriiUrl,
        `/v1/explorer/transactions/${encodeURIComponent(hashHex)}`,
      ),
    getExplorerBlock: (blockHeight) =>
      fetchVpnFinalityJson(
        toriiUrl,
        `/v1/explorer/blocks/${encodeURIComponent(String(blockHeight))}`,
      ),
    getExplorerMetrics: () =>
      fetchVpnFinalityJson(toriiUrl, "/v1/explorer/metrics"),
    wait: (delayMs) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      }),
  });

const emptyStatus = (overrides?: Partial<VpnStatus>): VpnStatus => ({
  state: "idle",
  sessionId: null,
  exitClass: null,
  relayEndpoint: null,
  connectedAtMs: null,
  expiresAtMs: null,
  durationMs: 0,
  bytesIn: 0,
  bytesOut: 0,
  routePushes: [],
  excludedRoutes: [],
  dnsServers: [],
  tunnelAddresses: [],
  mtuBytes: 0,
  helperStatus: "idle",
  controllerInstalled: false,
  controllerVersion: null,
  controllerKind: null,
  reconcileState: null,
  repairRequired: false,
  remoteSessionActive: false,
  systemTunnelActive: false,
  systemTunnelKind: null,
  systemTunnelInterface: null,
  systemTunnelService: null,
  errorMessage: null,
  lastReceipt: null,
  ...overrides,
});

const normalizeHex = (value: unknown, label: string) => {
  if (
    typeof value !== "string" ||
    (value.length !== 64 && value.length !== 128) ||
    !/^[\da-f]+$/u.test(value)
  ) {
    throw new Error(
      `${label} must be an exact lowercase 32- or 64-byte hex key.`,
    );
  }
  return value;
};

const toPrivateKeyBuffer = (privateKeyHex: string) =>
  Buffer.from(normalizeHex(privateKeyHex, "privateKeyHex"), "hex");

const normalizeVpnSigningAlgorithm = (value: unknown): string => {
  const literal = requireFirstReleaseInputText(value, "signingAlgorithm", 64);
  const normalized = normalizeCryptoAlgorithm(literal);
  if (normalized !== literal) {
    throw new Error("signingAlgorithm must be an exact supported identifier.");
  }
  return normalized;
};

const buildVpnCanonicalAuth = (
  auth: Pick<
    VpnAuthContext,
    | "accountId"
    | "chainId"
    | "networkPrefix"
    | "privateKeyHex"
    | "signingAlgorithm"
  >,
  operationLabel: string,
  exactNetworkId?: NetworkId,
) => {
  const signingAlgorithm = normalizeVpnSigningAlgorithm(auth.signingAlgorithm);
  if (signingAlgorithm !== DEFAULT_SIGNING_ALGORITHM) {
    throw new Error(
      `${operationLabel} currently requires an Ed25519 wallet because VPN canonical authentication is Ed25519-only. This wallet uses ${signingAlgorithmLabel(signingAlgorithm)}.`,
    );
  }
  const networkId =
    exactNetworkId ??
    NetworkId.parse(
      resolveFirstReleaseNetworkIdLiteral({
        chainId: normalizeChainId(auth.chainId),
        networkPrefix: auth.networkPrefix,
      }),
    );
  return {
    accountId: auth.accountId,
    networkId,
    networkPrefix: auth.networkPrefix,
    // Allocate the secret only after every fallible public-field validation.
    privateKey: toPrivateKeyBuffer(auth.privateKeyHex),
  };
};

const runWithVpnCanonicalAuth = async <T>(
  auth: Pick<
    VpnAuthContext,
    | "accountId"
    | "chainId"
    | "networkPrefix"
    | "privateKeyHex"
    | "signingAlgorithm"
  >,
  operationLabel: string,
  operation: (
    canonicalAuth: ReturnType<typeof buildVpnCanonicalAuth>,
  ) => Promise<T>,
  exactNetworkId?: NetworkId,
): Promise<T> => {
  const canonicalAuth = buildVpnCanonicalAuth(
    auth,
    operationLabel,
    exactNetworkId,
  );
  try {
    return await operation(canonicalAuth);
  } finally {
    canonicalAuth.privateKey.fill(0);
  }
};

const normalizeChainId = (value: unknown) =>
  requireFirstReleaseInputText(value, "chainId", 128);

const generateVpnMeteringPublicKeyHex = () => randomBytes(32).toString("hex");

const normalizeVpnTxInstructions = (
  instructions: ReadonlyArray<{ wireId: string; payloadHex: string }>,
) => {
  if (!instructions.length) {
    throw new Error("VPN quote did not include a lease-open transaction.");
  }
  return instructions.map((instruction) => ({
    wire_id: instruction.wireId,
    payload_hex: instruction.payloadHex,
  }));
};

const nowMs = () => Date.now();

const normalizeVpnAccountId = (
  value: unknown,
  label: string,
  networkPrefix: number,
) => {
  return normalizeCanonicalAccountIdLiteral(
    requireFirstReleaseInputText(value, label, 1_024),
    label,
    networkPrefix,
  );
};

const normalizeVpnNetworkPrefix = (value: unknown): number | null => {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    value >= 0 &&
    value <= 0x3fff
    ? value
    : null;
};

const isPlainInputRecord = (
  value: unknown,
): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const requireExactInputKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
) => {
  const actual = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) ||
    actual.some((key) => !allowed.has(key))
  ) {
    throw new Error(`${label} contains missing or unknown fields.`);
  }
};

const normalizeVpnToriiUrl = (value: unknown): string => {
  const literal = requireFirstReleaseInputText(value, "toriiUrl", 2_048);
  const normalized = normalizeEndpointUrl(literal);
  const endpoint = new URL(normalized);
  if (
    literal !== normalized ||
    endpoint.protocol !== "https:" ||
    endpoint.pathname !== "/"
  ) {
    throw new Error(
      "toriiUrl must be an exact HTTPS origin without a path, query, fragment, credentials, or trailing slash.",
    );
  }
  return normalized;
};

const requireVpnAvailabilityInput = (value: unknown): VpnAvailabilityInput => {
  if (!isPlainInputRecord(value)) {
    throw new Error("VPN availability input must be a plain object.");
  }
  requireExactInputKeys(value, ["toriiUrl"], [], "VPN availability input");
  return { toriiUrl: normalizeVpnToriiUrl(value.toriiUrl) };
};

const requireVpnStatusInput = (value: unknown): VpnStatusInput => {
  if (!isPlainInputRecord(value)) {
    throw new Error("VPN status input must be a plain object.");
  }
  requireExactInputKeys(
    value,
    ["toriiUrl", "chainId", "accountId", "networkPrefix"],
    ["privateKeyHex", "signingAlgorithm"],
    "VPN status input",
  );
  const networkPrefix = normalizeVpnNetworkPrefix(value.networkPrefix);
  if (networkPrefix === null) {
    throw new Error(
      "networkPrefix must be an exact integer between 0 and 16383.",
    );
  }
  const privateKeyPresent = Object.prototype.hasOwnProperty.call(
    value,
    "privateKeyHex",
  );
  const signingAlgorithmPresent = Object.prototype.hasOwnProperty.call(
    value,
    "signingAlgorithm",
  );
  if (signingAlgorithmPresent !== privateKeyPresent) {
    throw new Error(
      "privateKeyHex and signingAlgorithm must be provided together for authenticated VPN status input.",
    );
  }
  const normalized: VpnStatusInput = {
    toriiUrl: normalizeVpnToriiUrl(value.toriiUrl),
    chainId: normalizeChainId(value.chainId),
    accountId: normalizeVpnAccountId(
      value.accountId,
      "accountId",
      networkPrefix,
    ),
    networkPrefix,
  };
  if (privateKeyPresent) {
    normalized.privateKeyHex = normalizeHex(
      value.privateKeyHex,
      "privateKeyHex",
    );
    normalized.signingAlgorithm = normalizeVpnSigningAlgorithm(
      value.signingAlgorithm,
    );
  }
  return normalized;
};

const requireVpnConnectInput = (value: unknown): VpnConnectInput => {
  if (!isPlainInputRecord(value)) {
    throw new Error("VPN connect input must be a plain object.");
  }
  requireExactInputKeys(
    value,
    [
      "toriiUrl",
      "chainId",
      "accountId",
      "networkPrefix",
      "privateKeyHex",
      "signingAlgorithm",
      "exitClass",
    ],
    [],
    "VPN connect input",
  );
  const networkPrefix = normalizeVpnNetworkPrefix(value.networkPrefix);
  if (networkPrefix === null) {
    throw new Error(
      "networkPrefix must be an exact integer between 0 and 16383.",
    );
  }
  if (!isVpnExitClass(value.exitClass)) {
    throw new Error("VPN exitClass is not supported by this endpoint.");
  }
  return {
    toriiUrl: normalizeVpnToriiUrl(value.toriiUrl),
    chainId: normalizeChainId(value.chainId),
    accountId: normalizeVpnAccountId(
      value.accountId,
      "accountId",
      networkPrefix,
    ),
    networkPrefix,
    privateKeyHex: normalizeHex(value.privateKeyHex, "privateKeyHex"),
    signingAlgorithm: normalizeVpnSigningAlgorithm(value.signingAlgorithm),
    exitClass: value.exitClass,
  };
};

const resolveVpnRuntimeContext = (
  input?: Partial<
    Pick<VpnAuthContext, "toriiUrl" | "chainId" | "accountId" | "networkPrefix">
  > | null,
): VpnRuntimeContext | null => {
  if (!input) {
    return null;
  }
  try {
    const networkPrefix = normalizeVpnNetworkPrefix(input.networkPrefix);
    if (networkPrefix === null) return null;
    const toriiUrl = normalizeVpnToriiUrl(input.toriiUrl);
    const chainId = normalizeChainId(input.chainId);
    const accountId = normalizeVpnAccountId(
      input.accountId,
      "accountId",
      networkPrefix,
    );
    return {
      key: JSON.stringify([toriiUrl, chainId, networkPrefix, accountId]),
      toriiUrl,
      chainId,
      accountId,
      networkPrefix,
    };
  } catch {
    return null;
  }
};

const VPN_EXIT_CLASSES: readonly VpnExitClass[] = [
  "standard",
  "low-latency",
  "high-security",
];

const isVpnExitClass = (value: unknown): value is VpnExitClass =>
  typeof value === "string" &&
  (VPN_EXIT_CLASSES as readonly string[]).includes(value);

export const resolveVpnRelayEndpoint = (
  relayEndpoint: string,
  toriiUrl: string,
) => {
  const segments = relayEndpoint
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return relayEndpoint;
  }
  const [hostKind, hostValue] = segments;
  if (
    (hostKind !== "dns" && hostKind !== "dns4" && hostKind !== "dns6") ||
    hostValue !== "torii"
  ) {
    return relayEndpoint;
  }
  try {
    const hostname = new URL(toriiUrl).hostname.trim();
    if (!hostname) {
      return relayEndpoint;
    }
    const ipFamily = isIP(hostname);
    segments[0] = ipFamily === 4 ? "ip4" : ipFamily === 6 ? "ip6" : hostKind;
    segments[1] = hostname;
    return `/${segments.join("/")}`;
  } catch {
    return relayEndpoint;
  }
};

export const resolveVpnRelayEndpointForController = async (
  relayEndpoint: string,
  toriiUrl: string,
) => {
  const normalized = resolveVpnRelayEndpoint(relayEndpoint, toriiUrl);
  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return normalized;
  }
  const [hostKind, hostValue] = segments;
  if (hostKind !== "dns" && hostKind !== "dns4" && hostKind !== "dns6") {
    return normalized;
  }
  try {
    const lookupOptions =
      hostKind === "dns4"
        ? { family: 4 as const }
        : hostKind === "dns6"
          ? { family: 6 as const }
          : {};
    const resolved = await dnsLookup(hostValue, lookupOptions);
    const address = typeof resolved === "string" ? resolved : resolved.address;
    const family =
      typeof resolved === "string" ? isIP(resolved) : resolved.family;
    if (family !== 4 && family !== 6) {
      return normalized;
    }
    segments[0] = family === 4 ? "ip4" : "ip6";
    segments[1] = address;
    return `/${segments.join("/")}`;
  } catch {
    return normalized;
  }
};

export const resolveVpnRoutePushesForController = (
  routePushes: readonly string[],
) => {
  if (routePushes.length === 0) {
    throw new Error(
      "VPN route pushes are required; the controller will not invent full-tunnel routes.",
    );
  }
  return [...routePushes];
};

export const resolveVpnExcludedRoutesForController = (
  excludedRoutes: readonly string[],
  relayEndpoint: string,
  routePushes: readonly string[],
) => {
  const normalized = [...excludedRoutes];
  const segments = relayEndpoint
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return normalized;
  }

  const [hostKind, hostValue] = segments;
  const relayCidr =
    hostKind === "ip4" && routePushes.includes("0.0.0.0/0")
      ? `${hostValue}/32`
      : hostKind === "ip6" && routePushes.includes("::/0")
        ? `${hostValue}/128`
        : null;
  if (!relayCidr || normalized.includes(relayCidr)) {
    return normalized;
  }
  normalized.push(relayCidr);
  return normalized;
};

const normalizeProfile = (
  profile: unknown,
  toriiUrl: string,
): VpnProfile | null => {
  if (!profile) {
    return null;
  }
  const parsed = parseExactVpnProfile(profile);
  return {
    ...parsed,
    relayEndpoint: parsed.relayEndpoint
      ? resolveVpnRelayEndpoint(parsed.relayEndpoint, toriiUrl)
      : "",
    supportedExitClasses: parsed.supportedExitClasses.map((value) => {
      if (!isVpnExitClass(value)) {
        throw new Error("VPN profile returned an unsupported service class.");
      }
      return value;
    }),
    defaultExitClass: (() => {
      if (!isVpnExitClass(parsed.defaultExitClass)) {
        throw new Error(
          "VPN profile returned an unsupported default service class.",
        );
      }
      return parsed.defaultExitClass;
    })(),
    routePushes: [...parsed.routePushes],
    excludedRoutes: [...parsed.excludedRoutes],
    dnsServers: [...parsed.dnsServers],
    tunnelAddresses: [...parsed.tunnelAddresses],
    flowLabelBits: 24,
  };
};

const normalizeProfileExitClass = (
  profile: VpnProfile | null,
  requestedExitClass: VpnExitClass,
): VpnExitClass => {
  if (!profile) {
    return requestedExitClass;
  }
  if (!profile.supportedExitClasses.includes(requestedExitClass)) {
    throw new Error(
      `VPN service class "${requestedExitClass}" is not supported by this endpoint.`,
    );
  }
  return requestedExitClass;
};

const normalizeReceipt = (
  receipt: unknown,
  toriiUrl?: string,
  expectedAccountId?: string,
): VpnReceipt => {
  const parsed = parseExactVpnReceipt(receipt);
  if (expectedAccountId && parsed.accountId !== expectedAccountId) {
    throw new Error(
      "VPN receipt account does not match the authenticated wallet.",
    );
  }
  if (!isVpnExitClass(parsed.exitClass)) {
    throw new Error("VPN receipt returned an unsupported service class.");
  }
  if (
    parsed.receiptSource !== "torii" &&
    parsed.receiptSource !== "relay" &&
    parsed.receiptSource !== "wsv"
  ) {
    throw new Error("VPN receipt returned an unsupported canonical source.");
  }
  const exitClass = parsed.exitClass;
  const receiptSource = parsed.receiptSource;
  return {
    ...parsed,
    exitClass,
    relayEndpoint: toriiUrl
      ? resolveVpnRelayEndpoint(parsed.relayEndpoint, toriiUrl)
      : parsed.relayEndpoint,
    receiptSource,
    settleLeaseInstruction: parsed.settleLeaseInstruction
      ? { ...parsed.settleLeaseInstruction }
      : null,
  };
};

const assertVpnFieldMatches = (
  label: string,
  actual: unknown,
  expected: unknown,
) => {
  const matches =
    Array.isArray(actual) && Array.isArray(expected)
      ? actual.length === expected.length &&
        actual.every((value, index) => value === expected[index])
      : actual === expected;
  if (!matches) {
    throw new Error(
      `${label} does not match the previously reviewed VPN data.`,
    );
  }
};

const VPN_PROFILE_BOUND_QUOTE_FIELDS = [
  "relayEndpoint",
  "leaseSecs",
  "operatorAccountId",
  "leaseFee",
  "routePushes",
  "excludedRoutes",
  "dnsServers",
  "tunnelAddresses",
  "mtuBytes",
  "meterFamily",
  "flowLabelBits",
  "paddingBudgetMs",
  "relayIdHex",
  "relayMldsa65PublicKeyHex",
  "descriptorCommitHex",
  "tlsServerName",
  "relayTlsSpkiSha256Hex",
  "relayCertificateSha256Hex",
  "directorySnapshotDigestHex",
] as const satisfies ReadonlyArray<keyof VpnProfile & keyof ToriiVpnQuote>;

const normalizeQuote = (
  value: unknown,
  toriiUrl: string,
  profile: VpnProfile,
  expected: {
    accountId: string;
    exitClass: VpnExitClass;
    meteringPublicKeyHex: string;
  },
): ToriiVpnQuote => {
  const parsed = parseExactVpnQuote(value);
  const normalized = {
    ...parsed,
    relayEndpoint: resolveVpnRelayEndpoint(parsed.relayEndpoint, toriiUrl),
    routePushes: [...parsed.routePushes],
    excludedRoutes: [...parsed.excludedRoutes],
    dnsServers: [...parsed.dnsServers],
    tunnelAddresses: [...parsed.tunnelAddresses],
    openLeaseInstruction: { ...parsed.openLeaseInstruction },
  };
  assertVpnFieldMatches(
    "VPN quote accountId",
    normalized.accountId,
    expected.accountId,
  );
  assertVpnFieldMatches(
    "VPN quote exitClass",
    normalized.exitClass,
    expected.exitClass,
  );
  assertVpnFieldMatches(
    "VPN quote meteringPublicKeyHex",
    normalized.meteringPublicKeyHex,
    expected.meteringPublicKeyHex,
  );
  for (const field of VPN_PROFILE_BOUND_QUOTE_FIELDS) {
    assertVpnFieldMatches(
      `VPN quote ${field}`,
      normalized[field],
      profile[field],
    );
  }
  if (normalized.quoteExpiresAtMs <= nowMs()) {
    throw new Error("VPN quote is already expired.");
  }
  return normalized;
};

const VPN_QUOTE_BOUND_SESSION_FIELDS = [
  "accountId",
  "exitClass",
  "relayEndpoint",
  "leaseSecs",
  "meterFamily",
  "quoteId",
  "paymentReference",
  "feeAssetId",
  "escrowAccountId",
  "operatorAccountId",
  "leaseFee",
  "flowLabelBits",
  "paddingBudgetMs",
  "relayIdHex",
  "relayMldsa65PublicKeyHex",
  "descriptorCommitHex",
  "tlsServerName",
  "relayTlsSpkiSha256Hex",
  "relayCertificateSha256Hex",
  "directorySnapshotDigestHex",
  "routePushes",
  "excludedRoutes",
  "dnsServers",
  "tunnelAddresses",
  "mtuBytes",
] as const satisfies ReadonlyArray<keyof ToriiVpnQuote & keyof ToriiVpnSession>;

const VPN_STABLE_SESSION_FIELDS = [
  ...VPN_QUOTE_BOUND_SESSION_FIELDS,
  "sessionId",
  "expiresAtMs",
  "connectedAtMs",
  "paymentTxHash",
  "helperTicketHex",
  "status",
] as const satisfies ReadonlyArray<keyof ToriiVpnSession>;

export class VpnRuntime {
  private readonly receiptsPath: string;

  private readonly activeSessionPath: string;

  private readonly helperVersion: string;

  private readonly platform: string;

  private readonly clients = new Map<string, FirstReleaseVpnTransport>();

  private readonly controller: VpnLocalController;

  private receipts: VpnReceipt[];

  private receiptsContextKey: string | null = null;

  private receiptsGeneration = 0;

  private activeSession: ActiveVpnSession | null = null;

  private activeSessionContextVisible = true;

  private state: VpnStatus["state"] = "idle";

  private lastError: string | null = null;

  private reconcileState: string | null = null;

  private remoteSessionActive = false;

  constructor(options: {
    userDataPath: string;
    helperVersion: string;
    controller?: VpnLocalController;
    isPackaged?: boolean;
    resourcesPath?: string | null;
  }) {
    this.platform = process.platform;
    this.helperVersion = options.helperVersion;
    this.receiptsPath = join(options.userDataPath, "vpn", "receipts.json");
    this.activeSessionPath = join(
      options.userDataPath,
      "vpn",
      "active-session.json",
    );
    this.controller =
      options.controller ??
      new BundledVpnController({
        isPackaged: options.isPackaged === true,
        resourcesPath: options.resourcesPath,
      });
    mkdirSync(dirname(this.receiptsPath), { recursive: true });
    this.receipts = this.loadReceipts();
    this.activeSession = this.loadActiveSession();
    if (this.activeSession) {
      this.state = this.activeSession.pendingRemoteExpiry
        ? "remote-expiry-pending"
        : "reconciling";
    }
  }

  async getAvailability(input: unknown): Promise<VpnAvailability> {
    const validatedInput = requireVpnAvailabilityInput(input);
    if (!this.isPlatformSupported()) {
      return {
        platformSupported: false,
        helperManaged: true,
        helperReady: false,
        serverReachable: false,
        profileAvailable: false,
        actionsEnabled: false,
        status: "unsupported",
        message: "Sora VPN currently supports macOS and Linux only.",
        helperVersion: this.helperVersion,
        platform: this.platform,
        controllerInstalled: false,
        controllerVersion: null,
        controllerKind: null,
        controllerPath: null,
        repairRequired: false,
        systemTunnelConfigured: false,
        systemTunnelActive: false,
        systemTunnelKind: null,
        systemTunnelInterface: null,
        systemTunnelService: null,
      };
    }
    let controller: VpnControllerStatus;
    try {
      controller = await this.controller.refreshCapability();
    } catch (error) {
      return {
        platformSupported: true,
        helperManaged: true,
        helperReady: false,
        serverReachable: false,
        profileAvailable: false,
        actionsEnabled: false,
        status: "error",
        message: sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error),
        ),
        helperVersion: this.helperVersion,
        platform: this.platform,
        controllerInstalled: false,
        controllerVersion: null,
        controllerKind: null,
        controllerPath: null,
        repairRequired: false,
        systemTunnelConfigured: false,
        systemTunnelActive: false,
        systemTunnelKind: null,
        systemTunnelInterface: null,
        systemTunnelService: null,
      };
    }

    let profile: VpnProfile | null = null;
    let profileError: unknown = null;
    try {
      profile = await this.fetchProfile(validatedInput.toriiUrl);
    } catch (error) {
      profileError = error;
    }
    const profileAvailable = Boolean(profile?.available);
    const actionsEnabled =
      profileAvailable && controller.installed && !controller.repairRequired;
    const message = controller.repairRequired
      ? controller.message
      : !controller.installed
        ? controller.message
        : profileError
          ? sanitizeErrorMessage(
              profileError instanceof Error
                ? profileError.message
                : String(profileError),
            )
          : !profileAvailable
            ? "VPN control plane is unavailable on this Torii node."
            : controller.message;
    return {
      platformSupported: true,
      helperManaged: true,
      helperReady: controller.installed && !controller.repairRequired,
      serverReachable: profileError === null && profile !== null,
      profileAvailable,
      actionsEnabled,
      status: actionsEnabled
        ? "ready"
        : profileError
          ? "error"
          : !profileAvailable
            ? "unavailable"
            : "error",
      message,
      helperVersion: this.helperVersion,
      platform: this.platform,
      controllerInstalled: controller.installed,
      controllerVersion: controller.version,
      controllerKind: controller.controllerKind,
      controllerPath: controller.controllerPath,
      repairRequired: controller.repairRequired,
      systemTunnelConfigured: controller.installed,
      systemTunnelActive: controller.active,
      systemTunnelKind: controller.controllerKind,
      systemTunnelInterface: controller.interfaceName,
      systemTunnelService: controller.networkService,
    };
  }

  async getProfile(input: unknown): Promise<VpnProfile | null> {
    const validatedInput = requireVpnAvailabilityInput(input);
    return this.fetchProfile(validatedInput.toriiUrl);
  }

  async getStatus(input?: unknown): Promise<VpnStatus> {
    if (input === undefined) {
      const controller = await this.controller.getStatus();
      return this.buildLocalControllerStatus(controller);
    }
    const validatedInput = requireVpnStatusInput(input);
    const controller = await this.reconcile(validatedInput);
    return this.buildStatus(controller);
  }

  async connect(input: VpnConnectInput): Promise<VpnStatus> {
    input = requireVpnConnectInput(input);
    if (!this.isPlatformSupported()) {
      throw new Error("Sora VPN currently supports macOS and Linux only.");
    }
    const requestedContext = this.activateReceiptsContext(input);
    if (!requestedContext) {
      throw new Error(
        "VPN endpoint, chain, network prefix, and account context are required.",
      );
    }
    if (
      this.activeSession &&
      !this.inputMatchesActiveSessionContext(input, this.activeSession)
    ) {
      this.markActiveSessionContextMismatch(input);
      throw new Error(
        "An active VPN session belongs to a different endpoint, chain, network prefix, or account. Switch back to its owning wallet to disconnect it.",
      );
    }
    this.state = "connecting";
    this.lastError = null;
    this.reconcileState = null;
    if (this.activeSession) {
      await this.disconnect(input);
    }

    const controller = await this.controller.refreshCapability();
    if (!controller.installed) {
      this.state = "error";
      this.lastError = controller.message;
      throw new Error(controller.message);
    }
    if (controller.repairRequired) {
      this.state = "repair-needed";
      this.lastError = controller.message;
      throw new Error(controller.message);
    }

    const profile = await this.fetchProfile(input.toriiUrl);
    if (!profile) {
      this.state = "error";
      this.lastError = "VPN control plane is unavailable on this Torii node.";
      throw new Error(this.lastError);
    }
    if (!profile.available) {
      this.state = "error";
      this.lastError = "VPN is disabled on this Torii node.";
      throw new Error(this.lastError);
    }

    const exitClass = normalizeProfileExitClass(profile, input.exitClass);
    const chainId = normalizeChainId(input.chainId);
    const networkId = NetworkId.parse(
      resolveFirstReleaseNetworkIdLiteral({
        chainId,
        networkPrefix: input.networkPrefix,
      }),
    );
    const accountId = normalizeVpnAccountId(
      input.accountId,
      "accountId",
      input.networkPrefix,
    );
    const signingAlgorithm = normalizeVpnSigningAlgorithm(
      input.signingAlgorithm,
    );
    const client = this.getClient(input.toriiUrl);
    let session: ToriiVpnSession | null = null;
    let validatedSession: ActiveVpnSession | null = null;
    let canonicalAuth: ReturnType<typeof buildVpnCanonicalAuth> | null = null;
    try {
      canonicalAuth = buildVpnCanonicalAuth(
        {
          accountId,
          chainId,
          networkPrefix: input.networkPrefix,
          privateKeyHex: input.privateKeyHex,
          signingAlgorithm,
        },
        "VPN connect",
        networkId,
      );
      const meteringPublicKeyHex = generateVpnMeteringPublicKeyHex();
      const quote = normalizeQuote(
        await client.createVpnQuote(
          {
            exitClass,
            meteringPublicKeyHex,
          },
          canonicalAuth,
        ),
        input.toriiUrl,
        profile,
        { accountId, exitClass, meteringPublicKeyHex },
      );
      const paymentDraft = buildFirstReleaseAuthorityTransactionDraft({
        networkId,
        networkPrefix: input.networkPrefix,
        authority: accountId,
        instructions: normalizeVpnTxInstructions([quote.openLeaseInstruction]),
      });
      const paymentFeeQuote = await client.quoteAuthorityTransaction(
        paymentDraft,
        canonicalAuth,
      );
      const paymentTransaction = signFirstReleaseAuthorityTransaction({
        networkId,
        draft: paymentDraft,
        quote: paymentFeeQuote,
        privateKey: canonicalAuth.privateKey,
        privateKeyAlgorithm: signingAlgorithm,
      });
      const paymentTxHash = paymentTransaction.hash.toString("hex");
      await submitFirstReleaseTransaction({
        toriiUrl: input.toriiUrl,
        signedTransaction: paymentTransaction.signedTransaction,
      });
      await waitForVpnPaymentFinalizedBlock(
        client,
        input.toriiUrl,
        paymentTxHash,
      );
      session = await client.createVpnSession(
        {
          exitClass,
          quoteId: quote.quoteId,
          paymentTxHash,
          meteringPublicKeyHex,
        },
        canonicalAuth,
      );
      if (session.exitClass !== exitClass) {
        throw new Error(
          `VPN session service class mismatch: requested "${exitClass}", received "${String(session.exitClass)}".`,
        );
      }
      const normalizedSession = this.normalizeRemoteSession(
        session,
        {
          ...input,
          accountId,
          signingAlgorithm,
        },
        false,
        { quote, paymentTxHash },
      );
      validatedSession = normalizedSession;
      const controllerRelayEndpoint =
        await resolveVpnRelayEndpointForController(
          normalizedSession.relayEndpoint,
          input.toriiUrl,
        );
      const controllerRoutePushes = resolveVpnRoutePushesForController(
        normalizedSession.routePushes,
      );
      await this.controller.connect({
        sessionId: normalizedSession.sessionId,
        relayEndpoint: controllerRelayEndpoint,
        exitClass: normalizedSession.exitClass,
        helperTicketHex: normalizedSession.helperTicketHex,
        routePushes: controllerRoutePushes,
        excludedRoutes: resolveVpnExcludedRoutesForController(
          normalizedSession.excludedRoutes,
          controllerRelayEndpoint,
          controllerRoutePushes,
        ),
        dnsServers: normalizedSession.dnsServers,
        tunnelAddresses: normalizedSession.tunnelAddresses,
        mtuBytes: normalizedSession.mtuBytes,
      });
      this.activeSession = normalizedSession;
      this.persistActiveSession();
      this.remoteSessionActive = true;
      this.state = "connected";
      this.lastError = null;
      return this.getStatus({
        toriiUrl: normalizedSession.toriiUrl,
        chainId: normalizedSession.chainId,
        accountId: normalizedSession.accountId,
        networkPrefix: normalizedSession.networkPrefix,
        privateKeyHex: normalizedSession.privateKeyHex,
        signingAlgorithm: normalizedSession.signingAlgorithm,
      });
    } catch (error) {
      if (validatedSession) {
        validatedSession.pendingRemoteExpiry = true;
        this.activeSession = validatedSession;
        this.remoteSessionActive = true;
        this.reconcileState = "remote-expiry-pending";
      }
      this.state = "error";
      this.lastError = sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      canonicalAuth?.privateKey.fill(0);
    }
  }

  async disconnect(input: unknown): Promise<VpnStatus> {
    const validatedInput = requireVpnStatusInput(input);
    if (!this.activeSession) {
      this.activateReceiptsContext(validatedInput);
      const controller = await this.reconcile(validatedInput);
      this.state = controller.active ? "repair-needed" : "idle";
      return this.buildStatus(controller);
    }

    if (
      !this.inputMatchesActiveSessionContext(validatedInput, this.activeSession)
    ) {
      this.markActiveSessionContextMismatch(validatedInput);
      const controller = await this.controller.getStatus();
      return this.buildStatus(controller);
    }
    this.activeSessionContextVisible = true;
    this.state = "disconnecting";
    this.reconcileState = null;
    const session = this.activeSession;
    const controller = await this.controller.disconnect();
    if (controller.repairRequired) {
      this.state = "repair-needed";
      this.lastError = controller.message;
      return this.buildStatus(controller);
    }

    session.pendingRemoteExpiry = true;
    this.persistActiveSession();
    this.remoteSessionActive = session.expiresAtMs > nowMs();
    this.state = this.remoteSessionActive ? "remote-expiry-pending" : "idle";
    this.reconcileState = this.remoteSessionActive
      ? "remote-expiry-pending"
      : "expired";
    this.lastError = this.remoteSessionActive
      ? "The local tunnel is disconnected. The prepaid remote lease remains active until its fixed expiry because the first-release Torii contract has no session-delete operation."
      : null;
    if (!this.remoteSessionActive) {
      this.activeSession = null;
      this.persistActiveSession();
    }
    return this.buildStatus(controller);
  }

  async disconnectLocal(): Promise<VpnStatus> {
    this.state = "disconnecting";
    this.reconcileState = null;
    const controller = await this.controller.disconnect();
    if (controller.repairRequired) {
      this.state = "repair-needed";
      this.lastError = controller.message;
      return this.buildStatus(controller);
    }

    if (!this.activeSession) {
      this.remoteSessionActive = false;
      this.state = "idle";
      this.lastError = null;
      return this.buildLocalControllerStatus(controller);
    }

    this.activeSession.pendingRemoteExpiry = true;
    this.persistActiveSession();
    this.remoteSessionActive = true;
    this.state = "remote-expiry-pending";
    this.reconcileState = "remote-expiry-pending";
    this.lastError =
      "The local tunnel is disconnected. The prepaid remote lease remains active until its fixed expiry because the first-release Torii contract has no session-delete operation.";
    return this.buildStatus(controller);
  }

  async repair(): Promise<VpnStatus> {
    await this.controller.repair();
    const controller = await this.controller.getStatus();
    if (controller.repairRequired) {
      this.state = "repair-needed";
      this.reconcileState = "controller-repair-required";
      this.lastError = controller.message;
    } else if (!this.activeSession) {
      this.state = controller.active ? "repair-needed" : "idle";
      this.reconcileState = controller.active
        ? "local-tunnel-active-without-session"
        : null;
      this.lastError = null;
    } else if (this.activeSessionContextVisible) {
      this.state = controller.active
        ? this.activeSession.pendingRemoteExpiry
          ? "remote-expiry-pending"
          : "connected"
        : "reconciling";
      this.reconcileState = controller.active
        ? this.activeSession.pendingRemoteExpiry
          ? "remote-expiry-pending"
          : null
        : "local-controller-repaired-awaiting-live-status";
      this.lastError = null;
    }
    return this.buildLocalControllerStatus(controller);
  }

  async listReceipts(input?: unknown): Promise<VpnReceipt[]> {
    if (input === undefined) {
      this.activateReceiptsContext(null);
      return [];
    }
    const validatedInput = requireVpnStatusInput(input);
    const receiptContext = this.activateReceiptsContext(validatedInput);
    if (!receiptContext) throw new Error("VPN status input is invalid.");
    const auth = this.resolveAuthInput(validatedInput, null);
    if (auth) {
      await this.syncReceiptsFromServer(auth);
    }
    return this.receiptsContextKey === receiptContext.key
      ? [...this.receipts]
      : [];
  }

  async shutdown() {
    this.persistActiveSession();
  }

  private activateReceiptsContext(
    input?: Partial<VpnAuthContext> | ActiveVpnSession | null,
  ): VpnRuntimeContext | null {
    const context = resolveVpnRuntimeContext(input);
    if (!context) {
      if (this.receiptsContextKey !== null || this.receipts.length > 0) {
        this.receiptsGeneration += 1;
      }
      this.receipts = [];
      this.receiptsContextKey = null;
      return null;
    }
    if (this.receiptsContextKey !== context.key) {
      this.receiptsGeneration += 1;
      this.receipts = [];
      this.receiptsContextKey = context.key;
    }
    return context;
  }

  private inputMatchesActiveSessionContext(
    input: VpnStatusInput | undefined,
    session: ActiveVpnSession,
  ) {
    const ownerContext = resolveVpnRuntimeContext(session);
    const requestedContext = resolveVpnRuntimeContext({
      toriiUrl: input?.toriiUrl ?? session.toriiUrl,
      chainId: input?.chainId ?? session.chainId,
      accountId: input?.accountId ?? session.accountId,
      networkPrefix: input?.networkPrefix ?? session.networkPrefix,
    });
    return Boolean(
      ownerContext &&
        requestedContext &&
        ownerContext.key === requestedContext.key,
    );
  }

  private markActiveSessionContextMismatch(input?: VpnStatusInput) {
    this.activateReceiptsContext(input);
    this.activeSessionContextVisible = false;
    this.remoteSessionActive = false;
    this.state = "repair-needed";
    this.reconcileState = "active-session-context-mismatch";
    this.lastError =
      "An active VPN session belongs to a different endpoint, chain, network prefix, or account. Switch back to its owning wallet to manage it.";
  }

  private isPlatformSupported() {
    return SUPPORTED_PLATFORMS.has(this.platform);
  }

  private getClient(toriiUrl: string) {
    const normalized = normalizeVpnToriiUrl(toriiUrl);
    const cached = this.clients.get(normalized);
    if (cached) {
      return cached;
    }
    const client = new FirstReleaseVpnTransport(normalized, nodeFetch);
    this.clients.set(normalized, client);
    return client;
  }

  private async fetchProfile(toriiUrl: string) {
    const profile = await this.getClient(toriiUrl).getVpnProfile();
    return normalizeProfile(profile, toriiUrl);
  }

  private loadReceipts(): VpnReceipt[] {
    // Receipt history is fetched live for the active authenticated endpoint.
    // Quarantine the former global cross-network cache without migration.
    rmSync(this.receiptsPath, { force: true });
    return [];
  }

  private loadActiveSession(): ActiveVpnSession | null {
    // First-release boundary: the former global file was neither endpoint
    // scoped nor safe to retain because it included signing material and the
    // controller helper ticket. Do not migrate or resume it.
    rmSync(this.activeSessionPath, { force: true });
    return null;
  }

  private persistReceipts() {
    rmSync(this.receiptsPath, { force: true });
  }

  private persistActiveSession() {
    // Keep session secrets and endpoint-derived state in memory only. The
    // platform controller is reconciled explicitly after restart.
    rmSync(this.activeSessionPath, { force: true });
  }

  private normalizeRemoteSession(
    session: unknown,
    auth: VpnAuthContext,
    pendingRemoteExpiry = false,
    expected?: {
      quote?: ToriiVpnQuote;
      paymentTxHash?: string;
      previous?: ActiveVpnSession;
    },
  ): ActiveVpnSession {
    const networkPrefix = normalizeVpnNetworkPrefix(auth.networkPrefix);
    if (networkPrefix === null) {
      throw new Error("networkPrefix is required for a VPN session.");
    }
    const parsed = parseExactVpnSession(session);
    if (!isVpnExitClass(parsed.exitClass)) {
      throw new Error("VPN session returned an unsupported service class.");
    }
    if (parsed.status !== "active") {
      throw new Error("VPN session returned an unsupported status.");
    }
    const exitClass = parsed.exitClass;
    const status: "active" = parsed.status;
    const normalized = {
      ...parsed,
      exitClass,
      relayEndpoint: resolveVpnRelayEndpoint(
        parsed.relayEndpoint,
        auth.toriiUrl,
      ),
      routePushes: [...parsed.routePushes],
      excludedRoutes: [...parsed.excludedRoutes],
      dnsServers: [...parsed.dnsServers],
      tunnelAddresses: [...parsed.tunnelAddresses],
      status,
    };
    assertVpnFieldMatches(
      "VPN session accountId",
      normalized.accountId,
      auth.accountId,
    );
    if (normalized.expiresAtMs <= normalized.connectedAtMs) {
      throw new Error("VPN session expiry must be after its connection time.");
    }
    if (expected?.quote) {
      assertVpnFieldMatches(
        "VPN session sessionId",
        normalized.sessionId,
        expected.quote.sessionIdHex,
      );
      for (const field of VPN_QUOTE_BOUND_SESSION_FIELDS) {
        assertVpnFieldMatches(
          `VPN session ${field}`,
          normalized[field],
          expected.quote[field],
        );
      }
    }
    if (expected?.paymentTxHash) {
      assertVpnFieldMatches(
        "VPN session paymentTxHash",
        normalized.paymentTxHash,
        expected.paymentTxHash,
      );
    }
    if (expected?.previous) {
      for (const field of VPN_STABLE_SESSION_FIELDS) {
        assertVpnFieldMatches(
          `VPN refreshed session ${field}`,
          normalized[field],
          expected.previous[field],
        );
      }
    }
    return {
      toriiUrl: auth.toriiUrl,
      chainId: normalizeChainId(String(auth.chainId ?? "")),
      accountId: auth.accountId,
      networkPrefix,
      privateKeyHex: auth.privateKeyHex,
      signingAlgorithm: normalizeVpnSigningAlgorithm(auth.signingAlgorithm),
      sessionId: normalized.sessionId,
      exitClass: normalized.exitClass,
      relayEndpoint: normalized.relayEndpoint,
      leaseSecs: normalized.leaseSecs,
      expiresAtMs: normalized.expiresAtMs,
      connectedAtMs: normalized.connectedAtMs,
      meterFamily: normalized.meterFamily,
      quoteId: normalized.quoteId,
      paymentReference: normalized.paymentReference,
      paymentTxHash: normalized.paymentTxHash,
      feeAssetId: normalized.feeAssetId,
      escrowAccountId: normalized.escrowAccountId,
      operatorAccountId: normalized.operatorAccountId,
      leaseFee: normalized.leaseFee,
      flowLabelBits: normalized.flowLabelBits,
      paddingBudgetMs: normalized.paddingBudgetMs,
      relayIdHex: normalized.relayIdHex,
      relayMldsa65PublicKeyHex: normalized.relayMldsa65PublicKeyHex,
      descriptorCommitHex: normalized.descriptorCommitHex,
      tlsServerName: normalized.tlsServerName,
      relayTlsSpkiSha256Hex: normalized.relayTlsSpkiSha256Hex,
      relayCertificateSha256Hex: normalized.relayCertificateSha256Hex,
      directorySnapshotDigestHex: normalized.directorySnapshotDigestHex,
      routePushes: normalized.routePushes,
      excludedRoutes: normalized.excludedRoutes,
      dnsServers: normalized.dnsServers,
      tunnelAddresses: normalized.tunnelAddresses,
      mtuBytes: normalized.mtuBytes,
      helperTicketHex: normalized.helperTicketHex,
      bytesIn: normalized.bytesIn,
      bytesOut: normalized.bytesOut,
      status: normalized.status,
      pendingRemoteExpiry,
    };
  }

  private async syncReceiptsFromServer(auth: VpnAuthContext) {
    const context = this.activateReceiptsContext(auth);
    if (!context) {
      return [];
    }
    const generation = ++this.receiptsGeneration;
    const receipts = await runWithVpnCanonicalAuth(
      auth,
      "VPN receipt sync",
      async (canonicalAuth) =>
        parseExactVpnReceiptList(
          await this.getClient(auth.toriiUrl).listVpnReceipts(canonicalAuth),
        ),
    );
    const normalizedReceipts = receipts.items.map((item) =>
      normalizeReceipt(item, auth.toriiUrl, auth.accountId),
    );
    if (
      this.receiptsContextKey !== context.key ||
      this.receiptsGeneration !== generation
    ) {
      return [];
    }
    this.receipts = normalizedReceipts;
    this.persistReceipts();
    return [...this.receipts];
  }

  private resolveAuthInput(
    input?: VpnStatusInput,
    session?: ActiveVpnSession | null,
  ): VpnAuthContext | null {
    if (session && !this.inputMatchesActiveSessionContext(input, session)) {
      return null;
    }
    const toriiUrl = input?.toriiUrl ?? session?.toriiUrl;
    const chainId = input?.chainId ?? session?.chainId;
    const accountIdRaw = input?.accountId ?? session?.accountId;
    const privateKeyHex = input?.privateKeyHex ?? session?.privateKeyHex;
    const signingAlgorithmRaw =
      input?.signingAlgorithm ?? session?.signingAlgorithm;
    const networkPrefix = input?.networkPrefix ?? session?.networkPrefix;
    const normalizedNetworkPrefix = normalizeVpnNetworkPrefix(networkPrefix);
    if (
      !toriiUrl ||
      !chainId ||
      !accountIdRaw ||
      !privateKeyHex ||
      !signingAlgorithmRaw ||
      normalizedNetworkPrefix === null
    ) {
      return null;
    }
    const signingAlgorithm = normalizeVpnSigningAlgorithm(signingAlgorithmRaw);
    return {
      toriiUrl,
      chainId,
      accountId: normalizeVpnAccountId(
        accountIdRaw,
        "accountId",
        normalizedNetworkPrefix,
      ),
      privateKeyHex,
      signingAlgorithm,
      networkPrefix: normalizedNetworkPrefix,
    };
  }

  private async reconcile(input?: VpnStatusInput) {
    const controller = await this.controller.getStatus();
    if (controller.repairRequired) {
      this.state = "repair-needed";
      this.reconcileState = "controller-repair-required";
      this.lastError = controller.message;
    }

    if (!this.activeSession) {
      this.activeSessionContextVisible = true;
      this.activateReceiptsContext(input);
      this.remoteSessionActive = false;
      if (controller.active && !controller.repairRequired) {
        this.state = "repair-needed";
        this.reconcileState = "local-tunnel-active-without-session";
      } else if (this.state !== "error" && this.state !== "repair-needed") {
        this.state = "idle";
        this.reconcileState = null;
      }
      return controller;
    }

    if (!this.inputMatchesActiveSessionContext(input, this.activeSession)) {
      this.markActiveSessionContextMismatch(input);
      return controller;
    }
    this.activeSessionContextVisible = true;
    this.activateReceiptsContext(input ?? this.activeSession);

    if (this.activeSession.expiresAtMs <= nowMs()) {
      this.activeSession = null;
      this.persistActiveSession();
      this.remoteSessionActive = false;
      this.state = "idle";
      this.reconcileState = "expired";
      return controller;
    }

    const auth = this.resolveAuthInput(input, this.activeSession);
    if (!auth) {
      this.remoteSessionActive = true;
      this.state = this.activeSession.pendingRemoteExpiry
        ? "remote-expiry-pending"
        : controller.active
          ? "connected"
          : "reconciling";
      this.reconcileState = this.activeSession.pendingRemoteExpiry
        ? "remote-expiry-pending"
        : controller.active
          ? null
          : "waiting-for-authenticated-reconciliation";
      return controller;
    }

    const activeSessionId = this.activeSession.sessionId;
    const remote = await runWithVpnCanonicalAuth(
      auth,
      "VPN status refresh",
      (canonicalAuth) =>
        this.getClient(auth.toriiUrl).getVpnSession(
          activeSessionId,
          canonicalAuth,
        ),
    );

    if (remote) {
      const previousSession = this.activeSession;
      this.activeSession = this.normalizeRemoteSession(
        remote,
        auth,
        previousSession.pendingRemoteExpiry,
        { previous: previousSession },
      );
      this.persistActiveSession();
      this.remoteSessionActive = true;
      if (this.activeSession.pendingRemoteExpiry || !controller.active) {
        this.state = "remote-expiry-pending";
        this.reconcileState = "remote-expiry-pending";
      } else if (controller.repairRequired) {
        this.state = "repair-needed";
        this.reconcileState = "controller-repair-required";
      } else {
        this.state = "connected";
        this.reconcileState = null;
        this.lastError = null;
      }
      return controller;
    }

    this.remoteSessionActive = false;
    if (controller.active) {
      this.state = "repair-needed";
      this.reconcileState = "local-tunnel-active-remote-missing";
      return controller;
    }

    this.activeSession = null;
    this.persistActiveSession();
    this.state = "idle";
    this.reconcileState = null;
    this.lastError = null;
    await this.syncReceiptsFromServer(auth).catch(() => undefined);
    return controller;
  }

  private buildStatus(controller: VpnControllerStatus): VpnStatus {
    if (!this.activeSession || !this.activeSessionContextVisible) {
      return emptyStatus({
        state: controller.repairRequired ? "repair-needed" : this.state,
        helperStatus: controller.active
          ? "controller-active"
          : "controller-idle",
        controllerInstalled: controller.installed,
        controllerVersion: controller.version,
        controllerKind: controller.controllerKind,
        reconcileState: this.reconcileState,
        repairRequired: controller.repairRequired,
        remoteSessionActive: false,
        systemTunnelActive: controller.active,
        systemTunnelKind: controller.controllerKind,
        systemTunnelInterface: controller.interfaceName,
        systemTunnelService: controller.networkService,
        bytesIn: controller.bytesIn,
        bytesOut: controller.bytesOut,
        errorMessage: this.lastError,
        lastReceipt: this.receipts[0] ?? null,
      });
    }

    const durationMs = Math.max(0, nowMs() - this.activeSession.connectedAtMs);
    return emptyStatus({
      state: this.state,
      sessionId: this.activeSession.sessionId,
      exitClass: this.activeSession.exitClass,
      relayEndpoint: this.activeSession.relayEndpoint,
      connectedAtMs: this.activeSession.connectedAtMs,
      expiresAtMs: this.activeSession.expiresAtMs,
      durationMs,
      bytesIn: controller.bytesIn || this.activeSession.bytesIn,
      bytesOut: controller.bytesOut || this.activeSession.bytesOut,
      routePushes: this.activeSession.routePushes,
      excludedRoutes: this.activeSession.excludedRoutes,
      dnsServers: this.activeSession.dnsServers,
      tunnelAddresses: this.activeSession.tunnelAddresses,
      mtuBytes: this.activeSession.mtuBytes,
      helperStatus: controller.active ? "controller-active" : "controller-idle",
      controllerInstalled: controller.installed,
      controllerVersion: controller.version,
      controllerKind: controller.controllerKind,
      reconcileState: this.reconcileState,
      repairRequired: controller.repairRequired,
      remoteSessionActive: this.remoteSessionActive,
      systemTunnelActive: controller.active,
      systemTunnelKind: controller.controllerKind,
      systemTunnelInterface: controller.interfaceName,
      systemTunnelService: controller.networkService,
      errorMessage: this.lastError,
      lastReceipt: this.receipts[0] ?? null,
    });
  }

  private buildLocalControllerStatus(
    controller: VpnControllerStatus,
  ): VpnStatus {
    const repairRequired = controller.repairRequired || controller.active;
    return emptyStatus({
      state: repairRequired ? "repair-needed" : "idle",
      helperStatus: controller.active ? "controller-active" : "controller-idle",
      controllerInstalled: controller.installed,
      controllerVersion: controller.version,
      controllerKind: controller.controllerKind,
      reconcileState: controller.repairRequired
        ? "controller-repair-required"
        : controller.active
          ? "local-tunnel-active-without-session-context"
          : null,
      repairRequired,
      remoteSessionActive: false,
      systemTunnelActive: controller.active,
      systemTunnelKind: controller.controllerKind,
      systemTunnelInterface: controller.interfaceName,
      systemTunnelService: controller.networkService,
      bytesIn: controller.bytesIn,
      bytesOut: controller.bytesOut,
      errorMessage: controller.repairRequired ? controller.message : null,
      lastReceipt: null,
    });
  }
}
