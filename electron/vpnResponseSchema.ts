import type {
  ToriiVpnProfile,
  ToriiVpnQuote,
  ToriiVpnReceipt,
  ToriiVpnReceiptListResponse,
  ToriiVpnSession,
  ToriiVpnTxInstruction,
} from "@iroha/iroha-js";
import { isIP } from "node:net";

const VPN_EXIT_CLASSES = ["standard", "low-latency", "high-security"] as const;
const VPN_RECEIPT_STATUSES = [
  "disconnected",
  "expired",
  "replaced",
  "settlement_pending",
  "settled",
] as const;
const VPN_RECEIPT_SOURCES = ["torii", "relay", "wsv"] as const;

const VPN_PROFILE_KEYS = [
  "available",
  "defaultExitClass",
  "descriptorCommitHex",
  "directorySnapshotDigestHex",
  "displayBillingLabel",
  "dnsPushIntervalSecs",
  "dnsServers",
  "excludedRoutes",
  "flowLabelBits",
  "leaseFee",
  "leaseSecs",
  "meterFamily",
  "mtuBytes",
  "operatorAccountId",
  "paddingBudgetMs",
  "relayCertificateSha256Hex",
  "relayEndpoint",
  "relayIdHex",
  "relayMldsa65PublicKeyHex",
  "relayTlsSpkiSha256Hex",
  "routePushes",
  "settlementGraceSecs",
  "supportedExitClasses",
  "tlsServerName",
  "tunnelAddresses",
] as const;

const VPN_QUOTE_KEYS = [
  "accountId",
  "descriptorCommitHex",
  "directorySnapshotDigestHex",
  "dnsServers",
  "escrowAccountId",
  "excludedRoutes",
  "exitClass",
  "feeAssetId",
  "flowLabelBits",
  "leaseFee",
  "leaseIdHex",
  "leaseSecs",
  "meterFamily",
  "meteringPublicKeyHex",
  "mtuBytes",
  "openLeaseInstruction",
  "operatorAccountId",
  "paddingBudgetMs",
  "paymentReference",
  "quoteExpiresAtMs",
  "quoteId",
  "relayCertificateSha256Hex",
  "relayEndpoint",
  "relayIdHex",
  "relayMldsa65PublicKeyHex",
  "relayTlsSpkiSha256Hex",
  "routePushes",
  "sessionIdHex",
  "tlsServerName",
  "tunnelAddresses",
] as const;

const VPN_SESSION_KEYS = [
  "accountId",
  "bytesIn",
  "bytesOut",
  "connectedAtMs",
  "descriptorCommitHex",
  "directorySnapshotDigestHex",
  "dnsServers",
  "escrowAccountId",
  "excludedRoutes",
  "exitClass",
  "expiresAtMs",
  "feeAssetId",
  "flowLabelBits",
  "helperTicketHex",
  "leaseFee",
  "leaseSecs",
  "meterFamily",
  "mtuBytes",
  "operatorAccountId",
  "paddingBudgetMs",
  "paymentReference",
  "paymentTxHash",
  "quoteId",
  "relayCertificateSha256Hex",
  "relayEndpoint",
  "relayIdHex",
  "relayMldsa65PublicKeyHex",
  "relayTlsSpkiSha256Hex",
  "routePushes",
  "sessionId",
  "status",
  "tlsServerName",
  "tunnelAddresses",
] as const;

const VPN_RECEIPT_KEYS = [
  "accountId",
  "bytesIn",
  "bytesOut",
  "connectedAtMs",
  "disconnectedAtMs",
  "durationMs",
  "earnedFee",
  "escrowAccountId",
  "exitClass",
  "feeAssetId",
  "leaseFee",
  "leaseIdHex",
  "meterFamily",
  "operatorAccountId",
  "paymentTxHash",
  "quoteId",
  "receiptSource",
  "refundedFee",
  "relayEndpoint",
  "sessionId",
  "settleLeaseInstruction",
  "status",
] as const;

