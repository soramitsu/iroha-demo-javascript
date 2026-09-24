import { Buffer } from "node:buffer";

import {
  NetworkId,
  buildCanonicalRequestHeaders,
} from "@iroha/iroha-js/canonical-request";

import {
  FIRST_RELEASE_FEE_QUOTE_RESPONSE_MAX_BYTES,
  parseFirstReleaseAuthorityFeeQuoteResponse,
  type FirstReleaseAuthorityFeeQuoteResponse,
} from "./firstReleaseFeeQuoteResponse";
import type { FirstReleaseAuthorityTransactionDraft } from "./firstReleaseTransaction";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { withBoundedHttpGetFetchRetry } from "./httpReadRetry";
import { nodeFetch } from "./nodeFetch";
import {
  readBoundedJsonResponse,
  readBoundedResponseBytes,
} from "./boundedJsonResponse";
import {
  parseExactVpnProfile,
  parseExactVpnQuote,
  parseExactVpnReceiptList,
  parseExactVpnSession,
} from "./vpnResponseSchema";
import { normalizeEndpointUrl } from "../src/utils/endpoint";

const JSON_ACCEPT_HEADERS = Object.freeze({ Accept: "application/json" });
const JSON_REQUEST_HEADERS = Object.freeze({
  Accept: "application/json",
  "Content-Type": "application/json",
});
const MAX_VPN_PROFILE_BYTES = 64 * 1024;
const MAX_VPN_QUOTE_BYTES = 64 * 1024;
const MAX_VPN_SESSION_BYTES = 64 * 1024;
const MAX_VPN_RECEIPT_LIST_BYTES = 256 * 1024;
const MAX_VPN_ERROR_BYTES = 64 * 1024;
const MAX_PIPELINE_STATUS_BYTES = 64 * 1024;

type JsonRecord = Record<string, unknown>;

export type FirstReleaseVpnCanonicalAuth = Readonly<{
  accountId: string;
  privateKey: Buffer;
  networkId: NetworkId;
  networkPrefix: number;
}>;

type WireMap = Readonly<Record<string, string>>;

const PROFILE_WIRE_MAP = {
  available: "available",
  default_exit_class: "defaultExitClass",
  descriptor_commit_hex: "descriptorCommitHex",
  directory_snapshot_digest_hex: "directorySnapshotDigestHex",
  display_billing_label: "displayBillingLabel",
  dns_push_interval_secs: "dnsPushIntervalSecs",
  dns_servers: "dnsServers",
  excluded_routes: "excludedRoutes",
  flow_label_bits: "flowLabelBits",
  lease_fee: "leaseFee",
  lease_secs: "leaseSecs",
  meter_family: "meterFamily",
  mtu_bytes: "mtuBytes",
  operator_account_id: "operatorAccountId",
  padding_budget_ms: "paddingBudgetMs",
  relay_certificate_sha256_hex: "relayCertificateSha256Hex",
  relay_endpoint: "relayEndpoint",
  relay_id_hex: "relayIdHex",
  relay_mldsa65_public_key_hex: "relayMldsa65PublicKeyHex",
  relay_tls_spki_sha256_hex: "relayTlsSpkiSha256Hex",
  route_pushes: "routePushes",
  settlement_grace_secs: "settlementGraceSecs",
  supported_exit_classes: "supportedExitClasses",
  tls_server_name: "tlsServerName",
  tunnel_addresses: "tunnelAddresses",
} as const satisfies WireMap;

const QUOTE_WIRE_MAP = {
  account_id: "accountId",
  descriptor_commit_hex: "descriptorCommitHex",
  directory_snapshot_digest_hex: "directorySnapshotDigestHex",
  dns_servers: "dnsServers",
  escrow_account_id: "escrowAccountId",
  excluded_routes: "excludedRoutes",
  exit_class: "exitClass",
  fee_asset_id: "feeAssetId",
  flow_label_bits: "flowLabelBits",
  lease_fee: "leaseFee",
  lease_id_hex: "leaseIdHex",
  lease_secs: "leaseSecs",
  meter_family: "meterFamily",
  metering_public_key_hex: "meteringPublicKeyHex",
  mtu_bytes: "mtuBytes",
  open_lease_instruction: "openLeaseInstruction",
  operator_account_id: "operatorAccountId",
  padding_budget_ms: "paddingBudgetMs",
  payment_reference: "paymentReference",
  quote_expires_at_ms: "quoteExpiresAtMs",
  quote_id: "quoteId",
  relay_certificate_sha256_hex: "relayCertificateSha256Hex",
  relay_endpoint: "relayEndpoint",
  relay_id_hex: "relayIdHex",
  relay_mldsa65_public_key_hex: "relayMldsa65PublicKeyHex",
  relay_tls_spki_sha256_hex: "relayTlsSpkiSha256Hex",
  route_pushes: "routePushes",
  session_id_hex: "sessionIdHex",
  tls_server_name: "tlsServerName",
  tunnel_addresses: "tunnelAddresses",
} as const satisfies WireMap;

