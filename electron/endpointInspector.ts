import { parseGovernanceCapabilitiesV1 } from "./governanceCapabilities";
import { parseRetryAfterMs, withBoundedHttpGetRetry } from "./httpReadRetry";
import { nodeFetch } from "./nodeFetch";
import {
  normalizeChainMetadata,
  parseFirstReleaseChainMetadataPayload,
} from "../src/utils/chainMetadata";
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
} from "../src/types/endpointInspection";
import {
  getTrustedEndpointIdentityScopeInput,
  type EndpointIdentityScopeInput,
} from "../src/utils/endpointScope";
import { readBoundedJsonResponse } from "./boundedJsonResponse";
import {
  TAIRA_CHAIN_ID,
  TAIRA_GENESIS_HASH,
  TAIRA_NETWORK_PREFIX,
  TAIRA_TORII_URL,
} from "../src/utils/firstReleaseNetworkIdentity";

type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => Promise<Response>;

type EndpointInspectorOptions = {
  fetchImpl?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
};

type ProbeResult = {
  reachedEndpoint: boolean;
  evidence: EndpointIdentityEvidence[];
  openApiOperations?: string[];
};

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 60_000;
const ENDPOINT_PROBE_CONCURRENCY = 2;
const MAX_ENDPOINT_INSPECTION_JSON_BYTES = 4 * 1024 * 1024;
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

const FIRST_RELEASE_WRITE_PROFILES = Object.freeze([
  Object.freeze({
    toriiUrl: TAIRA_TORII_URL,
    chainId: TAIRA_CHAIN_ID,
    networkPrefix: TAIRA_NETWORK_PREFIX,
    genesisHash: TAIRA_GENESIS_HASH,
  }),
]);

const getPinnedFirstReleaseWriteProfile = (
  toriiUrl: string,
  expected: EndpointChainIdentity,
): (typeof FIRST_RELEASE_WRITE_PROFILES)[number] | null =>
  FIRST_RELEASE_WRITE_PROFILES.find(
    (profile) =>
      toriiUrl === profile.toriiUrl &&
      expected.chainId === profile.chainId &&
      expected.networkPrefix === profile.networkPrefix,
  ) ?? null;

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
    "GET /v1/accounts/faucet/puzzle",
    "POST /v1/accounts/faucet",
    "GET /v1/sumeragi/status",
    ...FINALIZED_TRANSACTION_EVIDENCE_OPERATIONS,
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

// This is a deny-only fingerprint for the archived deployment currently served
// by the public Taira hostname. It must never be used to authorize a write.
const BLOCKED_DEPLOYMENT_FINGERPRINTS: ReadonlyArray<{
  genesisHash: string;
  identity: EndpointChainIdentity;
}> = [
  {
    genesisHash:
      "cc62233ac63ec4131207a35c28b84d5fb22f0c954bd7b2d0f2edc50541117121",
    identity: {
      chainId: "809574f5-fee7-5e69-bfcf-52451e42d50f",
      networkPrefix: 369,
      genesisHash:
        "cc62233ac63ec4131207a35c28b84d5fb22f0c954bd7b2d0f2edc50541117121",
    },
  },
];

const readCanonicalHash = (value: unknown): string | null =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value) ? value : null;

const readHeaderIdentity = (
  response: Response,
): EndpointChainIdentity | null => {
  const chainId = response.headers.get("x-iroha-chain-id");
  const networkPrefixLiteral = response.headers.get("x-iroha-network-prefix");
  if (
    chainId === null ||
    networkPrefixLiteral === null ||
    !/^(?:0|[1-9]\d{0,4})$/u.test(networkPrefixLiteral)
  ) {
    return null;
  }
  try {
    return normalizeChainMetadata({
      chainId,
      networkPrefix: Number(networkPrefixLiteral),
    });
  } catch {
    return null;
  }
};