const VPN_RECEIPT_LIST_KEYS = ["items", "total"] as const;
const VPN_INSTRUCTION_KEYS = ["payloadHex", "wireId"] as const;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const requireExactRecord = <TKeys extends readonly string[]>(
  value: unknown,
  keys: TKeys,
  label: string,
): Record<TKeys[number], unknown> => {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
  const actualKeys = Object.keys(value).sort();
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key, index) => key !== keys[index])
  ) {
    throw new Error(`${label} must contain exactly: ${keys.join(", ")}.`);
  }
  return value as Record<TKeys[number], unknown>;
};

const requireBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
};

const requireExactString = (
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean } = {},
): string => {
  if (
    typeof value !== "string" ||
    (!options.allowEmpty && value.length === 0) ||
    value !== value.trim() ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new Error(`${label} must be an exact non-empty string.`);
  }
  return value;
};

const requireUnsignedInteger = (
  value: unknown,
  label: string,
  options: { min?: number; max?: number } = {},
): number => {
  const min = options.min ?? 0;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < min ||
    Number(value) > max
  ) {
    throw new Error(
      `${label} must be a safe integer from ${min} through ${max}.`,
    );
  }
  return Number(value);
};

const requireEnum = <T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T => {
  const literal = requireExactString(value, label);
  if (!values.includes(literal as T)) {
    throw new Error(`${label} must be one of: ${values.join(", ")}.`);
  }
  return literal as T;
};

const requireExactLowerHex = (
  value: unknown,
  bytes: number,
  label: string,
  options: { allowEmpty?: boolean; allowZero?: boolean } = {},
): string => {
  if (options.allowEmpty && value === "") {
    return "";
  }
  if (
    typeof value !== "string" ||
    value.length !== bytes * 2 ||
    /[^0-9a-f]/u.test(value) ||
    (!options.allowZero && /^0+$/u.test(value))
  ) {
    throw new Error(
      `${label} must be exactly ${bytes * 2} lowercase hexadecimal characters${options.allowZero ? "" : " and not all zero"}.`,
    );
  }
  return value;
};

const requireExactEvenLowerHex = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 2 !== 0 ||
    /[^0-9a-f]/u.test(value)
  ) {
    throw new Error(
      `${label} must be a non-empty even-length lowercase hex string.`,
    );
  }
  return value;
};

const requireCanonicalQuantity = (value: unknown, label: string): string => {
  const literal = requireExactString(value, label);
  if (!/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(literal)) {
    throw new Error(`${label} must be a canonical non-negative quantity.`);
  }
  return literal;
};

const requireExactStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  const result = value.map((entry, index) =>
    requireExactString(entry, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    throw new Error(`${label} must not contain duplicate entries.`);
  }
  return result;
};

const requireIpLiteral = (value: unknown, label: string): string => {
  const literal = requireExactString(value, label);
  const family = isIP(literal);
  if (family === 0 || (family === 6 && literal !== literal.toLowerCase())) {
    throw new Error(`${label} must be a canonical IP address literal.`);
  }
  return literal;
};

const requireCidrLiteral = (value: unknown, label: string): string => {
  const literal = requireExactString(value, label);
  const separator = literal.indexOf("/");
  if (separator <= 0 || separator !== literal.lastIndexOf("/")) {
    throw new Error(`${label} must be an IP address and prefix length.`);
  }
  const address = requireIpLiteral(literal.slice(0, separator), `${label} IP`);
  const prefixLiteral = literal.slice(separator + 1);
  if (!/^(?:0|[1-9]\d{0,2})$/u.test(prefixLiteral)) {
    throw new Error(`${label} must contain a canonical prefix length.`);
  }
  const maxPrefix = isIP(address) === 4 ? 32 : 128;
  if (Number(prefixLiteral) > maxPrefix) {
    throw new Error(`${label} prefix length must not exceed ${maxPrefix}.`);
  }
  return literal;
};