const SESSION_WIRE_MAP = {
  account_id: "accountId",
  bytes_in: "bytesIn",
  bytes_out: "bytesOut",
  connected_at_ms: "connectedAtMs",
  descriptor_commit_hex: "descriptorCommitHex",
  directory_snapshot_digest_hex: "directorySnapshotDigestHex",
  dns_servers: "dnsServers",
  escrow_account_id: "escrowAccountId",
  excluded_routes: "excludedRoutes",
  exit_class: "exitClass",
  expires_at_ms: "expiresAtMs",
  fee_asset_id: "feeAssetId",
  flow_label_bits: "flowLabelBits",
  helper_ticket_hex: "helperTicketHex",
  lease_fee: "leaseFee",
  lease_secs: "leaseSecs",
  meter_family: "meterFamily",
  mtu_bytes: "mtuBytes",
  operator_account_id: "operatorAccountId",
  padding_budget_ms: "paddingBudgetMs",
  payment_reference: "paymentReference",
  payment_tx_hash: "paymentTxHash",
  quote_id: "quoteId",
  relay_certificate_sha256_hex: "relayCertificateSha256Hex",
  relay_endpoint: "relayEndpoint",
  relay_id_hex: "relayIdHex",
  relay_mldsa65_public_key_hex: "relayMldsa65PublicKeyHex",
  relay_tls_spki_sha256_hex: "relayTlsSpkiSha256Hex",
  route_pushes: "routePushes",
  session_id: "sessionId",
  status: "status",
  tls_server_name: "tlsServerName",
  tunnel_addresses: "tunnelAddresses",
} as const satisfies WireMap;

