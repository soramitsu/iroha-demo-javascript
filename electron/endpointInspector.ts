import { nodeFetch } from "./nodeFetch";
import { parseRetryAfterMs, withBoundedHttpGetRetry } from "./httpReadRetry";
import { normalizeChainMetadata } from "../src/utils/chainMetadata";
import { normalizeEndpointUrl } from "../src/utils/endpoint";
import {
  canAttemptFaucetIdentityChallenge,
  isEndpointFeatureOperationSupported,
  normalizeEndpointOperation,
} from "../src/utils/endpointFeatures";
export {
  canAttemptFaucetIdentityChallenge,
  isEndpointFeatureOperationSupported,
} from "../src/utils/endpointFeatures";
import type {
  EndpointChainIdentity,
  EndpointDiagnostic,
  EndpointFeature,
  EndpointFeatureMap,
  EndpointIdentityEvidence,
  EndpointInspection,
  EndpointNetworkContext,
  EndpointNetworkIdentity,
} from "../src/types/endpointInspection";
import {
  getTrustedEndpointIdentityScopeInput,
  type EndpointIdentityScopeInput,
} from "../src/utils/endpointScope";
import { readBoundedJsonResponse } from "./boundedJsonResponse";
import {
  TAIRA_CHAIN_ID,
  TAIRA_NETWORK_PREFIX,
  TAIRA_TORII_URL,
} from "../src/utils/firstReleaseNetworkIdentity";
import {
  pinMatchesIdentity,
  type NetworkIdentityPin,
  type ObservedNetworkIdentity,
} from "../src/utils/networkIdentity";
import {
  discoverEndpointNetworkIdentity,
  type NetworkIdentityDiscovery,
} from "./networkIdentityDiscovery";

type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => Promise<Response>;

/**
 * Persisted trust-on-first-use identities. The preload implementation is
 * backed by the main process; tests use an in-memory map.
 */
export type EndpointIdentityPins = {
  read(toriiUrl: string): Promise<NetworkIdentityPin | null>;
  pinFirstUse(
    toriiUrl: string,
    identity: ObservedNetworkIdentity,
  ): Promise<NetworkIdentityPin>;
};

export type EndpointInspectorOptions = {
  identityPins: EndpointIdentityPins;
  fetchImpl?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
};

type ProbeResult = {
  reachedEndpoint: boolean;
  openApiOperations?: string[];
};

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 60_000;
// The public Torii OpenAPI document is ~4 MiB and keeps growing.
const MAX_ENDPOINT_INSPECTION_JSON_BYTES = 8 * 1024 * 1024;
const HTTP_DISCOVERY_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
] as const;
const SORACLOUD_HF_SHARED_LEASE_CONTRACT_OPERATION =
  "CONTRACT /v1/soracloud/hf/lease exact-v1";
const FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS = [
  "GET /v1/pipeline/transactions/status",
  "GET /v1/explorer/transactions/{hash}",
  "GET /v1/explorer/blocks/{identifier}",
  "GET /v1/explorer/metrics",
] as const;

/**
 * Only these exact HTTPS origin/profile pairs can become write-authorized.
 * Their transaction-binding NetworkId is not pinned here: it is derived from
 * the endpoint at connection time and pinned per endpoint on first use.
 */
const FIRST_RELEASE_WRITE_PROFILES = Object.freeze([
  Object.freeze({
    toriiUrl: TAIRA_TORII_URL,
    chainId: TAIRA_CHAIN_ID,
    networkPrefix: TAIRA_NETWORK_PREFIX,
  }),
]);

const isFirstReleaseWriteProfile = (
  toriiUrl: string,
  expected: EndpointChainIdentity,
): boolean =>
  FIRST_RELEASE_WRITE_PROFILES.some(
    (profile) =>
      toriiUrl === profile.toriiUrl &&
      expected.chainId === profile.chainId &&
      expected.networkPrefix === profile.networkPrefix,
  );

const FEATURE_OPERATION_REQUIREMENTS: Record<
  EndpointFeature,
  readonly string[]