const requireNetworkArray = (
  value: unknown,
  label: string,
  options: {
    kind: "cidr" | "ip";
    minItems?: number;
    maxItems: number;
  },
): string[] => {
  const values = requireExactStringArray(value, label);
  const minItems = options.minItems ?? 0;
  if (values.length < minItems || values.length > options.maxItems) {
    throw new Error(
      `${label} must contain from ${minItems} through ${options.maxItems} entries.`,
    );
  }
  return values.map((entry, index) =>
    options.kind === "cidr"
      ? requireCidrLiteral(entry, `${label}[${index}]`)
      : requireIpLiteral(entry, `${label}[${index}]`),
  );
};

const requireTlsServerName = (
  value: unknown,
  label: string,
  allowEmpty = false,
): string => {
  const literal = requireExactString(value, label, { allowEmpty });
  if (allowEmpty && literal === "") {
    return literal;
  }
  const labels = literal.split(".");
  if (
    literal.length > 253 ||
    literal !== literal.toLowerCase() ||
    labels.some(
      (part) =>
        part.length === 0 ||
        part.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(part),
    )
  ) {
    throw new Error(`${label} must be a canonical lowercase DNS name.`);
  }
  return literal;
};

const requireRelayEndpoint = (
  value: unknown,
  label: string,
  allowEmpty = false,
): string => {
  const literal = requireExactString(value, label, { allowEmpty });
  if (allowEmpty && literal === "") {
    return literal;
  }
  const parts = literal.split("/");
  if (
    parts.length !== 6 ||
    parts[0] !== "" ||
    !["ip4", "ip6", "dns", "dns4", "dns6"].includes(parts[1] ?? "") ||
    parts[3] !== "udp" ||
    parts[5] !== "quic"
  ) {
    throw new Error(
      `${label} must use /{ip4|ip6|dns|dns4|dns6}/host/udp/port/quic.`,
    );
  }
  const protocol = parts[1] ?? "";
  const host = parts[2] ?? "";
  const port = parts[4] ?? "";
  if (protocol === "ip4") {
    const octets = host.split(".");
    if (
      octets.length !== 4 ||
      octets.some((octet) => {
        const parsed = Number(octet);
        return !/^(?:0|[1-9]\d{0,2})$/u.test(octet) || parsed > 255;
      })
    ) {
      throw new Error(`${label} must contain a canonical IPv4 address.`);
    }
  } else if (protocol === "ip6") {
    let canonicalHost: string | null = null;
    try {
      canonicalHost = new URL(`https://[${host}]/`).hostname;
    } catch {
      // Rejected by the exact comparison below.
    }
    if (canonicalHost !== `[${host}]` || host !== host.toLowerCase()) {
      throw new Error(
        `${label} must contain a canonical lowercase IPv6 address.`,
      );
    }
  } else {
    requireTlsServerName(host, `${label} host`);
  }
  const numericPort = Number(port);
  if (
    !/^[1-9]\d{0,4}$/u.test(port) ||
    !Number.isSafeInteger(numericPort) ||
    numericPort > 65_535
  ) {
    throw new Error(`${label} must contain a canonical non-zero UDP port.`);
  }
  return literal;
};

const requireTrustTuple = (
  record: Record<string, unknown>,
  label: string,
  allowEmpty = false,
) => ({
  relayIdHex: requireExactLowerHex(
    record.relayIdHex,
    32,
    `${label}.relayIdHex`,
    {
      allowEmpty,
    },
  ),
  relayMldsa65PublicKeyHex: requireExactLowerHex(
    record.relayMldsa65PublicKeyHex,
    1_952,
    `${label}.relayMldsa65PublicKeyHex`,
    { allowEmpty },
  ),
  descriptorCommitHex: requireExactLowerHex(
    record.descriptorCommitHex,
    32,
    `${label}.descriptorCommitHex`,
    { allowEmpty },
  ),
  tlsServerName: requireTlsServerName(
    record.tlsServerName,
    `${label}.tlsServerName`,
    allowEmpty,
  ),
  relayTlsSpkiSha256Hex: requireExactLowerHex(
    record.relayTlsSpkiSha256Hex,
    32,
    `${label}.relayTlsSpkiSha256Hex`,
    { allowEmpty },
  ),
  relayCertificateSha256Hex: requireExactLowerHex(
    record.relayCertificateSha256Hex,
    32,
    `${label}.relayCertificateSha256Hex`,
    { allowEmpty },
  ),
  directorySnapshotDigestHex: requireExactLowerHex(
    record.directorySnapshotDigestHex,
    32,
    `${label}.directorySnapshotDigestHex`,
    { allowEmpty },
  ),
});