const evidenceFor = (
  source: EndpointIdentityEvidence["source"],
  identity: EndpointChainIdentity,
  observedAtMs: number,
): EndpointIdentityEvidence => ({
  source,
  identity,
  observedAtMs,
});

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

const runEndpointProbes = async (
  probes: Array<() => Promise<ProbeResult>>,
): Promise<ProbeResult[]> => {
  const results = new Array<ProbeResult>(probes.length);
  let nextProbe = 0;
  const worker = async () => {
    while (nextProbe < probes.length) {
      const index = nextProbe;
      nextProbe += 1;
      results[index] = await probes[index]();
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(ENDPOINT_PROBE_CONCURRENCY, probes.length) },
      () => worker(),
    ),
  );
  return results;
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
      return { reachedEndpoint: true, evidence: [] };
    }
    return {
      reachedEndpoint: true,
      evidence: [],
      openApiOperations: readOpenApiOperations(
        await parseJsonResponse(response),
      ),
    };
  } catch {
    return { reachedEndpoint: false, evidence: [] };
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

const probeGovernanceCapabilities = async (
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  observedAtMs: number,
): Promise<ProbeResult> => {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/v1/gov/capabilities`,
      timeoutMs,
    );
  } catch {
    return { reachedEndpoint: false, evidence: [] };
  }
  if (!response.ok) {
    return { reachedEndpoint: true, evidence: [] };
  }
  try {
    const payload = await parseJsonResponse(response);
    const capabilities = parseGovernanceCapabilitiesV1(payload);
    return {
      reachedEndpoint: true,
      evidence: [
        evidenceFor(
          "governance-capabilities-v1",
          {
            chainId: TAIRA_CHAIN_ID,
            networkPrefix: capabilities.networkPrefix,
            genesisHash: TAIRA_GENESIS_HASH,
          },
          observedAtMs,
        ),
      ],
    };
  } catch {
    return { reachedEndpoint: true, evidence: [] };
  }
};

const probeChainMetadata = async (
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  observedAtMs: number,
): Promise<ProbeResult> => {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/v1/chain/metadata`,
      timeoutMs,
    );
    const evidence: EndpointIdentityEvidence[] = [];
    const headerIdentity = readHeaderIdentity(response);
    if (headerIdentity) {
      evidence.push(
        evidenceFor("response-headers", headerIdentity, observedAtMs),
      );
    }
    if (response.ok) {
      const payload = await parseJsonResponse(response);
      try {
        const payloadIdentity = parseFirstReleaseChainMetadataPayload(payload);
        evidence.push(
          evidenceFor("chain-metadata", payloadIdentity, observedAtMs),
        );
      } catch {
        // Invalid or drifted metadata is not identity evidence.
      }
    }
    return { reachedEndpoint: true, evidence };
  } catch {
    return { reachedEndpoint: false, evidence: [] };
  }
};