const RECEIPT_WIRE_MAP = {
  account_id: "accountId",
  bytes_in: "bytesIn",
  bytes_out: "bytesOut",
  connected_at_ms: "connectedAtMs",
  disconnected_at_ms: "disconnectedAtMs",
  duration_ms: "durationMs",
  earned_fee: "earnedFee",
  escrow_account_id: "escrowAccountId",
  exit_class: "exitClass",
  fee_asset_id: "feeAssetId",
  lease_fee: "leaseFee",
  lease_id_hex: "leaseIdHex",
  meter_family: "meterFamily",
  operator_account_id: "operatorAccountId",
  payment_tx_hash: "paymentTxHash",
  quote_id: "quoteId",
  receipt_source: "receiptSource",
  refunded_fee: "refundedFee",
  relay_endpoint: "relayEndpoint",
  session_id: "sessionId",
  settle_lease_instruction: "settleLeaseInstruction",
  status: "status",
} as const satisfies WireMap;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mapExactWireRecord = (
  value: unknown,
  map: WireMap,
  label: string,
): JsonRecord => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = Object.keys(map).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains missing or unknown wire fields.`);
  }
  return Object.fromEntries(
    Object.entries(map).map(([wireName, viewName]) => [
      viewName,
      value[wireName],
    ]),
  );
};

const mapExactWireInstruction = (value: unknown, label: string): JsonRecord => {
  const mapped = mapExactWireRecord(
    value,
    { payload_hex: "payloadHex", wire_id: "wireId" },
    label,
  );
  return mapped;
};

export const parseFirstReleaseVpnProfileWire = (value: unknown) =>
  parseExactVpnProfile(
    mapExactWireRecord(value, PROFILE_WIRE_MAP, "VPN profile response"),
  );

export const parseFirstReleaseVpnQuoteWire = (value: unknown) => {
  const mapped = mapExactWireRecord(
    value,
    QUOTE_WIRE_MAP,
    "VPN quote response",
  );
  mapped.openLeaseInstruction = mapExactWireInstruction(
    mapped.openLeaseInstruction,
    "VPN quote response.open_lease_instruction",
  );
  return parseExactVpnQuote(mapped);
};

export const parseFirstReleaseVpnSessionWire = (value: unknown) =>
  parseExactVpnSession(
    mapExactWireRecord(value, SESSION_WIRE_MAP, "VPN session response"),
  );

export const parseFirstReleaseVpnReceiptListWire = (value: unknown) => {
  if (!isRecord(value)) {
    throw new Error("VPN receipt list response must be a plain object.");
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "items" ||
    keys[1] !== "total" ||
    !Array.isArray(value.items)
  ) {
    throw new Error(
      "VPN receipt list response contains missing or unknown wire fields.",
    );
  }
  return parseExactVpnReceiptList({
    items: value.items.map((receipt, index) => {
      const mapped = mapExactWireRecord(
        receipt,
        RECEIPT_WIRE_MAP,
        `VPN receipt list response.items[${index}]`,
      );
      if (mapped.settleLeaseInstruction !== null) {
        mapped.settleLeaseInstruction = mapExactWireInstruction(
          mapped.settleLeaseInstruction,
          `VPN receipt list response.items[${index}].settle_lease_instruction`,
        );
      }
      return mapped;
    }),
    total: value.total,
  });
};

const requireHttpsToriiOrigin = (value: string): string => {
  if (typeof value !== "string") {
    throw new TypeError("Sora VPN requests require an exact Torii URL.");
  }
  const normalized = normalizeEndpointUrl(value);
  const endpoint = new URL(normalized);
  if (endpoint.protocol !== "https:") {
    throw new Error("Sora VPN requests require an HTTPS Torii origin.");
  }
  if (endpoint.pathname !== "/" || value !== endpoint.origin) {
    throw new Error(
      "Sora VPN requests require an exact origin-only Torii URL without a trailing slash.",
    );
  }
  return endpoint.origin;
};

const requireLowerHex = (
  value: unknown,
  byteLength: number,
  label: string,
): string => {
  if (
    typeof value !== "string" ||
    value.length !== byteLength * 2 ||
    !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new TypeError(
      `${label} must be exactly ${byteLength} lowercase hexadecimal bytes.`,
    );
  }
  return value;
};

const requireExitClass = (value: unknown): string => {
  if (
    value !== "standard" &&
    value !== "low-latency" &&
    value !== "high-security"
  ) {
    throw new TypeError("VPN exitClass is not a first-release service class.");
  }
  return value;
};

const requireCanonicalAuth = (
  value: FirstReleaseVpnCanonicalAuth,
): FirstReleaseVpnCanonicalAuth => {
  if (
    !value ||
    !(value.networkId instanceof NetworkId) ||
    !Number.isSafeInteger(value.networkPrefix) ||
    Object.is(value.networkPrefix, -0) ||
    value.networkPrefix < 0 ||
    value.networkPrefix > 0x3fff ||
    !Buffer.isBuffer(value.privateKey) ||
    (value.privateKey.length !== 32 && value.privateKey.length !== 64)
  ) {
    throw new TypeError("VPN canonical auth is invalid.");
  }
  const networkIdBytes = value.networkId.toBytes();
  if (
    networkIdBytes.length !== NetworkId.BYTE_LENGTH ||
    (networkIdBytes.at(-1)! & 1) === 0
  ) {
    throw new TypeError("VPN canonical auth NetworkId is not canonical.");
  }
  const accountId = normalizeCanonicalAccountIdLiteral(
    value.accountId,
    "VPN canonical auth accountId",
    value.networkPrefix,
  );
  if (accountId !== value.accountId) {
    throw new TypeError("VPN canonical auth accountId must be exact.");
  }
  return value;
};

const boundedErrorDetail = async (response: Response, label: string) => {
  const bytes = await readBoundedResponseBytes(response, {
    label,
    maximumBytes: MAX_VPN_ERROR_BYTES,
    allowEmpty: true,
  });
  return bytes.length > 0 ? `: ${bytes.toString("utf8").slice(0, 512)}` : "";
};

const readBoundedUtf8 = async (
  response: Response,
  label: string,
  maximumBytes: number,
) => {
  const contentType = response.headers.get("content-type")?.trim() ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new Error(`${label} did not return application/json.`);
  }
  const bytes = await readBoundedResponseBytes(response, {
    label,
    maximumBytes,
  });
  let serialized: string;
  try {
    serialized = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8.`, { cause: error });
  }
  if (!Buffer.from(serialized, "utf8").equals(bytes)) {
    throw new Error(`${label} is not canonical UTF-8.`);
  }
  return serialized;
};

/** The complete, closed first-release Sora VPN Torii surface. */
export class FirstReleaseVpnTransport {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(toriiUrl: string, fetchImpl: typeof fetch = nodeFetch) {
    this.#origin = requireHttpsToriiOrigin(toriiUrl);
    this.#fetch = fetchImpl;
  }