const requireInstruction = (
  value: unknown,
  label: string,
): ToriiVpnTxInstruction => {
  const record = requireExactRecord(value, VPN_INSTRUCTION_KEYS, label);
  return {
    wireId: requireExactString(record.wireId, `${label}.wireId`),
    payloadHex: requireExactEvenLowerHex(
      record.payloadHex,
      `${label}.payloadHex`,
    ),
  };
};

export const parseExactVpnProfile = (value: unknown): ToriiVpnProfile => {
  const record = requireExactRecord(value, VPN_PROFILE_KEYS, "VPN profile");
  const available = requireBoolean(record.available, "VPN profile.available");
  const relayEndpoint = requireRelayEndpoint(
    record.relayEndpoint,
    "VPN profile.relayEndpoint",
    !available,
  );
  const trust = requireTrustTuple(record, "VPN profile", !available);
  if (
    !available &&
    (relayEndpoint !== "" || Object.values(trust).some((entry) => entry !== ""))
  ) {
    throw new Error(
      "An unavailable VPN profile must not expose a relay endpoint or partial trust tuple.",
    );
  }
  const supportedExitClasses = requireExactStringArray(
    record.supportedExitClasses,
    "VPN profile.supportedExitClasses",
  ).map((entry, index) =>
    requireEnum(
      entry,
      VPN_EXIT_CLASSES,
      `VPN profile.supportedExitClasses[${index}]`,
    ),
  );
  if (
    supportedExitClasses.length !== VPN_EXIT_CLASSES.length ||
    VPN_EXIT_CLASSES.some(
      (exitClass) => !supportedExitClasses.includes(exitClass),
    )
  ) {
    throw new Error(
      "VPN profile.supportedExitClasses must contain every first-release service class exactly once.",
    );
  }
  const defaultExitClass = requireEnum(
    record.defaultExitClass,
    VPN_EXIT_CLASSES,
    "VPN profile.defaultExitClass",
  );
  if (!supportedExitClasses.includes(defaultExitClass)) {
    throw new Error("VPN profile.defaultExitClass must be supported.");
  }
  return {
    available,
    relayEndpoint,
    supportedExitClasses,
    defaultExitClass,
    leaseSecs: requireUnsignedInteger(
      record.leaseSecs,
      "VPN profile.leaseSecs",
      {
        min: 1,
        max: 0xffff_ffff,
      },
    ),
    dnsPushIntervalSecs: requireUnsignedInteger(
      record.dnsPushIntervalSecs,
      "VPN profile.dnsPushIntervalSecs",
      { min: 30 },
    ),
    meterFamily: requireExactString(
      record.meterFamily,
      "VPN profile.meterFamily",
    ),
    routePushes: requireNetworkArray(
      record.routePushes,
      "VPN profile.routePushes",
      { kind: "cidr", minItems: 1, maxItems: 64 },
    ),
    excludedRoutes: requireNetworkArray(
      record.excludedRoutes,
      "VPN profile.excludedRoutes",
      { kind: "cidr", maxItems: 64 },
    ),
    dnsServers: requireNetworkArray(
      record.dnsServers,
      "VPN profile.dnsServers",
      { kind: "ip", minItems: 1, maxItems: 8 },
    ),
    tunnelAddresses: requireNetworkArray(
      record.tunnelAddresses,
      "VPN profile.tunnelAddresses",
      { kind: "cidr", minItems: 1, maxItems: 8 },
    ),
    mtuBytes: requireUnsignedInteger(record.mtuBytes, "VPN profile.mtuBytes", {
      min: 1_280,
      max: 1_280,
    }),
    displayBillingLabel: requireExactString(
      record.displayBillingLabel,
      "VPN profile.displayBillingLabel",
    ),
    operatorAccountId: requireExactString(
      record.operatorAccountId,
      "VPN profile.operatorAccountId",
    ),
    leaseFee: requireCanonicalQuantity(record.leaseFee, "VPN profile.leaseFee"),
    settlementGraceSecs: requireUnsignedInteger(
      record.settlementGraceSecs,
      "VPN profile.settlementGraceSecs",
      { min: 1 },
    ),
    flowLabelBits: requireUnsignedInteger(
      record.flowLabelBits,
      "VPN profile.flowLabelBits",
      { min: 24, max: 24 },
    ),
    paddingBudgetMs: requireUnsignedInteger(
      record.paddingBudgetMs,
      "VPN profile.paddingBudgetMs",
      { min: 1, max: 65_535 },
    ),
    ...trust,
  };
};