> = {
  accountRegistration: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  accountOnboarding: ["POST /v1/accounts/onboard"],
  assetTransfers: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  faucetClaim: [
    "GET /v1/accounts/faucet/policy",
    "GET /v1/accounts/faucet/puzzle",
    "POST /v1/accounts/faucet/prepare",
    "POST /v1/accounts/faucet",
    "GET /v1/pipeline/transactions/status",
  ],
  kaigiMeetings: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  governanceWrites: [
    "POST /v1/fees/quote",
    "GET /v1/gov/capabilities",
    "POST /v1/gov/citizens/draft",
    "POST /v1/gov/parliament/attempts/draft",
    "GET /v1/gov/parliament/attempts/{governance_attempt_id}",
    "GET /v1/gov/parliament/ballots/{ballot_attempt_id}/casting-context",
    "POST /v1/gov/parliament/ballots/{ballot_attempt_id}/casting-proof",
    "GET /v1/gov/parliament/ballots/{ballot_attempt_id}/release-context",
    "POST /v1/gov/parliament/ballots/{ballot_attempt_id}/partial-release",
    "POST /v1/gov/parliament/transitions/draft",
    "POST /v1/gov/ballots/plain",
    "POST /v1/gov/ballots/zk-v1",
    "POST /v1/gov/ballots/zk-v1/ballot-proof",
    "GET /v1/validation-fee/proposals",
    "GET /v1/validation-fee/proposals/{proposal_id}",
    "POST /v1/validation-fee/proposals/draft",
    "POST /v1/pipeline/transactions",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  stakingWrites: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  subscriptionWrites: [
    "POST /v1/fees/quote",
    "POST /v1/pipeline/transactions",
    "POST /v1/subscriptions",
    "POST /v1/subscriptions/{subscription_id}/pause",
    "POST /v1/subscriptions/{subscription_id}/resume",
    "POST /v1/subscriptions/{subscription_id}/cancel",
    "POST /v1/subscriptions/{subscription_id}/keep",
    "POST /v1/subscriptions/{subscription_id}/charge-now",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  soraCloudHfSharedLease: [
    "POST /v1/soracloud/hf/lease/join",
    "GET /v1/soracloud/hf/lease/status",
    SORACLOUD_HF_SHARED_LEASE_CONTRACT_OPERATION,
  ],
  vpnSessions: [
    "POST /v1/fees/quote",
    "POST /v1/vpn/quotes",
    "POST /v1/vpn/sessions",
    "DELETE /v1/vpn/sessions/{session_id}",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
  ],
  irohaConnectSessions: ["POST /v1/connect/session"],
};

const fetchWithTimeout = async (
  fetchImpl: FetchLike,
  endpoint: string,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Endpoint probe timed out.")),
    timeoutMs,
  );
  try {
    let lastRateLimitedResponse: Response | null = null;
    try {
      return await withBoundedHttpGetRetry(
        async () => {
          const response = await fetchImpl(endpoint, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (response.status !== 429) {
            return response;
          }
          lastRateLimitedResponse = response;
          throw Object.assign(new Error("Endpoint probe was rate limited."), {
            status: 429,
            retryAfterMs: parseRetryAfterMs(
              response.headers.get("retry-after"),
            ),
          });
        },
        { signal: controller.signal },
      );
    } catch (error) {
      if (lastRateLimitedResponse) {
        return lastRateLimitedResponse;
      }
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
};

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    return null;
  }
  try {
    return await readBoundedJsonResponse(response, {
      label: "Endpoint inspection response",
      maximumBytes: MAX_ENDPOINT_INSPECTION_JSON_BYTES,
      requireApplicationJson: true,
    });
  } catch {
    return null;
  }
};

const readOpenApiOperations = (payload: unknown): string[] => {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !("paths" in payload)
  ) {
    return [];
  }
  const paths = (payload as { paths?: unknown }).paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    return [];
  }
  const operations: string[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) {
      continue;
    }
    for (const method of HTTP_DISCOVERY_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method];
      if (
        operation &&
        typeof operation === "object" &&
        !Array.isArray(operation)
      ) {
        operations.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const components = asRecord((payload as Record<string, unknown>).components);
  const schemas = asRecord(components?.schemas);
  const operationFor = (path: string, method: string) =>
    asRecord(asRecord((paths as Record<string, unknown>)[path])?.[method]);
  const requestSchemaRef = (operation: Record<string, unknown> | null) =>
    asRecord(
      asRecord(asRecord(operation?.requestBody)?.content)?.["application/json"],
    )?.schema &&
    asRecord(
      asRecord(
        asRecord(asRecord(operation?.requestBody)?.content)?.[
          "application/json"
        ],
      )?.schema,
    )?.$ref;
  const responseSchemaRef = (
    operation: Record<string, unknown> | null,
    status: string,
  ) =>
    asRecord(
      asRecord(asRecord(asRecord(operation?.responses)?.[status])?.content)?.[
        "application/json"
      ],
    )?.schema &&
    asRecord(
      asRecord(
        asRecord(asRecord(asRecord(operation?.responses)?.[status])?.content)?.[
          "application/json"
        ],
      )?.schema,
    )?.$ref;
  const exactStringSet = (value: unknown, expected: readonly string[]) => {
    if (
      !Array.isArray(value) ||
      value.length !== expected.length ||
      value.some((entry) => typeof entry !== "string")
    ) {
      return false;
    }
    const actual = new Set(value as string[]);
    return (
      actual.size === expected.length &&
      expected.every((entry) => actual.has(entry))
    );
  };
  const exactObjectSchema = (name: string, fields: readonly string[]) => {
    const schema = asRecord(schemas?.[name]);
    const properties = asRecord(schema?.properties);
    return (
      schema?.type === "object" &&
      schema.additionalProperties === false &&
      exactStringSet(schema.required, fields) &&
      properties !== null &&
      exactStringSet(Object.keys(properties), fields)
    );
  };
  const refProperty = (schemaName: string, field: string, expected: string) =>
    asRecord(asRecord(asRecord(schemas?.[schemaName])?.properties)?.[field])
      ?.$ref === expected;
  const schemaProperty = (schemaName: string, field: string) =>
    asRecord(asRecord(asRecord(schemas?.[schemaName])?.properties)?.[field]);
  const schemaVersionOne = (schemaName: string) => {
    const property = schemaProperty(schemaName, "schema_version");
    return property?.type === "integer" && property.const === 1;
  };
  const nullableStringProperty = (schemaName: string, field: string) => {
    const alternatives = schemaProperty(schemaName, field)?.anyOf;
    return (
      Array.isArray(alternatives) &&
      alternatives.length === 2 &&
      alternatives.some(
        (candidate) => asRecord(candidate)?.type === "string",
      ) &&
      alternatives.some((candidate) => asRecord(candidate)?.type === "null")
    );
  };
  const uniqueStringArrayProperty = (schemaName: string, field: string) => {
    const property = schemaProperty(schemaName, field);
    return (
      property?.type === "array" &&
      property.uniqueItems === true &&
      asRecord(property.items)?.type === "string"
    );
  };
  const nullableRefProperty = (
    schemaName: string,
    field: string,
    expected: string,
  ) => {
    const property = asRecord(
      asRecord(asRecord(schemas?.[schemaName])?.properties)?.[field],
    );
    const alternatives = property?.anyOf;
    return (
      Array.isArray(alternatives) &&
      alternatives.length === 2 &&
      alternatives.some(
        (candidate) => asRecord(candidate)?.$ref === expected,
      ) &&
      alternatives.some((candidate) => asRecord(candidate)?.type === "null")
    );
  };
  const exactUnitVariantSchema = (
    name: string,
    tag: string,
    variants: readonly string[],
  ) => {
    const alternatives = asRecord(schemas?.[name])?.oneOf;
    return (
      Array.isArray(alternatives) &&
      alternatives.length === variants.length &&
      variants.every((variant) =>
        alternatives.some((candidate) => {
          const schema = asRecord(candidate);
          const properties = asRecord(schema?.properties);
          return (
            schema?.type === "object" &&
            schema.additionalProperties === false &&
            exactStringSet(schema.required, [tag, "value"]) &&
            properties !== null &&
            exactStringSet(Object.keys(properties), [tag, "value"]) &&
            asRecord(properties[tag])?.const === variant &&
            asRecord(properties.value)?.type === "null"
          );
        }),
      )
    );
  };

  const join = operationFor("/v1/soracloud/hf/lease/join", "post");
  const status = operationFor("/v1/soracloud/hf/lease/status", "get");
  const statusParameters = Array.isArray(status?.parameters)
    ? status.parameters
    : [];
  const statusQueryParameters = Array.isArray(status?.parameters)
    ? statusParameters
        .map(asRecord)
        .filter(
          (parameter): parameter is Record<string, unknown> =>
            parameter !== null && parameter.in === "query",
        )
    : [];
  const expectedStatusQuery = new Map<string, boolean>([
    ["repo_id", true],
    ["revision", true],
    ["storage_class", true],
    ["lease_term_ms", true],
    ["account_id", false],
  ]);
  const statusHeaderParameters = statusParameters
    .map(asRecord)
    .filter(
      (parameter): parameter is Record<string, unknown> =>
        parameter !== null && parameter.in === "header",
    );
  const expectedStatusHeaders = new Map<string, boolean>([
    ["X-Iroha-Account", false],
    ["X-Iroha-Signature", false],
    ["X-Iroha-Timestamp-Ms", false],
    ["X-Iroha-Nonce", false],
    ["X-Iroha-Witness", false],
  ]);
  const statusQueryIsExact =
    statusParameters.length ===
      expectedStatusQuery.size + expectedStatusHeaders.size &&
    statusQueryParameters.length === expectedStatusQuery.size &&
    new Set(statusQueryParameters.map((parameter) => parameter.name)).size ===
      expectedStatusQuery.size &&
    statusQueryParameters.every(
      (parameter) =>
        typeof parameter.name === "string" &&
        expectedStatusQuery.has(parameter.name) &&
        expectedStatusQuery.get(parameter.name) === parameter.required,
    );
  const statusHeadersAreExact =
    statusHeaderParameters.length === expectedStatusHeaders.size &&
    new Set(statusHeaderParameters.map((parameter) => parameter.name)).size ===
      expectedStatusHeaders.size &&
    statusHeaderParameters.every(
      (parameter) =>
        typeof parameter.name === "string" &&
        expectedStatusHeaders.has(parameter.name) &&
        expectedStatusHeaders.get(parameter.name) === parameter.required &&
        asRecord(parameter.schema)?.type === "string",
    );
  const statusQuerySchema = (name: string) =>
    asRecord(
      statusQueryParameters.find((parameter) => parameter.name === name)
        ?.schema,
    );
  const statusQuerySchemasAreExact =
    statusQuerySchema("repo_id")?.type === "string" &&
    statusQuerySchema("revision")?.type === "string" &&
    statusQuerySchema("revision")?.pattern === "^[0-9a-f]{40}$" &&
    statusQuerySchema("storage_class")?.type === "string" &&
    exactStringSet(statusQuerySchema("storage_class")?.enum, [
      "hot",
      "warm",
      "cold",
    ]) &&
    statusQuerySchema("lease_term_ms")?.type === "integer" &&
    statusQuerySchema("lease_term_ms")?.format === "uint64" &&
    statusQuerySchema("lease_term_ms")?.minimum === 0 &&
    statusQuerySchema("account_id")?.type === "string";
  const storageClassSchema = asRecord(
    asRecord(asRecord(schemas?.HfSharedLeaseJoinPayload)?.properties)
      ?.storage_class,
  );
  const mutationInstructions = asRecord(
    asRecord(asRecord(schemas?.SoracloudMutationDraftResponse)?.properties)
      ?.tx_instructions,
  );
  const instructionPayloadHex = asRecord(
    asRecord(asRecord(schemas?.SoracloudTxInstruction)?.properties)
      ?.payload_hex,
  );
  const exactContract =
    asRecord(join?.requestBody)?.required === true &&
    join?.["x-iroha-tool-effect"] === "write" &&
    status?.["x-iroha-tool-effect"] === "read" &&
    requestSchemaRef(join) ===
      "#/components/schemas/SignedHfSharedLeaseJoinRequest" &&
    responseSchemaRef(join, "200") ===
      "#/components/schemas/SoracloudMutationDraftResponse" &&
    responseSchemaRef(status, "200") ===
      "#/components/schemas/HfSharedLeaseStatusResponse" &&
    statusQueryIsExact &&
    statusHeadersAreExact &&
    statusQuerySchemasAreExact &&
    exactObjectSchema("SignedHfSharedLeaseJoinRequest", [
      "payload",
      "provenance",
    ]) &&
    refProperty(
      "SignedHfSharedLeaseJoinRequest",
      "payload",
      "#/components/schemas/HfSharedLeaseJoinPayload",
    ) &&
    refProperty(
      "SignedHfSharedLeaseJoinRequest",
      "provenance",
      "#/components/schemas/ManifestProvenance",
    ) &&
    exactObjectSchema("HfSharedLeaseJoinPayload", [
      "repo_id",
      "revision",
      "service_name",
      "apartment_name",
      "storage_class",
      "lease_term_ms",
      "lease_asset_definition_id",
      "base_fee",
    ]) &&
    exactStringSet(storageClassSchema?.enum, ["hot", "warm", "cold"]) &&
    exactObjectSchema("ManifestProvenance", ["signer", "signature"]) &&
    schemaProperty("ManifestProvenance", "signer")?.type === "string" &&
    schemaProperty("ManifestProvenance", "signer")?.minLength === 1 &&
    schemaProperty("ManifestProvenance", "signature")?.type === "string" &&
    schemaProperty("ManifestProvenance", "signature")?.pattern ===
      "^(?:[0-9A-F]{2})+$" &&
    exactObjectSchema("SoracloudMutationDraftResponse", [
      "ok",
      "authority",
      "signed_by",
      "tx_instructions",
    ]) &&
    schemaProperty("SoracloudMutationDraftResponse", "ok")?.const === true &&
    schemaProperty("SoracloudMutationDraftResponse", "authority")?.type ===
      "string" &&
    schemaProperty("SoracloudMutationDraftResponse", "authority")?.minLength ===
      1 &&
    schemaProperty("SoracloudMutationDraftResponse", "signed_by")?.type ===
      "string" &&
    schemaProperty("SoracloudMutationDraftResponse", "signed_by")?.minLength ===
      1 &&
    mutationInstructions?.type === "array" &&
    mutationInstructions.minItems === 1 &&
    asRecord(mutationInstructions.items)?.$ref ===
      "#/components/schemas/SoracloudTxInstruction" &&
    exactObjectSchema("SoracloudTxInstruction", ["wire_id", "payload_hex"]) &&
    instructionPayloadHex?.pattern === "^(?:[0-9a-f]{2})+$" &&
    exactObjectSchema("HfSharedLeaseStatusResponse", [
      "schema_version",
      "source",
      "pool",
      "member",
      "latest_audit_event",
      "audit_event_count",
      "storage_base_fee",
    ]) &&
    schemaVersionOne("HfSharedLeaseStatusResponse") &&
    refProperty(
      "HfSharedLeaseStatusResponse",
      "storage_base_fee",
      "#/components/schemas/Quantity",
    ) &&
    refProperty(
      "HfSharedLeaseStatusResponse",
      "source",
      "#/components/schemas/SoraHfSourceRecordV1",
    ) &&
    nullableRefProperty(
      "HfSharedLeaseStatusResponse",
      "pool",
      "#/components/schemas/SoraHfSharedLeasePoolV1",
    ) &&
    nullableRefProperty(
      "HfSharedLeaseStatusResponse",
      "member",
      "#/components/schemas/SoraHfSharedLeaseMemberV1",
    ) &&
    nullableRefProperty(
      "HfSharedLeaseStatusResponse",
      "latest_audit_event",
      "#/components/schemas/SoraHfSharedLeaseAuditEventV1",
    ) &&
    exactObjectSchema("SoraHfSourceRecordV1", [
      "schema_version",
      "source_id",
      "repo_id",
      "resolved_revision",
      "created_at_ms",
      "updated_at_ms",
    ]) &&
    schemaVersionOne("SoraHfSourceRecordV1") &&
    refProperty(
      "SoraHfSourceRecordV1",
      "source_id",
      "#/components/schemas/Hash",
    ) &&
    exactObjectSchema("SoraHfSharedLeasePoolV1", [
      "schema_version",
      "pool_id",
      "source_id",
      "storage_class",
      "lease_asset_definition_id",
      "base_fee",
      "lease_term_ms",
      "window_started_at_ms",
      "window_expires_at_ms",
      "active_member_count",
      "status",
      "queued_next_window",
    ]) &&
    schemaVersionOne("SoraHfSharedLeasePoolV1") &&
    refProperty(
      "SoraHfSharedLeasePoolV1",
      "pool_id",
      "#/components/schemas/Hash",
    ) &&
    refProperty(
      "SoraHfSharedLeasePoolV1",
      "source_id",
      "#/components/schemas/Hash",
    ) &&
    exactStringSet(
      schemaProperty("SoraHfSharedLeasePoolV1", "storage_class")?.enum,
      ["hot", "warm", "cold"],
    ) &&
    refProperty(
      "SoraHfSharedLeasePoolV1",
      "base_fee",
      "#/components/schemas/Quantity",
    ) &&
    refProperty(
      "SoraHfSharedLeasePoolV1",
      "status",
      "#/components/schemas/SoraHfSharedLeaseStatusV1",
    ) &&
    nullableRefProperty(
      "SoraHfSharedLeasePoolV1",
      "queued_next_window",
      "#/components/schemas/SoraHfSharedLeaseQueuedWindowV1",
    ) &&
    exactObjectSchema("SoraHfSharedLeaseQueuedWindowV1", [
      "sponsor_account_id",
      "lease_asset_definition_id",
      "base_fee",
      "sponsored_at_ms",
      "window_started_at_ms",
      "window_expires_at_ms",
      "service_name",
      "apartment_name",
    ]) &&
    refProperty(
      "SoraHfSharedLeaseQueuedWindowV1",
      "base_fee",
      "#/components/schemas/Quantity",
    ) &&
    nullableStringProperty(
      "SoraHfSharedLeaseQueuedWindowV1",
      "apartment_name",
    ) &&
    exactObjectSchema("SoraHfSharedLeaseMemberV1", [
      "schema_version",
      "pool_id",
      "source_id",
      "account_id",
      "status",
      "joined_at_ms",
      "updated_at_ms",
      "total_paid",
      "total_refunded",
      "last_charge",
      "service_bindings",
      "apartment_bindings",
    ]) &&
    schemaVersionOne("SoraHfSharedLeaseMemberV1") &&
    refProperty(
      "SoraHfSharedLeaseMemberV1",
      "pool_id",
      "#/components/schemas/Hash",
    ) &&
    refProperty(
      "SoraHfSharedLeaseMemberV1",
      "source_id",
      "#/components/schemas/Hash",
    ) &&
    refProperty(
      "SoraHfSharedLeaseMemberV1",
      "status",
      "#/components/schemas/SoraHfSharedLeaseMemberStatusV1",
    ) &&
    refProperty(
      "SoraHfSharedLeaseMemberV1",
      "total_paid",
      "#/components/schemas/Quantity",
    ) &&
    refProperty(
      "SoraHfSharedLeaseMemberV1",
      "total_refunded",
      "#/components/schemas/Quantity",
    ) &&
    refProperty(
      "SoraHfSharedLeaseMemberV1",
      "last_charge",
      "#/components/schemas/Quantity",
    ) &&
    uniqueStringArrayProperty(
      "SoraHfSharedLeaseMemberV1",
      "service_bindings",
    ) &&
    uniqueStringArrayProperty(
      "SoraHfSharedLeaseMemberV1",
      "apartment_bindings",
    ) &&
    exactObjectSchema("SoraHfSharedLeaseAuditEventV1", [
      "schema_version",
      "sequence",
      "action",
      "pool_id",
      "source_id",
      "account_id",
      "occurred_at_ms",
      "active_member_count",
      "charged",
      "refunded",
      "lease_expires_at_ms",
      "service_name",
      "apartment_name",
    ]) &&
    schemaVersionOne("SoraHfSharedLeaseAuditEventV1") &&
    refProperty(
      "SoraHfSharedLeaseAuditEventV1",
      "action",
      "#/components/schemas/SoraHfSharedLeaseActionV1",
    ) &&
    refProperty(
      "SoraHfSharedLeaseAuditEventV1",
      "pool_id",
      "#/components/schemas/Hash",
    ) &&
    refProperty(
      "SoraHfSharedLeaseAuditEventV1",
      "source_id",
      "#/components/schemas/Hash",
    ) &&
    refProperty(
      "SoraHfSharedLeaseAuditEventV1",
      "charged",
      "#/components/schemas/Quantity",
    ) &&
    refProperty(
      "SoraHfSharedLeaseAuditEventV1",
      "refunded",
      "#/components/schemas/Quantity",
    ) &&
    nullableStringProperty("SoraHfSharedLeaseAuditEventV1", "service_name") &&
    nullableStringProperty("SoraHfSharedLeaseAuditEventV1", "apartment_name") &&
    exactUnitVariantSchema("SoraHfSharedLeaseStatusV1", "status", [
      "Active",
      "Draining",
      "Expired",
      "Retired",
    ]) &&
    exactUnitVariantSchema("SoraHfSharedLeaseMemberStatusV1", "status", [
      "Active",
      "Left",
    ]) &&
    exactUnitVariantSchema("SoraHfSharedLeaseActionV1", "action", [
      "CreateWindow",
      "Join",
      "Leave",
      "Renew",
      "Retire",
    ]);
  if (exactContract) {
    operations.push(SORACLOUD_HF_SHARED_LEASE_CONTRACT_OPERATION);
  }
  return operations;
};

const probeOpenApi = async (
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<ProbeResult> => {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/openapi.json`,
      timeoutMs,
    );
    if (!response.ok) {
      return { reachedEndpoint: true };
    }
    return {
      reachedEndpoint: true,
      openApiOperations: readOpenApiOperations(
        await parseJsonResponse(response),
      ),
    };
  } catch {
    return { reachedEndpoint: false };
  }
};

const featureMapFor = (
  openApiOperations: string[] | null,
): EndpointFeatureMap => {
  const advertised = new Set(
    (openApiOperations ?? []).map(normalizeEndpointOperation),
  );
  return Object.fromEntries(
    Object.entries(FEATURE_OPERATION_REQUIREMENTS).map(
      ([feature, requiredOperations]) => {
        const missingOperations = requiredOperations.filter(
          (operation) => !advertised.has(normalizeEndpointOperation(operation)),
        );
        return [
          feature,
          {
            supported:
              openApiOperations !== null && missingOperations.length === 0,
            source: openApiOperations === null ? "unavailable" : "openapi",
            requiredOperations: [...requiredOperations],
            missingOperations:
              openApiOperations === null
                ? [...requiredOperations]
                : missingOperations,
          },
        ];
      },
    ),
  ) as EndpointFeatureMap;
};

const diagnosticFor = (input: {
  status: EndpointInspection["identityStatus"];
  expected: EndpointChainIdentity;
  observed: EndpointChainIdentity | null;
  writeProfile: boolean;
  discovery: NetworkIdentityDiscovery | null;
  networkIdentity: EndpointNetworkIdentity;
  pinError: string | null;
}): EndpointDiagnostic => {
  switch (input.status) {
    case "matched":
      return {
        code: "endpoint_identity_matched",
        message:
          input.networkIdentity.state === "pinned-now"
            ? `Endpoint identity verified and pinned on first use: ${input.observed?.networkId ?? "unknown"}.`
            : `Endpoint identity matches the pinned network ${input.observed?.networkId ?? "unknown"}.`,
      };
    case "mismatched":
      return {
        code: "endpoint_identity_mismatch",
        message: `Endpoint reports network prefix "${input.observed?.networkPrefix ?? "unknown"}", but the wallet is configured for network prefix "${input.expected.networkPrefix}". Reads remain available; writes are blocked.`,
      };
    case "changed":
      return {
        code: "endpoint_identity_changed",
        message: `This endpoint now reports network ${input.networkIdentity.observedNetworkId ?? "unknown"}, but this wallet trusted ${input.networkIdentity.pinned?.networkId ?? "unknown"} for it. The network was probably reset. Reads remain available; writes are blocked until you confirm the new network identity in Settings.`,
      };
    case "conflicting":
      return {
        code: "endpoint_identity_conflict",
        message:
          `Endpoint network identity sources disagree. ${input.discovery?.status === "conflicting" ? input.discovery.detail : ""} Reads remain available; writes are blocked.`.replace(
            /\s+/gu,
            " ",
          ),
      };
    case "unverified":
      return {
        code: "endpoint_identity_unverified",
        message: input.pinError
          ? `Endpoint network identity could not be pinned: ${input.pinError} Reads remain available; writes are blocked.`
          : !input.writeProfile
            ? "This endpoint is not a release write target. Reads remain available; writes are blocked even if the endpoint reports a valid network identity."
            : `Endpoint did not provide an agreeing network identity. ${input.discovery && input.discovery.status !== "verified" ? input.discovery.detail : ""} Reads remain available; writes are blocked.`.replace(
                /\s+/gu,
                " ",
              ),
      };
    case "unreachable":
      return {
        code: "endpoint_unreachable",
        message:
          "Endpoint identity could not be checked because the endpoint is unreachable.",
      };
  }
};

const evidenceFromDiscovery = (
  discovery: NetworkIdentityDiscovery,
  expected: EndpointChainIdentity,
  observedAtMs: number,
): EndpointIdentityEvidence[] => {
  const evidence: EndpointIdentityEvidence[] = [];
  const capabilities = discovery.capabilities;
  if (capabilities.reached && capabilities.identity) {
    evidence.push({
      source: "account-capabilities",
      identity: {
        chainId: expected.chainId,
        networkPrefix:
          capabilities.identity.networkPrefix ?? expected.networkPrefix,
        networkId: capabilities.identity.networkId,
      },
      observedAtMs,
    });
  }
  const genesis = discovery.genesis;
  if (genesis.reached && genesis.identity) {
    evidence.push({
      // The genesis block attests only the NetworkId, not the I105 prefix.
      source: "genesis-block",
      identity: {
        chainId: expected.chainId,
        networkPrefix: expected.networkPrefix,
        networkId: genesis.identity.networkId,
      },
      observedAtMs,
    });
  }
  return evidence;
};

const pinView = (
  pin: NetworkIdentityPin | null,
): EndpointNetworkIdentity["pinned"] =>
  pin
    ? {
        networkId: pin.networkId,
        networkPrefix: pin.networkPrefix,
        confirmedAtMs: pin.confirmedAtMs,
        confirmation: pin.confirmation,
      }
    : null;

export const inspectEndpoint = async (
  input: EndpointNetworkContext,
  options: EndpointInspectorOptions,
): Promise<EndpointInspection> => {
  const toriiUrl = normalizeEndpointUrl(input.toriiUrl);
  const configuredExpected = normalizeChainMetadata({
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
  });
  const now = options.now ?? Date.now;
  const observedAtMs = now();
  const fetchImpl = options.fetchImpl ?? nodeFetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!options.identityPins) {
    throw new TypeError(
      "Endpoint inspection requires a network identity pin store.",
    );
  }
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
    throw new TypeError(
      "Endpoint inspection clock must return a non-negative safe integer.",
    );
  }
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new TypeError(
      `Endpoint inspection timeout must be an integer between 1 and ${MAX_TIMEOUT_MS} milliseconds.`,
    );
  }
  const writeProfile = isFirstReleaseWriteProfile(toriiUrl, configuredExpected);

  const [discovery, openApi] = await Promise.all([
    discoverEndpointNetworkIdentity(toriiUrl, { fetchImpl, timeoutMs }),
    probeOpenApi(toriiUrl, fetchImpl, timeoutMs),
  ]);

  let pin: NetworkIdentityPin | null = null;
  let pinError: string | null = null;
  let identityState: EndpointNetworkIdentity["state"] = "unpinned";
  const verified = discovery.status === "verified" ? discovery.identity : null;
  const prefixMatches =
    verified !== null &&
    verified.networkPrefix === configuredExpected.networkPrefix;
  try {
    pin = await options.identityPins.read(toriiUrl);
    if (verified && prefixMatches && writeProfile) {
      if (!pin) {
        pin = await options.identityPins.pinFirstUse(toriiUrl, verified);
        identityState = pinMatchesIdentity(pin, verified)
          ? "pinned-now"
          : "changed";
      } else {
        identityState = pinMatchesIdentity(pin, verified)
          ? "matches-pin"
          : "changed";
      }
    } else if (pin) {
      identityState =
        verified && !pinMatchesIdentity(pin, verified) ? "changed" : "unpinned";
      if (verified && pinMatchesIdentity(pin, verified)) {
        identityState = "matches-pin";
      }
    }
  } catch (error) {
    pinError = error instanceof Error ? error.message : String(error);
  }

  const expected: EndpointChainIdentity = pin
    ? { ...configuredExpected, networkId: pin.networkId }
    : configuredExpected;
  const observed: EndpointChainIdentity | null = verified
    ? {
        chainId: configuredExpected.chainId,
        networkPrefix: verified.networkPrefix,
        networkId: verified.networkId,
        genesisHash: verified.genesisHashHex,
      }
    : null;
  const networkIdentity: EndpointNetworkIdentity = {
    state: pinError ? "unpinned" : identityState,
    pinned: pinView(pin),
    observedNetworkId: verified?.networkId ?? null,
  };

  let identityStatus: EndpointInspection["identityStatus"];
  if (discovery.status === "unreachable" && !openApi.reachedEndpoint) {
    identityStatus = "unreachable";
  } else if (discovery.status === "conflicting") {
    identityStatus = "conflicting";
  } else if (!verified) {
    identityStatus = "unverified";
  } else if (!prefixMatches) {
    identityStatus = "mismatched";
  } else if (pinError || !writeProfile) {
    identityStatus = "unverified";
  } else if (networkIdentity.state === "changed") {
    identityStatus = "changed";
  } else if (
    networkIdentity.state === "pinned-now" ||
    networkIdentity.state === "matches-pin"
  ) {
    identityStatus = "matched";
  } else {
    identityStatus = "unverified";
  }

  return {
    schema: "iroha.wallet.endpoint-inspection.v1",
    toriiUrl,
    expected,
    observed: identityStatus === "unreachable" ? null : observed,
    identityStatus,
    accessMode:
      identityStatus === "matched"
        ? "read-write"
        : identityStatus === "unreachable"
          ? "offline"
          : "read-only",
    checkedAtMs: observedAtMs,
    evidence: evidenceFromDiscovery(
      discovery,
      configuredExpected,
      observedAtMs,
    ),
    networkIdentity,
    features: featureMapFor(openApi.openApiOperations ?? null),
    diagnostic: diagnosticFor({
      status: identityStatus,
      expected,
      observed,
      writeProfile,
      discovery,
      networkIdentity,
      pinError,
    }),
  };
};

/**
 * Lightweight identity-only check (no OpenAPI read) for signing paths that
 * need the transaction-binding NetworkId of a release write endpoint. It
 * applies the same two-source agreement and trust-on-first-use pin as
 * {@link inspectEndpoint}.
 */
export const resolvePinnedEndpointNetworkId = async (
  input: EndpointNetworkContext,
  options: Omit<EndpointInspectorOptions, "now">,
): Promise<string> => {
  const toriiUrl = normalizeEndpointUrl(input.toriiUrl);
  const expected = normalizeChainMetadata({
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
  });
  if (!isFirstReleaseWriteProfile(toriiUrl, expected)) {
    throw new Error(
      "[endpoint_identity_unverified] This endpoint is not a release write target, so it has no trusted transaction NetworkId.",
    );
  }
  const discovery = await discoverEndpointNetworkIdentity(toriiUrl, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  if (discovery.status !== "verified") {
    throw new Error(
      `[endpoint_identity_${discovery.status === "conflicting" ? "conflict" : "unverified"}] ${discovery.detail}`,
    );
  }
  if (discovery.identity.networkPrefix !== expected.networkPrefix) {
    throw new Error(
      `[endpoint_identity_mismatch] Endpoint network prefix ${discovery.identity.networkPrefix} differs from the configured prefix ${expected.networkPrefix}.`,
    );
  }
  const pin =
    (await options.identityPins.read(toriiUrl)) ??
    (await options.identityPins.pinFirstUse(toriiUrl, discovery.identity));
  if (!pinMatchesIdentity(pin, discovery.identity)) {
    throw new Error(
      `[endpoint_identity_changed] This endpoint now reports network ${discovery.identity.networkId}, but this wallet trusted ${pin.networkId}. Confirm the new network identity in Settings before signing.`,
    );
  }
  return discovery.identity.networkId;
};

/**
 * Return the transaction-binding NetworkId only for a write-authorized,
 * pinned endpoint identity.
 */
export const requireTrustedInspectionNetworkId = (
  inspection: EndpointInspection,
): string => {
  const networkId = inspection.observed?.networkId;
  if (
    inspection.identityStatus !== "matched" ||
    !networkId ||
    inspection.networkIdentity.pinned?.networkId !== networkId
  ) {
    throw new EndpointWriteBlockedError(inspection);
  }
  return networkId;
};

export const getTrustedEndpointIdentityScope = (
  inspection: EndpointInspection,
): EndpointIdentityScopeInput | null =>
  getTrustedEndpointIdentityScopeInput(inspection);

export class EndpointWriteBlockedError extends Error {
  readonly code:
    | "endpoint_identity_mismatch"
    | "endpoint_identity_changed"
    | "endpoint_identity_conflict"
    | "endpoint_identity_unverified"
    | "endpoint_unreachable";

  readonly inspection: EndpointInspection;

  constructor(inspection: EndpointInspection) {
    const code =
      inspection.diagnostic.code === "endpoint_identity_matched"
        ? "endpoint_identity_unverified"
        : inspection.diagnostic.code;
    super(`[${code}] ${inspection.diagnostic.message}`);
    this.name = "EndpointWriteBlockedError";
    this.code = code;
    this.inspection = inspection;
  }
}

export class EndpointFeatureUnsupportedError extends Error {
  readonly code = "endpoint_feature_unsupported";
  readonly feature: EndpointFeature;
  readonly inspection: EndpointInspection;

  constructor(inspection: EndpointInspection, feature: EndpointFeature) {
    const availability = inspection.features[feature];
    const missing = availability.missingOperations.join(", ");
    super(
      `[endpoint_feature_unsupported] Endpoint does not advertise the required ${feature} write operations${missing ? `: ${missing}` : "."}`,
    );
    this.name = "EndpointFeatureUnsupportedError";
    this.feature = feature;
    this.inspection = inspection;
  }
}

export class EndpointFeatureOperationUnsupportedError extends Error {
  readonly code = "endpoint_feature_operation_unsupported";
  readonly feature: EndpointFeature;
  readonly operation: string;
  readonly inspection: EndpointInspection;

  constructor(
    inspection: EndpointInspection,
    feature: EndpointFeature,
    operation: string,
  ) {
    super(
      `[endpoint_feature_operation_unsupported] Endpoint does not advertise ${operation} for ${feature}.`,
    );
    this.name = "EndpointFeatureOperationUnsupportedError";
    this.feature = feature;
    this.operation = operation;
    this.inspection = inspection;
  }
}

export const assertEndpointFeatureOperationSupported = (
  inspection: EndpointInspection,
  feature: EndpointFeature,
  operation: string,
): void => {
  if (!isEndpointFeatureOperationSupported(inspection, feature, operation)) {
    throw new EndpointFeatureOperationUnsupportedError(
      inspection,
      feature,
      operation,
    );
  }
};

export const assertEndpointFeatureSupported = (
  inspection: EndpointInspection,
  feature: EndpointFeature,
): void => {
  if (!inspection.features[feature].supported) {
    throw new EndpointFeatureUnsupportedError(inspection, feature);
  }
};

export const assertEndpointWriteAuthorized = async (
  input: EndpointNetworkContext,
  options: EndpointInspectorOptions,
): Promise<EndpointInspection> => {
  const inspection = await inspectEndpoint(input, options);
  if (inspection.identityStatus !== "matched") {
    throw new EndpointWriteBlockedError(inspection);
  }
  return inspection;
};

export const assertEndpointFaucetChallengeAvailable = async (
  input: EndpointNetworkContext,
  options: EndpointInspectorOptions,
): Promise<EndpointInspection> => {
  const inspection = await inspectEndpoint(input, options);
  if (
    (inspection.identityStatus !== "matched" &&
      inspection.identityStatus !== "unverified") ||
    !inspection.observed?.networkId
  ) {
    throw new EndpointWriteBlockedError(inspection);
  }
  if (!canAttemptFaucetIdentityChallenge(inspection)) {
    throw new EndpointFeatureUnsupportedError(inspection, "faucetClaim");
  }
  return inspection;
};