  async #request(
    method: "GET" | "POST",
    path: string,
    options: Readonly<{
      auth?: FirstReleaseVpnCanonicalAuth;
      body?: unknown;
      signal?: AbortSignal;
      retryPublicGet?: boolean;
    }> = {},
  ): Promise<Response> {
    const url = new URL(path, `${this.#origin}/`);
    if (url.origin !== this.#origin || url.pathname !== path || url.search) {
      throw new Error("VPN transport path escaped its fixed Torii origin.");
    }
    const body =
      options.body === undefined ? undefined : JSON.stringify(options.body);
    const headers: Record<string, string> = {
      ...(body === undefined ? JSON_ACCEPT_HEADERS : JSON_REQUEST_HEADERS),
    };
    if (options.auth) {
      const auth = requireCanonicalAuth(options.auth);
      Object.assign(
        headers,
        buildCanonicalRequestHeaders({
          accountId: auth.accountId,
          networkId: auth.networkId,
          method,
          path: url.pathname,
          body: body === undefined ? Buffer.alloc(0) : Buffer.from(body),
          privateKey: auth.privateKey,
        }),
      );
    }
    const init: RequestInit = {
      method,
      headers,
      body,
      redirect: "error",
      signal: options.signal,
    };
    if (options.retryPublicGet === true) {
      if (method !== "GET" || options.auth) {
        throw new Error(
          "Only an unauthenticated VPN GET may use bounded retry.",
        );
      }
      return withBoundedHttpGetFetchRetry(this.#fetch, url, init);
    }
    return this.#fetch(url, init);
  }

  async getVpnProfile(options: { signal?: AbortSignal } = {}) {
    const response = await this.#request("GET", "/v1/vpn/profile", {
      signal: options.signal,
      retryPublicGet: true,
    });
    if (response.status === 404 || response.status === 503) {
      await readBoundedResponseBytes(response, {
        label: "VPN unavailable profile response",
        maximumBytes: MAX_VPN_ERROR_BYTES,
        allowEmpty: true,
      });
      return null;
    }
    if (response.status !== 200) {
      const detail = await boundedErrorDetail(response, "VPN profile error");
      throw new Error(
        `VPN profile request failed with HTTP ${response.status}${detail}`,
      );
    }
    return parseFirstReleaseVpnProfileWire(
      await readBoundedJsonResponse(response, {
        label: "VPN profile response",
        maximumBytes: MAX_VPN_PROFILE_BYTES,
        requireApplicationJson: true,
      }),
    );
  }

  async createVpnQuote(
    request: Readonly<{ exitClass: string; meteringPublicKeyHex: string }>,
    auth: FirstReleaseVpnCanonicalAuth,
    options: { signal?: AbortSignal } = {},
  ) {
    const response = await this.#request("POST", "/v1/vpn/quotes", {
      auth,
      body: {
        exit_class: requireExitClass(request.exitClass),
        metering_public_key_hex: requireLowerHex(
          request.meteringPublicKeyHex,
          32,
          "VPN meteringPublicKeyHex",
        ),
      },
      signal: options.signal,
    });
    if (response.status !== 201) {
      const detail = await boundedErrorDetail(response, "VPN quote error");
      throw new Error(
        `VPN quote request failed with HTTP ${response.status}${detail}`,
      );
    }
    return parseFirstReleaseVpnQuoteWire(
      await readBoundedJsonResponse(response, {
        label: "VPN quote response",
        maximumBytes: MAX_VPN_QUOTE_BYTES,
        requireApplicationJson: true,
      }),
    );
  }

  async quoteAuthorityTransaction(
    draft: FirstReleaseAuthorityTransactionDraft,
    auth: FirstReleaseVpnCanonicalAuth,
    options: { signal?: AbortSignal } = {},
  ): Promise<FirstReleaseAuthorityFeeQuoteResponse> {
    if (draft.authority !== auth.accountId) {
      throw new Error(
        "VPN fee quote authority must equal the canonical authenticated account.",
      );
    }
    const response = await this.#request("POST", "/v1/fees/quote", {
      auth,
      body: { payload: draft.payload },
      signal: options.signal,
    });
    if (response.status !== 200) {
      const detail = await boundedErrorDetail(response, "VPN fee quote error");
      throw new Error(
        `VPN fee quote request failed with HTTP ${response.status}${detail}`,
      );
    }
    return parseFirstReleaseAuthorityFeeQuoteResponse(
      await readBoundedUtf8(
        response,
        "VPN fee quote response",
        FIRST_RELEASE_FEE_QUOTE_RESPONSE_MAX_BYTES,
      ),
      {
        expectedAuthority: auth.accountId,
        networkPrefix: auth.networkPrefix,
      },
    );
  }

  async createVpnSession(
    request: Readonly<{
      exitClass: string;
      quoteId: string;
      paymentTxHash: string;
      meteringPublicKeyHex: string;
    }>,
    auth: FirstReleaseVpnCanonicalAuth,
    options: { signal?: AbortSignal } = {},
  ) {
    const response = await this.#request("POST", "/v1/vpn/sessions", {
      auth,
      body: {
        exit_class: requireExitClass(request.exitClass),
        quote_id: requireLowerHex(request.quoteId, 32, "VPN quoteId"),
        payment_tx_hash: requireLowerHex(
          request.paymentTxHash,
          32,
          "VPN paymentTxHash",
        ),
        metering_public_key_hex: requireLowerHex(
          request.meteringPublicKeyHex,
          32,
          "VPN meteringPublicKeyHex",
        ),
      },
      signal: options.signal,
    });
    if (response.status !== 201) {
      const detail = await boundedErrorDetail(response, "VPN session error");
      throw new Error(
        `VPN session request failed with HTTP ${response.status}${detail}`,
      );
    }
    return parseFirstReleaseVpnSessionWire(
      await readBoundedJsonResponse(response, {
        label: "VPN session response",
        maximumBytes: MAX_VPN_SESSION_BYTES,
        requireApplicationJson: true,
      }),
    );
  }

  async getVpnSession(
    sessionId: string,
    auth: FirstReleaseVpnCanonicalAuth,
    options: { signal?: AbortSignal } = {},
  ) {
    const normalizedSessionId = requireLowerHex(sessionId, 16, "VPN sessionId");
    const response = await this.#request(
      "GET",
      `/v1/vpn/sessions/${normalizedSessionId}`,
      { auth, signal: options.signal },
    );
    if (response.status === 404) {
      await readBoundedResponseBytes(response, {
        label: "VPN missing session response",
        maximumBytes: MAX_VPN_ERROR_BYTES,
        allowEmpty: true,
      });
      return null;
    }
    if (response.status !== 200) {
      const detail = await boundedErrorDetail(
        response,
        "VPN session read error",
      );
      throw new Error(
        `VPN session read failed with HTTP ${response.status}${detail}`,
      );
    }
    return parseFirstReleaseVpnSessionWire(
      await readBoundedJsonResponse(response, {
        label: "VPN session response",
        maximumBytes: MAX_VPN_SESSION_BYTES,
        requireApplicationJson: true,
      }),
    );
  }

  async listVpnReceipts(
    auth: FirstReleaseVpnCanonicalAuth,
    options: { signal?: AbortSignal } = {},
  ) {
    const response = await this.#request("GET", "/v1/vpn/receipts", {
      auth,
      signal: options.signal,
    });
    if (response.status !== 200) {
      const detail = await boundedErrorDetail(
        response,
        "VPN receipt list error",
      );
      throw new Error(
        `VPN receipt list failed with HTTP ${response.status}${detail}`,
      );
    }
    return parseFirstReleaseVpnReceiptListWire(
      await readBoundedJsonResponse(response, {
        label: "VPN receipt list response",
        maximumBytes: MAX_VPN_RECEIPT_LIST_BYTES,
        requireApplicationJson: true,
      }),
    );
  }

  async getTransactionStatus(
    hashHex: string,
    options: { signal?: AbortSignal } = {},
  ) {
    const hash = requireLowerHex(hashHex, 32, "Transaction hash");
    if ((Number.parseInt(hash.at(-1)!, 16) & 1) === 0) {
      throw new TypeError("Transaction hash must carry the Iroha hash marker.");
    }
    const url = new URL("/v1/pipeline/transactions/status", `${this.#origin}/`);
    url.searchParams.set("hash", hash);
    url.searchParams.set("scope", "global");
    const response = await this.#fetch(url, {
      method: "GET",
      headers: JSON_ACCEPT_HEADERS,
      redirect: "error",
      signal: options.signal,
    });
    if (response.status === 404) {
      await readBoundedResponseBytes(response, {
        label: "Missing transaction status response",
        maximumBytes: MAX_VPN_ERROR_BYTES,
        allowEmpty: true,
      });
      return null;
    }
    if (response.status !== 200) {
      const detail = await boundedErrorDetail(
        response,
        "Transaction status error",
      );
      throw new Error(
        `Transaction status read failed with HTTP ${response.status}${detail}`,
      );
    }
    return readBoundedJsonResponse(response, {
      label: "Transaction status response",
      maximumBytes: MAX_PIPELINE_STATUS_BYTES,
      requireApplicationJson: true,
    });
  }
}