export const parseExactVpnQuote = (value: unknown): ToriiVpnQuote => {
  const record = requireExactRecord(value, VPN_QUOTE_KEYS, "VPN quote");
  return {
    quoteId: requireExactLowerHex(record.quoteId, 32, "VPN quote.quoteId", {
      allowZero: true,
    }),
    leaseIdHex: requireExactLowerHex(
      record.leaseIdHex,
      32,
      "VPN quote.leaseIdHex",
      {
        allowZero: true,
      },
    ),
    sessionIdHex: requireExactLowerHex(
      record.sessionIdHex,
      16,
      "VPN quote.sessionIdHex",
      { allowZero: true },
    ),
    paymentReference: requireExactString(
      record.paymentReference,
      "VPN quote.paymentReference",
    ),
    accountId: requireExactString(record.accountId, "VPN quote.accountId"),
    exitClass: requireEnum(
      record.exitClass,
      VPN_EXIT_CLASSES,
      "VPN quote.exitClass",
    ),
    relayEndpoint: requireRelayEndpoint(
      record.relayEndpoint,
      "VPN quote.relayEndpoint",
    ),
    leaseSecs: requireUnsignedInteger(record.leaseSecs, "VPN quote.leaseSecs", {
      min: 1,
      max: 0xffff_ffff,
    }),
    quoteExpiresAtMs: requireUnsignedInteger(
      record.quoteExpiresAtMs,
      "VPN quote.quoteExpiresAtMs",
    ),
    feeAssetId: requireExactString(record.feeAssetId, "VPN quote.feeAssetId"),
    escrowAccountId: requireExactString(
      record.escrowAccountId,
      "VPN quote.escrowAccountId",
    ),
    operatorAccountId: requireExactString(
      record.operatorAccountId,
      "VPN quote.operatorAccountId",
    ),
    leaseFee: requireCanonicalQuantity(record.leaseFee, "VPN quote.leaseFee"),
    routePushes: requireNetworkArray(
      record.routePushes,
      "VPN quote.routePushes",
      { kind: "cidr", minItems: 1, maxItems: 64 },
    ),
    excludedRoutes: requireNetworkArray(
      record.excludedRoutes,
      "VPN quote.excludedRoutes",
      { kind: "cidr", maxItems: 64 },
    ),
    dnsServers: requireNetworkArray(record.dnsServers, "VPN quote.dnsServers", {
      kind: "ip",
      minItems: 1,
      maxItems: 8,
    }),
    tunnelAddresses: requireNetworkArray(
      record.tunnelAddresses,
      "VPN quote.tunnelAddresses",
      { kind: "cidr", minItems: 1, maxItems: 8 },
    ),
    mtuBytes: requireUnsignedInteger(record.mtuBytes, "VPN quote.mtuBytes", {
      min: 1_280,
      max: 1_280,
    }),
    meterFamily: requireExactString(
      record.meterFamily,
      "VPN quote.meterFamily",
    ),
    flowLabelBits: requireUnsignedInteger(
      record.flowLabelBits,
      "VPN quote.flowLabelBits",
      {
        min: 24,
        max: 24,
      },
    ),
    paddingBudgetMs: requireUnsignedInteger(
      record.paddingBudgetMs,
      "VPN quote.paddingBudgetMs",
      { min: 1, max: 65_535 },
    ),
    ...requireTrustTuple(record, "VPN quote"),
    meteringPublicKeyHex: requireExactLowerHex(
      record.meteringPublicKeyHex,
      32,
      "VPN quote.meteringPublicKeyHex",
      { allowZero: true },
    ),
    openLeaseInstruction: requireInstruction(
      record.openLeaseInstruction,
      "VPN quote.openLeaseInstruction",
    ),
  };
};