const probeGenesisFingerprint = async (
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  observedAtMs: number,
  pinnedWriteProfile: (typeof FIRST_RELEASE_WRITE_PROFILES)[number] | null,
): Promise<ProbeResult> => {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/v1/explorer/blocks/1`,
      timeoutMs,
    );
    if (!response.ok) {
      return { reachedEndpoint: true, evidence: [] };
    }
    const payload = await parseJsonResponse(response);
    const record =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null;
    const genesisHash = readCanonicalHash(record?.hash);
    const blocked = BLOCKED_DEPLOYMENT_FINGERPRINTS.find(
      (entry) => entry.genesisHash === genesisHash,
    );
    const identity = blocked
      ? blocked.identity
      : genesisHash && pinnedWriteProfile
        ? {
            chainId: pinnedWriteProfile.chainId,
            networkPrefix: pinnedWriteProfile.networkPrefix,
            genesisHash,
          }
        : null;
    return {
      reachedEndpoint: true,
      evidence: identity
        ? [
            evidenceFor(
              blocked
                ? "blocked-deployment-fingerprint"
                : "genesis-fingerprint",
              identity,
              observedAtMs,
            ),
          ]
        : [],
    };
  } catch {
    return { reachedEndpoint: false, evidence: [] };
  }
};

const identitiesConflict = (evidence: EndpointIdentityEvidence[]) => {
  if (evidence.length < 2) {
    return false;
  }
  const first = evidence[0].identity;
  return evidence.slice(1).some(({ identity }) => {
    if (
      identity.chainId !== first.chainId ||
      identity.networkPrefix !== first.networkPrefix
    ) {
      return true;
    }
    return Boolean(
      identity.genesisHash &&
        first.genesisHash &&
        identity.genesisHash !== first.genesisHash,
    );
  });
};

const diagnosticFor = (input: {
  status: EndpointInspection["identityStatus"];
  expected: EndpointChainIdentity;
  observed: EndpointChainIdentity | null;
  pinnedWriteProfile: boolean;
}): EndpointDiagnostic => {
  switch (input.status) {
    case "matched":
      return {
        code: "endpoint_identity_matched",
        message: "Endpoint identity matches the configured network.",
      };
    case "mismatched":
      return {
        code: "endpoint_identity_mismatch",
        message: `Endpoint reports chain "${input.observed?.chainId ?? "unknown"}" with network prefix "${input.observed?.networkPrefix ?? "unknown"}", but the wallet is configured for chain "${input.expected.chainId}" with network prefix "${input.expected.networkPrefix}". Reads remain available; writes are blocked.`,
      };
    case "blocked":
      return {
        code: "endpoint_deployment_blocked",
        message:
          "This endpoint is a known archived deployment. Reads remain available; writes are blocked even when its archived identity is selected.",
      };
    case "conflicting":
      return {
        code: "endpoint_identity_conflict",
        message:
          "Endpoint identity sources disagree. Reads remain available; writes are blocked.",
      };
    case "unverified":
      return {
        code: "endpoint_identity_unverified",
        message: input.pinnedWriteProfile
          ? "Endpoint did not provide an exact matching chain identity projection. Reads remain available; writes are blocked."
          : "This endpoint is not a release-pinned write target. Reads remain available; writes are blocked even if the endpoint self-reports the configured chain identity.",
      };
    case "unreachable":
      return {
        code: "endpoint_unreachable",
        message:
          "Endpoint identity could not be checked because the endpoint is unreachable.",
      };
  }
};

export const inspectEndpoint = async (
  input: EndpointNetworkContext,
  options: EndpointInspectorOptions = {},
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
  const pinnedWriteProfile = getPinnedFirstReleaseWriteProfile(
    toriiUrl,
    configuredExpected,
  );
  const expected: EndpointChainIdentity = pinnedWriteProfile
    ? {
        ...configuredExpected,
        genesisHash: pinnedWriteProfile.genesisHash,
      }
    : configuredExpected;

  const results = await runEndpointProbes([
    () =>
      probeGovernanceCapabilities(toriiUrl, fetchImpl, timeoutMs, observedAtMs),
    () => probeChainMetadata(toriiUrl, fetchImpl, timeoutMs, observedAtMs),
    () =>
      probeGenesisFingerprint(
        toriiUrl,
        fetchImpl,
        timeoutMs,
        observedAtMs,
        pinnedWriteProfile,
      ),
    () => probeOpenApi(toriiUrl, fetchImpl, timeoutMs),
  ]);

  const reachedEndpoint = results.some((result) => result.reachedEndpoint);
  const evidence = results.flatMap((result) => result.evidence);
  const hasBlockedDeploymentIdentity = evidence.some((entry) =>
    BLOCKED_DEPLOYMENT_FINGERPRINTS.some(
      (blocked) =>
        blocked.identity.chainId === entry.identity.chainId &&
        blocked.identity.networkPrefix === entry.identity.networkPrefix,
    ),
  );
  const hasAuthoritativeIdentity = evidence.some(
    (entry) =>
      entry.source === "governance-capabilities-v1" ||
      entry.source === "chain-metadata",
  );
  const openApiOperations =
    results.find((result) => result.openApiOperations !== undefined)
      ?.openApiOperations ?? null;

  const observedGenesisHash = evidence.find(
    (entry) => entry.identity.genesisHash,
  )?.identity.genesisHash;
  let observed: EndpointChainIdentity | null = evidence[0]
    ? {
        ...evidence[0].identity,
        ...(observedGenesisHash ? { genesisHash: observedGenesisHash } : {}),
      }
    : null;
  let identityStatus: EndpointInspection["identityStatus"];
  if (!reachedEndpoint) {
    observed = null;
    identityStatus = "unreachable";
  } else if (identitiesConflict(evidence)) {
    identityStatus = "conflicting";
  } else if (!observed) {
    identityStatus = "unverified";
  } else {
    const chainIdentityMatches =
      expected.chainId === observed.chainId &&
      expected.networkPrefix === observed.networkPrefix;
    const observedGenesisConflicts = Boolean(
      expected.genesisHash &&
        observed.genesisHash &&
        expected.genesisHash !== observed.genesisHash,
    );
    // The governance NetworkId remains useful identity evidence, but release
    // write authorization also requires a direct canonical block-one read.
    const exactPinnedGenesisObserved = Boolean(
      pinnedWriteProfile &&
        evidence.some(
          (entry) =>
            entry.source === "genesis-fingerprint" &&
            entry.identity.genesisHash === pinnedWriteProfile.genesisHash,
        ),
    );
    if (!chainIdentityMatches || observedGenesisConflicts) {
      identityStatus = "mismatched";
    } else if (hasBlockedDeploymentIdentity) {
      identityStatus = "blocked";
    } else if (
      hasAuthoritativeIdentity &&
      pinnedWriteProfile &&
      exactPinnedGenesisObserved
    ) {
      identityStatus = "matched";
    } else {
      identityStatus = "unverified";
    }
  }

  return {
    schema: "iroha.wallet.endpoint-inspection.v1",
    toriiUrl,
    expected,
    observed,
    identityStatus,
    accessMode:
      identityStatus === "matched"
        ? "read-write"
        : identityStatus === "unreachable"
          ? "offline"
          : "read-only",
    checkedAtMs: observedAtMs,
    evidence,
    features: featureMapFor(openApiOperations),
    diagnostic: diagnosticFor({
      status: identityStatus,
      expected,
      observed,
      pinnedWriteProfile: pinnedWriteProfile !== null,
    }),
  };
};

export const getTrustedEndpointIdentityScope = (
  inspection: EndpointInspection,
): EndpointIdentityScopeInput | null =>
  getTrustedEndpointIdentityScopeInput(inspection);

export class EndpointWriteBlockedError extends Error {
  readonly code:
    | "endpoint_identity_mismatch"
    | "endpoint_deployment_blocked"
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
  options: EndpointInspectorOptions = {},
): Promise<EndpointInspection> => {
  const inspection = await inspectEndpoint(input, options);
  if (inspection.identityStatus !== "matched") {
    throw new EndpointWriteBlockedError(inspection);
  }
  return inspection;
};

export const assertEndpointFaucetChallengeAvailable = async (
  input: EndpointNetworkContext,
  options: EndpointInspectorOptions = {},
): Promise<EndpointInspection> => {
  const inspection = await inspectEndpoint(input, options);
  if (
    inspection.identityStatus !== "matched" &&
    inspection.identityStatus !== "unverified"
  ) {
    throw new EndpointWriteBlockedError(inspection);
  }
  if (!canAttemptFaucetIdentityChallenge(inspection)) {
    throw new EndpointFeatureUnsupportedError(inspection, "faucetClaim");
  }
  return inspection;
};