export const parseExactVpnSession = (value: unknown): ToriiVpnSession => {
  const record = requireExactRecord(value, VPN_SESSION_KEYS, "VPN session");
  return {
    sessionId: requireExactLowerHex(
      record.sessionId,
      16,
      "VPN session.sessionId",
      {
        allowZero: true,
      },
    ),
    accountId: requireExactString(record.accountId, "VPN session.accountId"),
    exitClass: requireEnum(
      record.exitClass,
      VPN_EXIT_CLASSES,
      "VPN session.exitClass",
    ),
    relayEndpoint: requireRelayEndpoint(
      record.relayEndpoint,
      "VPN session.relayEndpoint",
    ),
    leaseSecs: requireUnsignedInteger(
      record.leaseSecs,
      "VPN session.leaseSecs",
      {
        min: 1,
        max: 0xffff_ffff,
      },
    ),
    expiresAtMs: requireUnsignedInteger(
      record.expiresAtMs,
      "VPN session.expiresAtMs",
    ),
    connectedAtMs: requireUnsignedInteger(
      record.connectedAtMs,
      "VPN session.connectedAtMs",
    ),
    meterFamily: requireExactString(
      record.meterFamily,
      "VPN session.meterFamily",
    ),
    quoteId: requireExactLowerHex(record.quoteId, 32, "VPN session.quoteId", {
      allowZero: true,
    }),
    paymentReference: requireExactString(
      record.paymentReference,
      "VPN session.paymentReference",
    ),
    paymentTxHash: requireExactLowerHex(
      record.paymentTxHash,
      32,
      "VPN session.paymentTxHash",
      { allowZero: true },
    ),
    feeAssetId: requireExactString(record.feeAssetId, "VPN session.feeAssetId"),
    escrowAccountId: requireExactString(
      record.escrowAccountId,
      "VPN session.escrowAccountId",
    ),
    operatorAccountId: requireExactString(
      record.operatorAccountId,
      "VPN session.operatorAccountId",
    ),
    leaseFee: requireCanonicalQuantity(record.leaseFee, "VPN session.leaseFee"),
    flowLabelBits: requireUnsignedInteger(
      record.flowLabelBits,
      "VPN session.flowLabelBits",
      { min: 24, max: 24 },
    ),
    paddingBudgetMs: requireUnsignedInteger(
      record.paddingBudgetMs,
      "VPN session.paddingBudgetMs",
      { min: 1, max: 65_535 },
    ),
    ...requireTrustTuple(record, "VPN session"),
    routePushes: requireNetworkArray(
      record.routePushes,
      "VPN session.routePushes",
      { kind: "cidr", minItems: 1, maxItems: 64 },
    ),
    excludedRoutes: requireNetworkArray(
      record.excludedRoutes,
      "VPN session.excludedRoutes",
      { kind: "cidr", maxItems: 64 },
    ),
    dnsServers: requireNetworkArray(
      record.dnsServers,
      "VPN session.dnsServers",
      { kind: "ip", minItems: 1, maxItems: 8 },
    ),
    tunnelAddresses: requireNetworkArray(
      record.tunnelAddresses,
      "VPN session.tunnelAddresses",
      { kind: "cidr", minItems: 1, maxItems: 8 },
    ),
    mtuBytes: requireUnsignedInteger(record.mtuBytes, "VPN session.mtuBytes", {
      min: 1_280,
      max: 1_280,
    }),
    helperTicketHex: requireExactLowerHex(
      record.helperTicketHex,
      788,
      "VPN session.helperTicketHex",
      { allowZero: true },
    ),
    bytesIn: requireUnsignedInteger(record.bytesIn, "VPN session.bytesIn"),
    bytesOut: requireUnsignedInteger(record.bytesOut, "VPN session.bytesOut"),
    status: requireEnum(
      record.status,
      ["active"] as const,
      "VPN session.status",
    ),
  };
};

export const parseExactVpnReceipt = (value: unknown): ToriiVpnReceipt => {
  const record = requireExactRecord(value, VPN_RECEIPT_KEYS, "VPN receipt");
  const settleLeaseInstruction =
    record.settleLeaseInstruction === null
      ? null
      : requireInstruction(
          record.settleLeaseInstruction,
          "VPN receipt.settleLeaseInstruction",
        );
  return {
    sessionId: requireExactLowerHex(
      record.sessionId,
      16,
      "VPN receipt.sessionId",
      {
        allowZero: true,
      },
    ),
    accountId: requireExactString(record.accountId, "VPN receipt.accountId"),
    exitClass: requireEnum(
      record.exitClass,
      VPN_EXIT_CLASSES,
      "VPN receipt.exitClass",
    ),
    relayEndpoint: requireRelayEndpoint(
      record.relayEndpoint,
      "VPN receipt.relayEndpoint",
    ),
    meterFamily: requireExactString(
      record.meterFamily,
      "VPN receipt.meterFamily",
    ),
    connectedAtMs: requireUnsignedInteger(
      record.connectedAtMs,
      "VPN receipt.connectedAtMs",
    ),
    disconnectedAtMs: requireUnsignedInteger(
      record.disconnectedAtMs,
      "VPN receipt.disconnectedAtMs",
    ),
    durationMs: requireUnsignedInteger(
      record.durationMs,
      "VPN receipt.durationMs",
    ),
    bytesIn: requireUnsignedInteger(record.bytesIn, "VPN receipt.bytesIn"),
    bytesOut: requireUnsignedInteger(record.bytesOut, "VPN receipt.bytesOut"),
    status: requireEnum(
      record.status,
      VPN_RECEIPT_STATUSES,
      "VPN receipt.status",
    ),
    receiptSource: requireEnum(
      record.receiptSource,
      VPN_RECEIPT_SOURCES,
      "VPN receipt.receiptSource",
    ),
    quoteId: requireExactLowerHex(record.quoteId, 32, "VPN receipt.quoteId", {
      allowZero: true,
    }),
    paymentTxHash: requireExactLowerHex(
      record.paymentTxHash,
      32,
      "VPN receipt.paymentTxHash",
      { allowZero: true },
    ),
    feeAssetId: requireExactString(record.feeAssetId, "VPN receipt.feeAssetId"),
    escrowAccountId: requireExactString(
      record.escrowAccountId,
      "VPN receipt.escrowAccountId",
    ),
    operatorAccountId: requireExactString(
      record.operatorAccountId,
      "VPN receipt.operatorAccountId",
    ),
    leaseFee: requireCanonicalQuantity(record.leaseFee, "VPN receipt.leaseFee"),
    earnedFee: requireCanonicalQuantity(
      record.earnedFee,
      "VPN receipt.earnedFee",
    ),
    refundedFee: requireCanonicalQuantity(
      record.refundedFee,
      "VPN receipt.refundedFee",
    ),
    leaseIdHex: requireExactLowerHex(
      record.leaseIdHex,
      32,
      "VPN receipt.leaseIdHex",
      { allowZero: true },
    ),
    settleLeaseInstruction,
  };
};

export const parseExactVpnReceiptList = (
  value: unknown,
): ToriiVpnReceiptListResponse => {
  const record = requireExactRecord(
    value,
    VPN_RECEIPT_LIST_KEYS,
    "VPN receipt list",
  );
  if (!Array.isArray(record.items) || record.items.length > 24) {
    throw new Error("VPN receipt list.items must contain at most 24 receipts.");
  }
  const total = requireUnsignedInteger(record.total, "VPN receipt list.total", {
    max: 24,
  });
  const items = record.items.map(parseExactVpnReceipt);
  if (total !== items.length) {
    throw new Error("VPN receipt list.total must equal items.length.");
  }
  return { items, total };
};
